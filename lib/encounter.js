require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const { GoogleGenAI } = require('@google/genai');
const { selectModel } = require('./model-router');
const { storeMemory } = require('./memory');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function handleEncounter(agentA, agentB) {
    console.log(`\n--- LANGGRAPH ENCOUNTER ---`);
    console.log(`${agentA.role} meets ${agentB.role} at ${agentA.lat},${agentA.lng}`);

    const model = selectModel({ taskType: 'encounter' });

    const prompt = `
You are generating a localized, asynchronous dialogue between two NPCs who have just crossed paths at the SAME coordinates in real-world NYC.
They must converse based ENTIRELY on their past experiences and current state.

AGENT A STATE:
Role: ${agentA.role}
Location: ${agentA.lat}, ${agentA.lng}
Recent History: ${JSON.stringify(agentA.history?.slice(-3) || 'Just arrived in NYC.')}

AGENT B STATE:
Role: ${agentB.role}
Location: ${agentB.lat}, ${agentB.lng}
Recent History: ${JSON.stringify(agentB.history?.slice(-3) || 'Looking for a clue.')}

Write a short, immersive dialogue between them, exchanging knowledge or reacting to each other's recent experiences near these coordinates.
`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { role: 'user', parts: [{ text: prompt }] },
            config: { tools: [{ googleSearch: {} }] },
        });

        const dialogue = response.text || '';
        console.log(`[Encounter Dialogue]\n${dialogue.substring(0, 300)}...`);

        // Store encounter as memory for both agents
        const encounterSummary = `Met ${agentB.role}: ${dialogue.substring(0, 200)}`;
        const encounterSummaryB = `Met ${agentA.role}: ${dialogue.substring(0, 200)}`;

        await Promise.all([
            storeMemory(agentA.agentId || 'unknown-a', encounterSummary, {
                type: 'encounter', lat: agentA.lat, lng: agentA.lng,
            }).catch(e => console.warn('Memory store A failed:', e.message)),
            storeMemory(agentB.agentId || 'unknown-b', encounterSummaryB, {
                type: 'encounter', lat: agentB.lat, lng: agentB.lng,
            }).catch(e => console.warn('Memory store B failed:', e.message)),
        ]);

        return {
            dialogue,
            agentA: agentA.agentId,
            agentB: agentB.agentId,
            location: { lat: agentA.lat, lng: agentA.lng },
        };
    } catch (e) {
        console.error('Encounter dialogue error:', e.message);
        throw e;
    }
}

module.exports = { handleEncounter };
