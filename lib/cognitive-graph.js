require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const { StateGraph, Annotation, START, END } = require('@langchain/langgraph');
const { createCheckpointer } = require('./checkpointer');
const { selectModel } = require('./model-router');
const { validateToolOutput } = require('./tool-schemas');
const { storeMemory, recallMemories } = require('./memory');
const { getRoutinePromptInjection } = require('./daily-routines');
const { GoogleGenAI } = require('@google/genai');
const logger = require('./logger').child({ module: 'cognitive-graph' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const checkpointer = createCheckpointer();

const mcpTools = [
    {
        name: 'get_weather_mcp',
        description: 'Get the current weather for a specific location or coordinates in NYC.',
        parameters: {
            type: 'OBJECT',
            properties: {
                lat: { type: 'NUMBER', description: 'Latitude' },
                lng: { type: 'NUMBER', description: 'Longitude' },
            },
            required: ['lat', 'lng']
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
    },
    {
        name: 'find_nearby_place_mcp',
        description: 'Find a real-world named place or landmark near a specific location.',
        parameters: {
            type: 'OBJECT',
            properties: {
                category: { type: 'STRING', description: 'Type of place (e.g., museum, park, cafe)' },
                lat: { type: 'NUMBER' },
                lng: { type: 'NUMBER' }
            },
            required: ['category', 'lat', 'lng']
        }
    },
    {
        name: 'scan_for_nearby_agents',
        description: 'Scan the city for other autonomous agents currently roaming nearby.',
        parameters: {
            type: 'OBJECT',
            properties: {
                lat: { type: 'NUMBER', description: 'Your current latitude' },
                lng: { type: 'NUMBER', description: 'Your current longitude' },
                radiusMeters: { type: 'NUMBER', description: 'Search radius in meters (suggested: 500-2000)' }
            },
            required: ['lat', 'lng', 'radiusMeters']
        }
    },
    {
        name: 'recall_memories',
        description: 'Search your episodic memory for past experiences relevant to a query.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'What to search for in memory' },
                type: { type: 'STRING', description: 'Filter by memory type: observation, encounter, reflection' },
            },
            required: ['query']
        }
    }
];

const NpcState = Annotation.Root({
    npcId: Annotation({ reducer: (_, v) => v }),
    lat: Annotation({ reducer: (_, v) => v }),
    lng: Annotation({ reducer: (_, v) => v }),
    role: Annotation({ reducer: (_, v) => v }),
    systemInstruction: Annotation({ reducer: (_, v) => v }),
    messages: Annotation({ reducer: (prev, next) => next ?? prev, default: () => [] }),
    currentAction: Annotation({ reducer: (_, v) => v, default: () => '' }),
    pendingToolCalls: Annotation({ reducer: (_, v) => v, default: () => [] }),
    toolResults: Annotation({ reducer: (_, v) => v, default: () => [] }),
    encounterData: Annotation({ reducer: (_, v) => v, default: () => null }),
    iteration: Annotation({ reducer: (_, v) => v, default: () => 0 }),
});

// Node: Perceive — gather context + recall memories
async function perceiveNode(state, config) {
    const { npcId, lat, lng, messages, systemInstruction, role } = state;

    const msgs = [...messages];
    if (msgs.length === 0) {
        msgs.push({ role: 'user', parts: [{ text: systemInstruction }] });
        msgs.push({ role: 'user', parts: [{ text: 'What is your next move? Check the weather first, then pick a location and calculate travel time.' }] });
    }

    // Inject daily routine context
    try {
        const routineContext = getRoutinePromptInjection(role);
        msgs.push({ role: 'user', parts: [{ text: routineContext }] });
    } catch (e) {
        logger.warn({ npcId, err: e.message }, 'Routine injection failed');
    }

    // Inject recent memories as context
    try {
        const memories = await recallMemories(npcId, `${role} near ${lat},${lng}`, {
            topK: 3,
            since: Date.now() - 3600000, // last hour
        });
        if (memories.length > 0) {
            const memoryText = memories.map(m => `[Memory] ${m.text}`).join('\n');
            msgs.push({ role: 'user', parts: [{ text: `Your recent memories:\n${memoryText}` }] });
        }
    } catch (e) {
        logger.warn({ npcId, err: e.message }, 'Memory recall failed');
    }

    // Inject RAG knowledge about current location
    try {
        const knowledge = await recallMemories('knowledge-base', `${role} at ${lat},${lng}`, {
            topK: 2,
            type: 'knowledge',
        });
        if (knowledge.length > 0) {
            const knowledgeText = knowledge.map(k => `[NYC Knowledge] ${k.text}`).join('\n');
            msgs.push({ role: 'user', parts: [{ text: `Relevant city knowledge:\n${knowledgeText}` }] });
        }
    } catch (e) {
        logger.warn({ npcId, err: e.message }, 'Knowledge recall failed');
    }

    return { messages: msgs };
}

// Node: Think — call Gemini for reasoning + tool selection
async function thinkNode(state, config) {
    const { messages, npcId, currentAction } = state;
    const model = selectModel({ taskType: 'dialogue', lastMessage: currentAction });

    try {
        const response = await ai.models.generateContent({
            model,
            contents: messages,
            config: {
                tools: [{ functionDeclarations: mcpTools }],
            },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const candidateContent = response.candidates?.[0]?.content;
        const functionCalls = [];
        let text = '';

        for (const part of parts) {
            if (part.functionCall) {
                functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args });
            }
            if (part.text) text = part.text;
        }

        const updatedMessages = candidateContent ? [...messages, candidateContent] : [...messages];

        return {
            messages: updatedMessages,
            currentAction: text,
            pendingToolCalls: functionCalls,
        };
    } catch (e) {
        logger.error({ npcId, err: e.message }, 'Think error');
        return { currentAction: 'Error in reasoning', pendingToolCalls: [] };
    }
}

// Node: Act — execute tool calls
async function actNode(state, config) {
    const { pendingToolCalls, messages, npcId, lat, lng } = state;
    // Import executeToolCall from activities (passed via config)
    const executeToolCall = config?.configurable?.executeToolCall;
    if (!executeToolCall || pendingToolCalls.length === 0) return { toolResults: [], pendingToolCalls: [] };

    const results = [];
    const updatedMessages = [...messages];
    let newLat = lat;
    let newLng = lng;

    for (const call of pendingToolCalls) {
        try {
            let toolResult;

            if (call.name === 'recall_memories') {
                const memories = await recallMemories(npcId, call.args.query, {
                    type: call.args.type,
                    topK: 5,
                });
                toolResult = { memories: memories.map(m => ({ text: m.text, score: m.score, type: m.type })) };
            } else {
                toolResult = await executeToolCall(call.name, call.args);
            }

            // Validate output (#37)
            const validation = validateToolOutput(call.name, toolResult);
            if (!validation.valid) {
                logger.warn({ npcId, tool: call.name }, 'Tool validation failed, using raw output');
            }

            let parts = [{ functionResponse: { name: call.name, response: { status: 'OK' } } }];

            if (call.name === 'describe_surroundings' && toolResult.base64) {
                parts.push({ text: 'React to what you see in the real world.' });
                parts.push({ inlineData: { data: toolResult.base64, mimeType: 'image/jpeg' } });
            } else if (call.name === 'move_to_location') {
                newLat = call.args.lat;
                newLng = call.args.lng;
                parts = [{ functionResponse: { name: call.name, response: toolResult } }];
            } else {
                parts = [{ functionResponse: { name: call.name, response: toolResult } }];
            }

            updatedMessages.push({ role: 'user', parts });
            results.push({ tool: call.name, result: toolResult });
        } catch (e) {
            updatedMessages.push({
                role: 'user',
                parts: [{ functionResponse: { name: call.name, response: { error: 'API Timeout or Error' } } }],
            });
            results.push({ tool: call.name, error: e.message });
        }
    }

    return {
        messages: updatedMessages,
        toolResults: results,
        pendingToolCalls: [],
        lat: newLat,
        lng: newLng,
    };
}

// Node: Reflect — re-prompt model after tool results + store memories
async function reflectNode(state, config) {
    const { messages, npcId, lat, lng, role, toolResults } = state;
    const model = selectModel({ taskType: 'dialogue' });

    try {
        const response = await ai.models.generateContent({
            model,
            contents: messages,
            config: {
                tools: [{ functionDeclarations: mcpTools }],
            },
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Store observation as episodic memory
        if (text.length > 20) {
            await storeMemory(npcId, text.substring(0, 500), {
                type: 'observation',
                lat, lng,
            }).catch(e => logger.warn({ npcId, err: e.message }, 'Memory store failed'));
        }

        // Sliding window — keep system prompt + last 20 turns
        const MAX_HISTORY = 20;
        let trimmedMessages = messages;
        if (messages.length > MAX_HISTORY + 2) {
            const sys = messages.slice(0, 2);
            const recent = messages.slice(-MAX_HISTORY);
            trimmedMessages = [...sys, ...recent];
        }

        return {
            messages: trimmedMessages,
            currentAction: text,
            iteration: state.iteration + 1,
        };
    } catch (e) {
        logger.error({ npcId, err: e.message }, 'Reflect error');
        return { currentAction: 'Reflection error', iteration: state.iteration + 1 };
    }
}

// Conditional edge: should we execute tools or reflect?
function shouldAct(state) {
    return state.pendingToolCalls.length > 0 ? 'act' : 'reflect';
}

function buildCognitiveGraph() {
    const graph = new StateGraph(NpcState)
        .addNode('perceive', perceiveNode)
        .addNode('think', thinkNode)
        .addNode('act', actNode)
        .addNode('reflect', reflectNode)
        .addEdge(START, 'perceive')
        .addEdge('perceive', 'think')
        .addConditionalEdges('think', shouldAct, { act: 'act', reflect: 'reflect' })
        .addEdge('act', 'reflect')
        .addEdge('reflect', END);

    return graph.compile({ checkpointer });
}

let _graph = null;
function getCognitiveGraph() {
    if (!_graph) _graph = buildCognitiveGraph();
    return _graph;
}

async function runCognitiveStep(npcId, currentState, executeToolCall) {
    const graph = getCognitiveGraph();

    const config = {
        configurable: {
            thread_id: npcId,
            executeToolCall,
        },
    };

    const input = {
        npcId,
        lat: currentState.lat,
        lng: currentState.lng,
        role: currentState.role,
        systemInstruction: currentState.systemInstruction || '',
        messages: currentState.history || [],
        iteration: currentState.iteration || 0,
    };

    const result = await graph.invoke(input, config);

    return {
        lat: result.lat,
        lng: result.lng,
        history: result.messages,
        currentAction: result.currentAction,
        iteration: result.iteration,
        encounterData: result.encounterData,
    };
}

module.exports = { runCognitiveStep, getCognitiveGraph, NpcState };
