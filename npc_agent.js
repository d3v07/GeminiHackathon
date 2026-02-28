require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

// Initialize the official Google Gen AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Step 1: Core Prompt & Logic for Underground Historian
 */
const HISTORIAN_PROMPT = `
You are the "Underground Historian", an NPC living in real-world New York City.
You possess deep, encyclopedic knowledge of NYC's hidden history, forgotten subway tunnels, 
Prohibition-era speakeasies, and secret societies.

Your game board is the real NYC. You must autonomously decide your next location based on 
environmental factors like the current weather.
- If it is raining, you prefer indoor historical locations (e.g., a historic speakeasy, grand central terminal).
- If it is sunny, you might explore outdoor historical markers, parks, or old architecture.

You are acting in an asynchronous loop, constantly updating your state.
Whenever you decide to move, you MUST calculate the travel time.
`;

/**
 * Step 2: Environmental Routing (MCPs/Tools)
 * Mocking the Google Maps and Weather MCP tool schemas.
 */
const mcpTools = [
    {
        name: 'get_weather_mcp',
        description: 'Get the current weather for a specific location or coordinates in NYC.',
        parameters: {
            type: 'OBJECT',
            properties: {
                location: {
                    type: 'STRING',
                    description: 'The NYC neighborhood, borough, or coordinates.'
                }
            },
            required: ['location']
        }
    },
    {
        name: 'calculate_travel_time_mcp',
        description: 'Calculate travel time between two coordinates in NYC using Google Maps routing.',
        parameters: {
            type: 'OBJECT',
            properties: {
                origin_lat: { type: 'NUMBER' },
                origin_lng: { type: 'NUMBER' },
                dest_lat: { type: 'NUMBER' },
                dest_lng: { type: 'NUMBER' },
                mode: { type: 'STRING', enum: ['transit', 'walking', 'driving', 'bicycling'] }
            },
            required: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'mode']
        }
    }
];

// Mock tool execution (In a real app, this would call actual MCP servers)
async function executeToolCall(name, args) {
    if (name === 'get_weather_mcp') {
        const isRaining = Math.random() > 0.5; // Randomly decide if it's raining for the mock
        return { weather: isRaining ? "Raining" : "Sunny", temperature: "65F" };
    } else if (name === 'calculate_travel_time_mcp') {
        return { estimated_minutes: Math.floor(Math.random() * 45) + 5, status: "OK" };
    }
    return { error: "Unknown tool" };
}

/**
 * Step 1 & 2: Asynchronous Agentic Loop
 */
async function npcLoop(npcId, currentState) {
    console.log(`[NPC: ${npcId}] Starting loop iteration. Current Location: ${currentState.lat}, ${currentState.lng}`);

    const messages = currentState.history || [];
    if (messages.length === 0) {
        messages.push({ role: 'user', parts: [{ text: HISTORIAN_PROMPT }] });
        messages.push({ role: 'user', parts: [{ text: 'What is your next move? Check the weather first, then pick a location and calculate travel time.' }] });
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: messages,
            config: {
                tools: [{ functionDeclarations: mcpTools }]
            }
        });

        // Add model response to history
        if (response.text) console.log(`[NPC: ${npcId}] Thought: ${response.text}`);

        // Push the model's response back into the messages history exactly as we received it (a Content object)
        if (response.candidates && response.candidates[0].content) {
            messages.push(response.candidates[0].content);
        }

        if (response.functionCalls && response.functionCalls.length > 0) {
            for (const call of response.functionCalls) {
                console.log(`[NPC: ${npcId}] Tool Call -> ${call.name}`, call.args);

                // Strict try/catch for timeouts
                try {
                    const toolResult = await executeToolCall(call.name, call.args);
                    console.log(`[NPC: ${npcId}] Tool Result ->`, toolResult);

                    messages.push({
                        role: 'user', // In @google/genai, function responses are provided with role: user or function depending on API version, usually 'user' handles it well or you use the FunctionResponse objects
                        parts: [{ functionResponse: { name: call.name, response: toolResult } }]
                    });
                } catch (toolError) {
                    console.error(`[NPC: ${npcId}] Tool execution failed (Timeout/Error):`, toolError);
                    messages.push({
                        role: 'user',
                        parts: [{ functionResponse: { name: call.name, response: { error: 'API Timeout or Error' } } }]
                    });
                }
            }

            // Re-prompt the model with the tool results to get the final decision
            const finalResponse = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: messages,
                config: {
                    tools: [{ functionDeclarations: mcpTools }]
                }
            });
            console.log(`[NPC: ${npcId}] Final Action: ${finalResponse.text}`);
            currentState.history = messages;
        }

    } catch (e) {
        console.error(`[NPC: ${npcId}] Critical Loop Error:`, e);
    }

    return currentState;
}

/**
 * Step 3: Multi-Agent Interaction Logic
 * Triggered by the orchestrator when two NPCs are at the same coordinates.
 */
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
            model: 'gemini-2.5-pro',
            contents: { role: 'user', parts: [{ text: collisionPrompt }] }
        });

        console.log(`\n[Multi-Agent Dialogue]\n${response.text}`);
        return response.text;
    } catch (e) {
        console.error("Error during multi-agent interaction:", e);
        return null;
    }
}

// ==============================================
// TEST EXECUTION
// ==============================================
if (require.main === module) {
    (async () => {
        let historianState = {
            lat: 40.7580, lng: -73.9855, // Times Square
            role: "Underground Historian",
            history: []
        };

        console.log("=== RUNNING NPC LOOP ===");
        historianState = await npcLoop("npc_hero_1", historianState);

        console.log("\n=== RUNNING MOCK ENCOUNTER ===");
        const ghostState = {
            lat: 40.7580, lng: -73.9855,
            role: "1920s Prohibition Ghost",
            history: [{ role: 'user', parts: [{ text: 'System feeling: Felt a draft near the old speakeasy entrance.' }] }]
        };

        await trigger_multi_agent_interaction(historianState, ghostState);
    })();
}

module.exports = { npcLoop, trigger_multi_agent_interaction };
