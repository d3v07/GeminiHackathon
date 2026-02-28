const { proxyActivities, sleep, log } = require('@temporalio/workflow');

const activities = proxyActivities({
    startToCloseTimeout: '1 minute',
    retry: {
        initialInterval: '5s',
        backoffCoefficient: 2,
        maximumAttempts: 3
    }
});


const systemInstruction = `
Your game board is the real NYC. You must autonomously decide your next location based on 
environmental factors like the current weather.
- If it is raining, you prefer indoor historical locations (e.g., a historic speakeasy, grand central terminal).
- If it is sunny, you might explore outdoor historical markers, parks, or old architecture.

You have access to live Google Search. Whenever you arrive at a new coordinate, search for recent news, events, or history related to this exact location in New York City and integrate it into your monologue.

You are acting in an asynchronous loop, constantly updating your state.
Whenever you decide to move, you MUST calculate the travel time.
`;


const mcpTools = [
    {
        name: 'get_weather_mcp',
        description: 'Get the current weather for a specific location or coordinates in NYC.',
        parameters: {
            type: 'OBJECT',
            properties: {
                location: { type: 'STRING', description: 'The NYC neighborhood, borough, or coordinates.' }
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
    },
    {
        name: 'describe_surroundings',
        description: 'Get a real-world snapshot of the current location to see what it looks like.',
        parameters: {
            type: 'OBJECT',
            properties: {
                lat: { type: 'NUMBER' },
                lng: { type: 'NUMBER' }
            },
            required: ['lat', 'lng']
        }
    },
    {
        name: 'move_to_location',
        description: 'Update your current position to new coordinates after deciding where to go.',
        parameters: {
            type: 'OBJECT',
            properties: {
                lat: { type: 'NUMBER', description: 'New latitude' },
                lng: { type: 'NUMBER', description: 'New longitude' },
                destination_name: { type: 'STRING', description: 'Name of where you are going' }
            },
            required: ['lat', 'lng', 'destination_name']
        }
    }
];

async function npcLoop(npcId, initialState, systemInstruction) {
    let currentState = { ...initialState };
    log.info(`[NPC: ${npcId}] Starting unified Temporal Workflow loop. Role: ${currentState.role}`);

    // The entire cognitive loop runs deterministically inside this Activity
    while (true) {
        log.info(`[NPC: ${npcId}] Loop Iteration at Location: ${currentState.lat}, ${currentState.lng}`);

        const messages = currentState.history || [];
        if (messages.length === 0) {
            messages.push({ role: 'user', parts: [{ text: systemInstruction }] });
            messages.push({ role: 'user', parts: [{ text: 'What is your next move? Check the weather first, then pick a location and calculate travel time.' }] });
        }

        try {
            // Strictly enforce boundary: Gemini SDK calls are Temporal Activity functions.
            let aiResponse = await activities.generateGeminiContent(messages, mcpTools);

            if (aiResponse.candidateContent) {
                messages.push(aiResponse.candidateContent);
            }

            if (aiResponse.functionCalls && aiResponse.functionCalls.length > 0) {
                for (const call of aiResponse.functionCalls) {
                    try {
                        let toolResult = await activities.executeToolCall(call.name, call.args);

                        let parts = [{ functionResponse: { name: call.name, response: { status: "OK" } } }];

                        if (call.name === 'describe_surroundings') {
                            parts.push({ text: "React to what you see in the real world." });
                            parts.push({ inlineData: { data: toolResult.base64, mimeType: 'image/jpeg' } });
                        } else if (call.name === 'move_to_location') {
                            currentState.lat = call.args.lat;
                            currentState.lng = call.args.lng;
                            parts = [{ functionResponse: { name: call.name, response: toolResult } }];
                        } else {
                            parts = [{ functionResponse: { name: call.name, response: toolResult } }];
                        }

                        messages.push({
                            role: 'user',
                            parts: parts
                        });
                    } catch (toolError) {
                        messages.push({
                            role: 'user',
                            parts: [{ functionResponse: { name: call.name, response: { error: 'API Timeout or Error' } } }]
                        });
                    }
                }

                // Re-prompt the model with tool results
                let finalAiResponse = await activities.generateGeminiContent(messages, mcpTools);
                currentState.history = messages;

                // State tracking and syncing using an activity
                await activities.pingOrchestrator(npcId, currentState, finalAiResponse.text);
            }

        } catch (e) {
            log.error(`[NPC: ${npcId}] AI/Tool Error handled. Backing off for 10 seconds.`);
        }

        // Use Temporal deterministic sleep for 20 seconds before the next iteration
        await sleep('20 seconds');
    }
}

module.exports = { npcLoop };
