require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');
const { runCognitiveStep } = require('./lib/cognitive-graph');
const { handleEncounter } = require('./lib/encounter');
const { publishTelemetry } = require('./lib/telemetry');
const { encode: geohashEncode, queryNearbyAgents } = require('./lib/geohash');
const { selectModel, MODELS } = require('./lib/model-router');
const logger = require('./lib/logger').child({ service: 'worker' });
const { toolCalls, toolErrors, geminiTokens, geminiCalls } = require('./lib/metrics');
const { calculateCost } = require('./lib/cost');

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey.replace(/\\n/g, '\n')
        })
    });
}
const db = admin.firestore();

// Initialize Vertex AI
const vertexAI = new VertexAI({ project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, location: 'us-central1' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Budget guard: track per-agent cumulative cost
const agentCosts = new Map(); // agentId -> { total, windowStart }
const COST_LIMIT = parseFloat(process.env.AGENT_COST_LIMIT_HOURLY || '0.50');

function trackCost(agentId, cost) {
    const now = Date.now();
    const entry = agentCosts.get(agentId) || { total: 0, windowStart: now };
    if (now - entry.windowStart > 3_600_000) {
        entry.total = 0;
        entry.windowStart = now;
    }
    entry.total += cost;
    agentCosts.set(agentId, entry);
    if (entry.total >= COST_LIMIT) {
        logger.warn({ agentId, totalCost: entry.total, limit: COST_LIMIT }, 'Agent hourly cost limit reached');
        return true;
    }
    return false;
}

async function executeToolCall(name, args) {
    if (name === 'get_weather_mcp') {
        try {
            // Use OpenWeatherMap (Task 2)
            const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${args.lat}&lon=${args.lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
            const weatherData = await weatherRes.json();
            const current = weatherData;

            // Map code to human readable
            const isRaining = current.weather?.length > 0 && current.weather[0].main.toLowerCase().includes('rain');
            toolCalls.inc({ tool: name });
            return {
                weather: isRaining ? "Raining" : "Clear",
                temperature: `${current.main.temp}C`,
                windspeed: current.wind.speed,
                status: "OK"
            };
        } catch (e) {
            logger.error({ err: e, tool: name }, 'Weather API error');
            toolErrors.inc({ tool: name });
            return { weather: "Clear", temperature: "20C", error: "API Timeout" };
        }
    } else if (name === 'calculate_travel_time_mcp') {
        // Step 1: Live MCP Integration with Google Maps Routes API
        const travelModeMap = {
            'transit': 'TRANSIT',
            'walking': 'WALK',
            'driving': 'DRIVE',
            'bicycling': 'BICYCLE'
        };
        const travelMode = travelModeMap[args.mode.toLowerCase()] || 'TRANSIT';

        try {
            const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
                    'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
                },
                body: JSON.stringify({
                    origin: { location: { latLng: { latitude: args.origin_lat, longitude: args.origin_lng } } },
                    destination: { location: { latLng: { latitude: args.dest_lat, longitude: args.dest_lng } } },
                    travelMode: travelMode
                })
            });
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
                const durationString = data.routes[0].duration || "0s";
                const seconds = parseInt(durationString.replace('s', ''), 10);
                toolCalls.inc({ tool: name });
                return { estimated_minutes: Math.ceil(seconds / 60), status: "OK" };
            } else {
                return { error: "No route found.", response: data };
            }
        } catch (e) {
            logger.error({ err: e, tool: name }, 'Google Maps API error');
            toolErrors.inc({ tool: name });
            throw new Error('API Timeout or Error');
        }
    } else if (name === 'describe_surroundings') {
        try {
            const url = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${args.lat},${args.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
            const res = await fetch(url);
            const buffer = await res.arrayBuffer();
            toolCalls.inc({ tool: name });
            return { base64: Buffer.from(buffer).toString('base64') };
        } catch (e) {
            logger.error({ err: e, tool: name }, 'StreetView fetch error');
            toolErrors.inc({ tool: name });
            throw new Error('API Timeout or Error');
        }
    } else if (name === 'find_nearby_place_mcp') {
        try {
            const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating'
                },
                body: JSON.stringify({
                    includedTypes: [args.category],
                    maxResultCount: 1,
                    locationRestriction: {
                        circle: {
                            center: { latitude: args.lat, longitude: args.lng },
                            radius: 1000.0
                        }
                    }
                })
            });
            const data = await res.json();
            if (data.places && data.places.length > 0) {
                const place = data.places[0];
                toolCalls.inc({ tool: name });
                return {
                    name: place.displayName?.text,
                    address: place.formattedAddress,
                    lat: place.location?.latitude,
                    lng: place.location?.longitude,
                    rating: place.rating
                };
            }
            return { error: "No places found for category" };
        } catch (e) {
            logger.error({ err: e, tool: name }, 'Places API error');
            toolErrors.inc({ tool: name });
            throw new Error('API Timeout or Error');
        }
    } else if (name === 'scan_for_nearby_agents') {
        try {
            const nearbyAgents = await queryNearbyAgents(db, args.agentId || '', args.lat, args.lng, args.radiusMeters || 200);

            toolCalls.inc({ tool: name });
            if (nearbyAgents.length > 0) {
                return {
                    status: "SUCCESS",
                    message: `Found ${nearbyAgents.length} entities nearby. You can move to their coordinates to intercept them.`,
                    agents: nearbyAgents.slice(0, 5)
                };
            }
            return { status: "SUCCESS", message: "No other agents found within this radius. They might be in a different neighborhood." };
        } catch (e) {
            logger.error({ err: e, tool: name }, 'Scanner tool error');
            toolErrors.inc({ tool: name });
            throw new Error('API Timeout or Error');
        }
    } else if (name === 'move_to_location') {
        // This tool is used to formally register the move in the state
        toolCalls.inc({ tool: name });
        return { status: "SUCCESS", lat: args.lat, lng: args.lng, destination: args.destination_name };
    }
    return { error: "Unknown tool" };
}

async function generateGeminiContent(messages, mcpTools) {
    try {
        const response = await ai.models.generateContent({
            model: selectModel({ taskType: 'tool_calling' }),
            contents: messages,
            config: {
                tools: [{ functionDeclarations: mcpTools }]
            }
        });

        let parsedResponse = {
            text: response.candidates?.[0]?.content?.parts?.[0]?.text || "",
            functionCalls: [],
            candidateContent: response.candidates?.[0]?.content
        };

        const candidateParts = response.candidates?.[0]?.content?.parts || [];
        for (const part of candidateParts) {
            if (part.functionCall) {
                parsedResponse.functionCalls.push({
                    name: part.functionCall.name,
                    args: part.functionCall.args
                });
            }
            if (part.text) {
                parsedResponse.text = part.text;
            }
        }

        const usage = response.usageMetadata;
        if (usage) {
            const model = selectModel({ taskType: 'tool_calling' });
            geminiCalls.inc({ agent_id: 'unknown', model });
            geminiTokens.inc({ agent_id: 'unknown', model, direction: 'input' }, usage.promptTokenCount || 0);
            geminiTokens.inc({ agent_id: 'unknown', model, direction: 'output' }, usage.candidatesTokenCount || 0);
            const cost = calculateCost(model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
            trackCost('unknown', cost.totalCost);
            logger.info({ model, promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount, totalCost: cost.totalCost }, 'Gemini API usage');
        }

        return parsedResponse;
    } catch (e) {
        logger.error({ err: e }, 'Gemini AI error');
        throw e;
    }
}

async function pingOrchestrator(npcId, currentState, currentAction) {
    try {
        // PRIMARY: Write state directly to Firestore (already authenticated via Admin SDK)
        const agentRef = db.collection('agents').doc(npcId);
        await agentRef.set({
            agentId: npcId,
            lat: currentState.lat,
            lng: currentState.lng,
            geohash: geohashEncode(currentState.lat, currentState.lng, 7),
            role: currentState.role || '',
            defaultTask: currentAction,
            sentimentScore: currentState.sentimentScore || 0,
            memoryContext: JSON.stringify(currentState.history?.slice(-2) || []),
            lastUpdated: new Date().toISOString(),
            isInteracting: false
        }, { merge: true });
        logger.info({ npcId, lat: currentState.lat, lng: currentState.lng }, 'State persisted to Firestore');

        // Publish telemetry event (Pub/Sub if available, local buffer fallback)
        publishTelemetry(npcId, currentState, currentAction).catch(e =>
            logger.warn({ npcId, err: e }, 'Telemetry publish failed')
        );

        // Check for interaction status (cognitive collision detection)
        try {
            const agentDoc = await agentRef.get();
            if (agentDoc.exists) {
                const data = agentDoc.data();
                if (data.isInteracting && data.encounterWith) {
                    const otherDoc = await db.collection('agents').doc(data.encounterWith).get();
                    if (otherDoc.exists) {
                        return {
                            success: true,
                            isInteracting: true,
                            agentA_state: data,
                            agentB_state: otherDoc.data()
                        };
                    }
                }
            }
        } catch (dbErr) {
            logger.error({ err: dbErr, npcId }, 'Firestore poll error');
        }

        return { success: true, isInteracting: false };
    } catch (e) {
        logger.error({ err: e, npcId }, 'Failed to persist state');
        return { success: false, error: e.message };
    }
}

async function generateEncounterDialogue(agentA_state, agentB_state) {
    logger.info({ roleA: agentA_state.role, roleB: agentB_state.role }, 'Temporal encounter detected');

    const collisionPrompt = `
You are generating a localized, asynchronous dialogue between two NPCs who have just crossed paths at the SAME coordinates in real-world NYC.
They must converse based ENTIRELY on their past experiences and current state.

AGENT A STATE:
Role: ${agentA_state.role}
Location: ${agentA_state.lat}, ${agentA_state.lng}
Recent History: ${JSON.stringify(agentA_state.history || "Just arrived in NYC.")}

AGENT B STATE:
Role: ${agentB_state.role}
Location: ${agentB_state.lat}, ${agentB_state.lng}
Recent History: ${JSON.stringify(agentB_state.history || "Looking for a clue.")}

Write a short, immersive dialogue between them, exchanging knowledge or reacting to each other's recent experiences near these coordinates.
`;

    try {
        const response = await ai.models.generateContent({
            model: selectModel({ taskType: 'encounter' }),
            contents: { role: 'user', parts: [{ text: collisionPrompt }] },
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const textResponse = response.text || "";

        const usage = response.usageMetadata;
        if (usage) {
            const model = selectModel({ taskType: 'encounter' });
            geminiCalls.inc({ agent_id: 'encounter', model });
            geminiTokens.inc({ agent_id: 'encounter', model, direction: 'input' }, usage.promptTokenCount || 0);
            geminiTokens.inc({ agent_id: 'encounter', model, direction: 'output' }, usage.candidatesTokenCount || 0);
            const cost = calculateCost(model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
            trackCost('encounter', cost.totalCost);
            logger.info({ model, promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount, totalCost: cost.totalCost }, 'Encounter Gemini API usage');
        }

        logger.info({ dialogueLength: textResponse.length }, 'Multi-agent dialogue generated');

        return textResponse; // Not strictly needed, Temporal uses orchestrator API anyway
    } catch (e) {
        logger.error({ err: e }, 'Error during durable multi-agent interaction');
        throw e;
    }
}

async function cognitiveStep(npcId, currentState) {
    return runCognitiveStep(npcId, currentState, executeToolCall);
}

async function handleEncounterDialogue(agentA_state, agentB_state) {
    return handleEncounter(agentA_state, agentB_state);
}

module.exports = {
    executeToolCall,
    generateGeminiContent,
    pingOrchestrator,
    generateEncounterDialogue,
    cognitiveStep,
    handleEncounterDialogue,
};
