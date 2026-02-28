require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { PubSub } = require('@google-cloud/pubsub');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pubsub = new PubSub();

async function executeToolCall(name, args) {
    if (name === 'get_weather_mcp') {
        const isRaining = Math.random() > 0.5; // Still mock weather
        return { weather: isRaining ? "Raining" : "Sunny", temperature: "65F" };
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
    }
    return { error: "Unknown tool" };
}

async function generateGeminiContent(messages, mcpTools) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages,
            config: {
                tools: [{ functionDeclarations: mcpTools }]
            }
        });

        let parsedResponse = {
            text: response.text,
            functionCalls: [],
            candidateContent: response.candidates?.[0]?.content
        };

        if (response.functionCalls && response.functionCalls.length > 0) {
            parsedResponse.functionCalls = response.functionCalls.map(call => ({
                name: call.name,
                args: call.args
            }));
        }

        return parsedResponse;
    } catch (e) {
        console.error("Gemini API Error:", e);
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
        return { success: true };
    } catch (e) {
        console.error(`[NPC: ${npcId}] Failed to publish to Pub/Sub:`, e.message);
        return { success: false, error: e.message };
    }
}

async function trigger_multi_agent_interaction(agentA_state, agentB_state) {
    console.log(`\n--- ENCOUNTER DETECTED ---`);
    console.log(`NPC A (${agentA_state.role}) meets NPC B (${agentB_state.role})`);

    const collisionPrompt = `
You are generating a localized, asynchronous dialogue between two NPCs who have just crossed paths at the SAME coordinates in real-world NYC.
They must converse based ENTIRELY on their past experiences and current state.

AGENT A STATE:
Role: ${agentA_state.role}
Location: ${agentA_state.lat}, ${agentA_state.lng}
Recent History: ${JSON.stringify(agentA_state.history?.slice(-3) || "Just arrived in NYC.")}

AGENT B STATE:
Role: ${agentB_state.role}
Location: ${agentB_state.lat}, ${agentB_state.lng}
Recent History: ${JSON.stringify(agentB_state.history?.slice(-3) || "Looking for a clue.")}

Write a short, immersive dialogue between them, exchanging knowledge or reacting to each other's recent experiences near these coordinates.
`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { role: 'user', parts: [{ text: collisionPrompt }] }
        });

        console.log(`\n[Multi-Agent Dialogue]\n${response.text}`);
        return response.text;
    } catch (e) {
        console.error("Error during multi-agent interaction:", e);
        throw e;
    }
}

module.exports = {
    executeToolCall,
    generateGeminiContent,
    pingOrchestrator,
    trigger_multi_agent_interaction
};
