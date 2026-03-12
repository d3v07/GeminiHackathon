/**
 * Social Memory System (Issue #35)
 * 
 * Tracks inter-agent relationship history (who met whom, how many times,
 * sentiment of past encounters) and injects this social context into
 * encounter prompts so agents remember each other organically.
 */
require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const admin = require('firebase-admin');
const logger = require('./logger').child({ module: 'social-memory' });

// Re-use the shared Firebase Admin instance
if (!admin.apps.length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
        }),
    });
}
const db = admin.firestore();

const RELATIONSHIPS_COLLECTION = 'agent_relationships';

/**
 * Build a deterministic relationship document ID from two agent IDs.
 * Always sorts alphabetically so both agents share one doc.
 */
function getRelationshipId(agentA, agentB) {
    return [agentA, agentB].sort().join('__');
}

/**
 * Record a new encounter between two agents.
 * Updates the relationship doc with encounter count, latest summary,
 * running sentiment average, and timestamp.
 */
async function recordEncounter(agentA, agentB, { summary, sentiment = 0, location = {} } = {}) {
    const relId = getRelationshipId(agentA, agentB);
    const relRef = db.collection(RELATIONSHIPS_COLLECTION).doc(relId);

    try {
        const doc = await relRef.get();
        const existing = doc.exists ? doc.data() : null;

        const encounterCount = (existing?.encounterCount || 0) + 1;
        const prevSentiment = existing?.averageSentiment || 0;
        const averageSentiment = ((prevSentiment * (encounterCount - 1)) + sentiment) / encounterCount;

        // Keep last 5 encounter summaries for context
        const recentEncounters = existing?.recentEncounters || [];
        recentEncounters.unshift({
            summary: (summary || '').substring(0, 200),
            sentiment,
            timestamp: Date.now(),
            lat: location.lat || 0,
            lng: location.lng || 0,
        });
        if (recentEncounters.length > 5) recentEncounters.length = 5;

        await relRef.set({
            agents: [agentA, agentB].sort(),
            encounterCount,
            averageSentiment: Math.round(averageSentiment * 100) / 100,
            lastEncounter: Date.now(),
            recentEncounters,
            firstMet: existing?.firstMet || Date.now(),
        }, { merge: true });

        logger.info({ agentA, agentB, encounterCount, sentiment: sentiment.toFixed(2) }, 'Encounter recorded');
        return { encounterCount, averageSentiment };
    } catch (e) {
        logger.error({ err: e.message }, 'Failed to record encounter');
        return { encounterCount: 0, averageSentiment: 0 };
    }
}

/**
 * Get the relationship history between two agents.
 */
async function getRelationship(agentA, agentB) {
    const relId = getRelationshipId(agentA, agentB);
    try {
        const doc = await db.collection(RELATIONSHIPS_COLLECTION).doc(relId).get();
        if (!doc.exists) return null;
        return doc.data();
    } catch (e) {
        logger.error({ err: e.message }, 'Failed to get relationship');
        return null;
    }
}

/**
 * Get all relationships for a given agent, sorted by encounter count.
 */
async function getAgentRelationships(agentId) {
    try {
        const snapshot = await db.collection(RELATIONSHIPS_COLLECTION)
            .where('agents', 'array-contains', agentId)
            .orderBy('lastEncounter', 'desc')
            .limit(10)
            .get();

        return snapshot.docs.map(doc => doc.data());
    } catch (e) {
        logger.error({ err: e.message }, 'Failed to get agent relationships');
        return [];
    }
}

/**
 * Generate a social context string to inject into encounter prompts.
 * If agents have met before, this provides history of their relationship.
 */
async function getSocialContextForEncounter(agentA, agentB) {
    const relationship = await getRelationship(agentA, agentB);

    if (!relationship) {
        return `[SOCIAL CONTEXT] These two agents have NEVER met before. This is their first encounter. They should react with curiosity or surprise.`;
    }

    const timeAgo = Date.now() - relationship.lastEncounter;
    const hoursAgo = Math.floor(timeAgo / 3600000);
    const timeSinceStr = hoursAgo < 1 ? 'less than an hour ago' :
        hoursAgo < 24 ? `${hoursAgo} hours ago` :
            `${Math.floor(hoursAgo / 24)} days ago`;

    const sentimentLabel = relationship.averageSentiment > 0.3 ? 'positive' :
        relationship.averageSentiment < -0.3 ? 'tense' : 'neutral';

    const recentSummaries = (relationship.recentEncounters || [])
        .slice(0, 3)
        .map(e => `  - "${e.summary}"`)
        .join('\n');

    return `[SOCIAL CONTEXT] These agents have met ${relationship.encounterCount} time(s) before. Their relationship is ${sentimentLabel} (avg sentiment: ${relationship.averageSentiment}). They last met ${timeSinceStr}.
Recent encounters:
${recentSummaries || '  (no summaries recorded)'}
They should reference their shared history naturally in conversation.`;
}

module.exports = {
    recordEncounter,
    getRelationship,
    getAgentRelationships,
    getSocialContextForEncounter,
    getRelationshipId,
};
