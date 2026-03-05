require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const INDEX_NAME = 'metropolis-memory';

let _index = null;
function getIndex() {
    if (!_index) {
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        _index = pc.index(INDEX_NAME, process.env.PINECONE_INDEX_HOST);
    }
    return _index;
}

async function embed(text) {
    const res = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: { outputDimensionality: 768 },
    });
    return res.embeddings[0].values;
}

async function storeMemory(agentId, text, metadata = {}) {
    const index = getIndex();
    const vector = await embed(text);
    const id = `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await index.upsert({
        records: [{
            id,
            values: vector,
            metadata: {
                agent_id: agentId,
                text,
                timestamp: Date.now(),
                type: metadata.type || 'observation',
                lat: metadata.lat || 0,
                lng: metadata.lng || 0,
                ...metadata,
            },
        }],
    });

    return id;
}

async function recallMemories(agentId, query, options = {}) {
    const index = getIndex();
    const vector = await embed(query);

    const filter = { agent_id: { $eq: agentId } };

    // #29: Metadata filtering
    if (options.type) {
        filter.type = { $eq: options.type };
    }
    if (options.since) {
        filter.timestamp = { $gte: options.since };
    }
    if (options.nearLat && options.nearLng && options.radiusKm) {
        const R = 0.009; // ~1km in degrees (rough)
        const r = options.radiusKm * R;
        filter.lat = { $gte: options.nearLat - r, $lte: options.nearLat + r };
        filter.lng = { $gte: options.nearLng - r, $lte: options.nearLng + r };
    }

    const results = await index.query({
        vector,
        topK: options.topK || 5,
        filter,
        includeMetadata: true,
    });

    return (results.matches || []).map(m => ({
        id: m.id,
        score: m.score,
        text: m.metadata?.text,
        type: m.metadata?.type,
        timestamp: m.metadata?.timestamp,
        lat: m.metadata?.lat,
        lng: m.metadata?.lng,
    }));
}

async function recallCrossAgentMemories(query, options = {}) {
    const index = getIndex();
    const vector = await embed(query);

    const filter = {};
    if (options.excludeAgent) {
        filter.agent_id = { $ne: options.excludeAgent };
    }
    if (options.since) {
        filter.timestamp = { $gte: options.since };
    }

    const results = await index.query({
        vector,
        topK: options.topK || 3,
        filter: Object.keys(filter).length ? filter : undefined,
        includeMetadata: true,
    });

    return (results.matches || []).map(m => ({
        id: m.id,
        score: m.score,
        agentId: m.metadata?.agent_id,
        text: m.metadata?.text,
        type: m.metadata?.type,
        timestamp: m.metadata?.timestamp,
    }));
}

module.exports = { storeMemory, recallMemories, recallCrossAgentMemories, embed };
