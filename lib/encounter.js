/**
 * Enhanced NPC Encounter System (Issue #36)
 *
 * Multi-turn dialogue with relationship tracking, Pinecone memory recall,
 * and Redis-cached encounter sessions.
 *
 * Flow:
 *   1. Fetch social context (relationship history from Firestore)
 *   2. Recall relevant Pinecone memories for both agents
 *   3. Run a multi-turn dialogue loop (3 exchanges, alternating speakers)
 *   4. Cache the full encounter transcript in Redis
 *   5. Store per-agent encounter memories in Pinecone
 *   6. Update the social memory relationship record
 */
require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const { GoogleGenAI } = require('@google/genai');
const { Redis } = require('@upstash/redis');
const { selectModel } = require('./model-router');
const { storeMemory, recallMemories, recallCrossAgentMemories } = require('./memory');
const { getSocialContextForEncounter, recordEncounter } = require('./social-memory');
const logger = require('./logger').child({ module: 'encounter' });
const { traceable } = require('langsmith/traceable');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Redis client for caching encounter sessions
let _redis = null;
function getRedis() {
    if (!_redis) {
        _redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
    }
    return _redis;
}

const ENCOUNTER_TTL = 86400; // 24h
const MAX_TURNS = 3; // 3 exchanges = 6 total messages (A, B, A, B, A, B)

/**
 * Recall relevant memories for an agent to use in the encounter.
 * Searches both the agent's own episodic memories and the RAG knowledge base.
 */
async function recallEncounterContext(agentId, role, otherRole, lat, lng) {
    const results = { personalMemories: [], knowledgeMemories: [], crossAgentMemories: [] };

    try {
        // 1. Agent's own memories about this location or the other agent
        const personal = await recallMemories(agentId, `${role} encounter with ${otherRole} near ${lat},${lng}`, {
            topK: 3,
            since: Date.now() - 86400000, // last 24h
        });
        results.personalMemories = personal.map(m => m.text).filter(Boolean);
    } catch (e) {
        logger.warn({ agentId, err: e.message }, 'Personal memory recall failed');
    }

    try {
        // 2. RAG knowledge about the encounter location
        const knowledge = await recallMemories('knowledge-base', `notable facts about ${lat},${lng} NYC`, {
            topK: 2,
            type: 'knowledge',
        });
        results.knowledgeMemories = knowledge.map(m => m.text).filter(Boolean);
    } catch (e) {
        logger.warn({ err: e.message }, 'Knowledge recall failed');
    }

    try {
        // 3. Cross-agent memories (what others have said/done nearby)
        const cross = await recallCrossAgentMemories(`encounter near ${lat},${lng}`, {
            excludeAgent: agentId,
            topK: 2,
            since: Date.now() - 43200000, // last 12h
        });
        results.crossAgentMemories = cross.map(m => `${m.agentId}: ${m.text}`).filter(Boolean);
    } catch (e) {
        logger.warn({ err: e.message }, 'Cross-agent recall failed');
    }

    return results;
}

/**
 * Build the system prompt for one agent's turn in the multi-turn dialogue.
 */
function buildAgentTurnPrompt(agent, otherAgent, socialContext, memories, turnNumber, previousDialogue) {
    const memoryBlock = [
        ...memories.personalMemories.map(m => `  [Your Memory] ${m}`),
        ...memories.knowledgeMemories.map(m => `  [City Knowledge] ${m}`),
        ...memories.crossAgentMemories.map(m => `  [Overheard] ${m}`),
    ].join('\n') || '  (No relevant memories recalled)';

    const dialogueSoFar = previousDialogue.length > 0
        ? `\nDIALOGUE SO FAR:\n${previousDialogue.map(d => `${d.speaker}: "${d.text}"`).join('\n')}`
        : '';

    return `You are the "${agent.role}" in real-world New York City at coordinates ${agent.lat}, ${agent.lng}.
You have just encountered the "${otherAgent.role}" on the street.

${socialContext}

YOUR RECALLED MEMORIES:
${memoryBlock}
${dialogueSoFar}

This is turn ${turnNumber} of ${MAX_TURNS} in this conversation.
${turnNumber === 1 ? 'You are INITIATING this encounter. Greet them or react to seeing them.' : ''}
${turnNumber === MAX_TURNS ? 'This is your FINAL turn. Wrap up the conversation naturally — say goodbye or make a parting remark.' : ''}

Respond IN-CHARACTER as the ${agent.role} with 1-3 sentences. Be immersive, referencing real NYC locations, your memories, and your personality.
Do NOT include your name/role prefix — just speak the dialogue directly.`;
}

/**
 * Run one turn of the multi-turn encounter dialogue.
 * Returns the generated text for the speaking agent.
 */
async function runEncounterTurn(speaker, listener, socialContext, speakerMemories, turnNumber, previousDialogue) {
    const model = selectModel({ taskType: 'encounter' });
    const prompt = buildAgentTurnPrompt(speaker, listener, socialContext, speakerMemories, turnNumber, previousDialogue);

    const response = await ai.models.generateContent({
        model,
        contents: { role: 'user', parts: [{ text: prompt }] },
        config: { tools: [{ googleSearch: {} }] },
    });

    return (response.text || '').trim();
}

/**
 * Main encounter handler — runs multi-turn dialogue between two agents.
 */
const handleEncounter = traceable(async function handleEncounter(agentA, agentB) {
    const agentAId = agentA.agentId || 'unknown-a';
    const agentBId = agentB.agentId || 'unknown-b';
    const encounterKey = `encounter:${[agentAId, agentBId].sort().join(':')}:${Date.now()}`;

    logger.info({ agentA: agentAId, roleA: agentA.role, agentB: agentBId, roleB: agentB.role, lat: agentA.lat, lng: agentA.lng }, 'Multi-turn encounter started');

    // 1. Fetch social context (relationship history)
    let socialContext = '';
    try {
        socialContext = await getSocialContextForEncounter(agentAId, agentBId);
    } catch (e) {
        logger.warn({ err: e.message }, 'Social context fetch failed');
    }

    // 2. Recall Pinecone memories for both agents
    const [memoriesA, memoriesB] = await Promise.all([
        recallEncounterContext(agentAId, agentA.role, agentB.role, agentA.lat, agentA.lng),
        recallEncounterContext(agentBId, agentB.role, agentA.role, agentB.lat, agentB.lng),
    ]);

    // 3. Multi-turn dialogue loop
    const dialogue = [];
    const speakers = [agentA, agentB];
    const memories = [memoriesA, memoriesB];

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        for (let si = 0; si < 2; si++) {
            const speaker = speakers[si];
            const listener = speakers[1 - si];
            const speakerMemories = memories[si];

            try {
                const text = await runEncounterTurn(
                    speaker, listener, socialContext, speakerMemories, turn, dialogue
                );

                if (text) {
                    dialogue.push({
                        speaker: speaker.role,
                        agentId: speaker.agentId || `unknown-${si === 0 ? 'a' : 'b'}`,
                        text,
                        turn,
                    });
                    logger.info({ turn, role: speaker.role, text: text.substring(0, 100) }, 'Encounter turn');
                }
            } catch (e) {
                logger.error({ turn, role: speaker.role, err: e.message }, 'Encounter turn failed');
                dialogue.push({
                    speaker: speaker.role,
                    agentId: speaker.agentId || `unknown-${si === 0 ? 'a' : 'b'}`,
                    text: '*pauses thoughtfully*',
                    turn,
                    error: true,
                });
            }
        }
    }

    // 4. Build full transcript
    const transcript = dialogue.map(d => `${d.speaker}: "${d.text}"`).join('\n');
    logger.info({ transcript }, 'Full encounter transcript');

    // 5. Cache encounter session in Redis
    try {
        const redis = getRedis();
        await redis.set(encounterKey, JSON.stringify({
            agentA: { id: agentAId, role: agentA.role },
            agentB: { id: agentBId, role: agentB.role },
            location: { lat: agentA.lat, lng: agentA.lng },
            dialogue,
            transcript,
            timestamp: Date.now(),
            turns: MAX_TURNS,
        }));
        await redis.expire(encounterKey, ENCOUNTER_TTL);
        logger.info({ encounterKey }, 'Encounter cached in Redis');
    } catch (e) {
        logger.warn({ err: e.message }, 'Encounter cache failed');
    }

    // 6. Store encounter memories in Pinecone for both agents
    const summaryA = `Multi-turn encounter with ${agentB.role}: ${dialogue.filter(d => d.agentId === agentBId).map(d => d.text).join(' ').substring(0, 300)}`;
    const summaryB = `Multi-turn encounter with ${agentA.role}: ${dialogue.filter(d => d.agentId === agentAId).map(d => d.text).join(' ').substring(0, 300)}`;

    await Promise.all([
        storeMemory(agentAId, summaryA, {
            type: 'encounter', lat: agentA.lat, lng: agentA.lng,
        }).catch(e => logger.warn({ err: e.message }, 'Memory store A failed')),
        storeMemory(agentBId, summaryB, {
            type: 'encounter', lat: agentB.lat, lng: agentB.lng,
        }).catch(e => logger.warn({ err: e.message }, 'Memory store B failed')),
        // 7. Update social memory relationship record
        recordEncounter(agentAId, agentBId, {
            summary: transcript.substring(0, 200),
            sentiment: 0,
            location: { lat: agentA.lat, lng: agentA.lng },
        }).catch(e => logger.warn({ err: e.message }, 'Social memory record failed')),
    ]);

    return {
        dialogue,
        transcript,
        agentA: agentAId,
        agentB: agentBId,
        location: { lat: agentA.lat, lng: agentA.lng },
        turns: MAX_TURNS,
        totalMessages: dialogue.length,
    };
}, { name: 'handleEncounter', run_type: 'chain' });

module.exports = { handleEncounter, recallEncounterContext, MAX_TURNS };
