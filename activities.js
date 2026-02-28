require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleGenAI } = require('@google/genai');
const { PubSub } = require('@google-cloud/pubsub');
const admin = require('firebase-admin');

const fs = require('fs');

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
try {
    const envLocal = fs.readFileSync('./orchestrator/.env.local', 'utf8');
    const match = envLocal.match(/FIREBASE_PRIVATE_KEY="([^"]+)"/);
    if (match) privateKey = match[1];
} catch (e) { }

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
const pubsub = new PubSub();

async function executeToolCall(name, args) {
    if (name === 'get_weather_mcp') {
        try {
            // Use OpenWeatherMap (Task 2)
            const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=40.7128&lon=-74.0060&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
            const weatherData = await weatherRes.json();
            const current = weatherData;

            // Map code to human readable
            const isRaining = current.weather?.length > 0 && current.weather[0].main.toLowerCase().includes('rain');
            return {
                weather: isRaining ? "Raining" : "Clear",
                temperature: `${current.main.temp}C`,
                windspeed: current.wind.speed,
                status: "OK"
            };
        } catch (e) {
            console.error("Weather API Error:", e);
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
                return { estimated_minutes: Math.ceil(seconds / 60), status: "OK" };
            } else {
                return { error: "No route found.", response: data };
            }
        } catch (e) {
            console.error("Google Maps API Error:", e);
            throw new Error('API Timeout or Error');
        }
    } else if (name === 'describe_surroundings') {
        try {
            const url = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${args.lat},${args.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
            const res = await fetch(url);
            const buffer = await res.arrayBuffer();
            return { base64: Buffer.from(buffer).toString('base64') };
        } catch (e) {
            console.error("StreetView fetch error:", e);
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
            console.error("Places API error:", e);
            throw new Error('API Timeout or Error');
        }
    } else if (name === 'move_to_location') {
        // This tool is used to formally register the move in the state
        return { status: "SUCCESS", lat: args.lat, lng: args.lng, destination: args.destination_name };
    }
    return { error: "Unknown tool" };
}

async function generateGeminiContent(messages, mcpTools) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
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

        return parsedResponse;
    } catch (e) {
        console.error("Gemini AI Error:", e);
        throw e;
    }
}

async function pingOrchestrator(npcId, currentState, currentAction) {
    try {
        const topic = pubsub.topic('agent-updates');
        const payload = JSON.stringify({
            agentId: npcId,
            lat: currentState.lat,
            lng: currentState.lng,
            defaultTask: currentAction,
            memoryContext: JSON.stringify(currentState.history?.slice(-2) || [])
        });

        await topic.publishMessage({ data: Buffer.from(payload) });
        console.log(`[NPC: ${npcId}] Published update to Pub/Sub 'agent-updates'`);

        // Polling Firestore for interaction status set by Orchestrator
        try {
            const agentDoc = await db.collection('agents').doc(npcId).get();
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
            console.error("Firestore poll error:", dbErr.message);
        }

        return { success: true, isInteracting: false };
    } catch (e) {
        console.error(`[NPC: ${npcId}] Failed to publish to Pub/Sub:`, e.message);
        return { success: false, error: e.message };
    }
}

async function generateEncounterDialogue(agentA_state, agentB_state) {
    console.log(`\n--- TEMPORAL ENCOUNTER DETECTED ---`);
    console.log(`NPC A (${agentA_state.role}) meets NPC B (${agentB_state.role})`);

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
            model: 'gemini-2.0-flash',
            contents: { role: 'user', parts: [{ text: collisionPrompt }] },
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const textResponse = response.text || "";

        console.log(`\n[Multi-Agent Dialogue]\n${textResponse}`);

        // Publish to Pub/Sub 'agent-encounters' topic
        const topic = pubsub.topic('agent-encounters');
        const payload = JSON.stringify({
            participants: [agentA_state.agentId || agentA_state.role, agentB_state.agentId || agentB_state.role],
            transcript: textResponse,
            lat: agentA_state.lat,
            lng: agentA_state.lng,
            timestamp: new Date().toISOString()
        });
        await topic.publishMessage({ data: Buffer.from(payload) });
        console.log('Published encounter dialogue to Pub/Sub agent-encounters');

        return textResponse; // Not strictly needed, Temporal uses orchestrator API anyway
    } catch (e) {
        console.error("Error during durable multi-agent interaction:", e);
        throw e;
    }
}

module.exports = {
    executeToolCall,
    generateGeminiContent,
    pingOrchestrator,
    generateEncounterDialogue
};
