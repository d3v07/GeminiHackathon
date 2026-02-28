import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { LanguageServiceClient } from '@google-cloud/language';
import { PredictionServiceClient } from '@google-cloud/aiplatform';

// Init AI Clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy_key_for_build' });
const nlp = new LanguageServiceClient();
const vertex = new PredictionServiceClient({
    apiEndpoint: 'us-central1-aiplatform.googleapis.com'
});

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const LOCATION = 'us-central1';
const PUBLISHER = 'google';
const MODEL = 'text-embedding-004';

// Helper for Vertex AI Embeddings
async function getEmbedding(text: string) {
    if (!text) return [];
    try {
        const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL}`;
        const [response] = await vertex.predict({
            endpoint,
            instances: [{ structValue: { fields: { content: { stringValue: text } } } }],
        });
        const embeddings = response.predictions?.[0]?.structValue?.fields?.embeddings?.structValue?.fields?.values?.listValue?.values;
        return embeddings?.map((v: any) => v.numberValue) || [];
    } catch (e) {
        console.warn("Vertex Embedding failed:", e);
        return [];
    }
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
    if (!vecA.length || !vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Haversine formula to calculate distance between two coordinates in meters
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371000; // Radius of the earth in m
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in m
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

export async function POST(request: Request) {
    try {
        const { agentId, lat, lng, defaultTask, memoryContext } = await request.json();

        if (!agentId || lat === undefined || lng === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const INTERACTION_RADIUS_METERS = 50; // Detect if within 50 meters

        // Bounds for Manhattan roughly
        const MANHATTAN_BOUNDS = {
            northLat: 40.87,
            southLat: 40.70,
            westLng: -74.02,
            eastLng: -73.91
        };

        if (lat > MANHATTAN_BOUNDS.northLat || lat < MANHATTAN_BOUNDS.southLat ||
            lng < MANHATTAN_BOUNDS.westLng || lng > MANHATTAN_BOUNDS.eastLng) {
            return NextResponse.json({
                error: 'Out of Bounds. Please route back towards central Manhattan.',
                correction: {
                    suggested_lat: Math.max(MANHATTAN_BOUNDS.southLat, Math.min(MANHATTAN_BOUNDS.northLat, lat)),
                    suggested_lng: Math.max(MANHATTAN_BOUNDS.westLng, Math.min(MANHATTAN_BOUNDS.eastLng, lng))
                }
            }, { status: 400 });
        }

        const agentsRef = adminDb.collection('agents');

        // 1. Durably log the current position and state of the pinging agent
        await agentsRef.doc(agentId).set({
            lat,
            lng,
            lastUpdated: new Date().toISOString(),
            defaultTask: defaultTask || 'Idle',
            memoryContext: memoryContext || '', // Stores recent history
            isInteracting: false,
            role: agentId.replace('npc-', '').replace(/-/g, ' ') // fallback role
        }, { merge: true });

        // 2. Proximity calculation logic
        const snapshot = await agentsRef.get();
        let collisionDetected = false;
        let collidingAgentId = null;
        let collidingAgentData: any = null;

        snapshot.forEach(doc => {
            const otherAgent = doc.data();
            const otherAgentId = doc.id;

            if (otherAgentId === agentId) return;

            const distance = getDistanceFromLatLonInM(lat, lng, otherAgent.lat, otherAgent.lng);

            if (distance < INTERACTION_RADIUS_METERS && !otherAgent.isInteracting) {
                collisionDetected = true;
                collidingAgentId = otherAgentId;
                collidingAgentData = otherAgent;
            }
        });

        if (collisionDetected && collidingAgentId && collidingAgentData) {
            // Fetch fresh doc for A
            const agentADoc = await agentsRef.doc(agentId).get();
            const agentAData = agentADoc.data() || {};
            const agentBData = collidingAgentData;

            // Mark both as interacting
            await agentsRef.doc(agentId).update({ isInteracting: true, interactingWith: collidingAgentId });
            await agentsRef.doc(collidingAgentId).update({ isInteracting: true, interactingWith: agentId });

            // Fourth task: Vertex AI Embeddings for Encounter Context
            let sharedContext = "";
            try {
                // Parse history safely
                const historyA = JSON.parse(agentAData.memoryContext || '[]');
                const historyB = JSON.parse(agentBData.memoryContext || '[]');

                let bestSimilarity = -1;
                let bestPair: { textA: string, textB: string } | null = null;

                for (const memA of historyA) {
                    const textA = memA.parts?.[0]?.text || "";
                    if (!textA) continue;
                    const embA = await getEmbedding(textA);
                    if (!embA.length) continue;

                    for (const memB of historyB) {
                        const textB = memB.parts?.[0]?.text || "";
                        if (!textB) continue;
                        const embB = await getEmbedding(textB);
                        if (!embB.length) continue;

                        const sim = cosineSimilarity(embA, embB);
                        if (sim > bestSimilarity) {
                            bestSimilarity = sim;
                            bestPair = { textA, textB };
                        }
                    }
                }

                if (bestSimilarity > 0.6 && bestPair) {
                    sharedContext = `Agent A's related memory: "${bestPair.textA.substring(0, 100)}". Agent B's related memory: "${bestPair.textB.substring(0, 100)}".`;
                }
            } catch (e) {
                console.warn("Error during Vertex embeddings", e);
            }

            const prompt = `
            You are generating a localized, asynchronous dialogue between two NPCs who have just crossed paths at the SAME coordinates in real-world NYC.
            They must converse based ENTIRELY on their past experiences and current state.
            
            AGENT A STATE:
            Role: ${agentAData.role || 'Citizen'}
            Location: ${lat}, ${lng}
            Recent Task: ${agentAData.defaultTask}
            
            AGENT B STATE:
            Role: ${agentBData.role || 'Citizen'}
            Location: ${agentBData.lat}, ${agentBData.lng}
            Recent Task: ${agentBData.defaultTask}

            ${sharedContext ? `Shared context they both remember: ${sharedContext}` : ''}
            
            Write a short, immersive dialogue between them, exchanging knowledge or reacting to each other's recent experiences near these coordinates. No pleasantries, get straight to the vibe.
            `;

            // Call Gemini 3 Flash directly
            let transcript = "Two agents nod silently as they pass.";
            try {
                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }]
                });
                if (geminiResponse.text) {
                    transcript = geminiResponse.text;
                }
            } catch (e) {
                console.error("Gemini Flash dialogue error", e);
            }

            // Cloud Natural Language sentiment analysis
            let sentimentScore = 0;
            try {
                const [sentimentResult] = await nlp.analyzeSentiment({
                    document: { content: transcript, type: 'PLAIN_TEXT' }
                });
                sentimentScore = sentimentResult.documentSentiment?.score || 0;
            } catch (e) {
                console.error("Sentiment analysis error", e);
            }

            // Write to encounters
            const encounterRef = adminDb.collection('encounters').doc();
            await encounterRef.set({
                participants: [agentAData.role || agentId, agentBData.role || collidingAgentId],
                transcript,
                sentimentScore,
                timestamp: new Date().toISOString(),
                lat,
                lng
            });

            // Calculate Vibe Contagion (Mood Shifting)
            const oldScoreA = agentAData.sentimentScore || 0;
            const oldScoreB = agentBData.sentimentScore || 0;

            // Agent A's new mood is influenced heavily by their old mood, but also by Agent B and the encounter itself
            let newScoreA = (oldScoreA * 0.4) + (oldScoreB * 0.3) + (sentimentScore * 0.3);
            newScoreA = Math.max(-1, Math.min(1, newScoreA));

            // Agent B's new mood inverses the influence
            let newScoreB = (oldScoreB * 0.4) + (oldScoreA * 0.3) + (sentimentScore * 0.3);
            newScoreB = Math.max(-1, Math.min(1, newScoreB));

            // Update both agent docs with dialogue & distinct shifted sentiments
            await agentsRef.doc(agentId).update({
                lastEncounterDialogue: transcript,
                sentimentScore: newScoreA
            });
            await agentsRef.doc(collidingAgentId).update({
                lastEncounterDialogue: transcript,
                sentimentScore: newScoreB
            });

            return NextResponse.json({
                success: true,
                message: 'Encounter resolved, embedded and logged.',
                interaction: {
                    withAgent: collidingAgentId,
                    transcript,
                    sentimentScore
                }
            });
        }

        return NextResponse.json({ success: true, message: 'Agent position durably logged.' });
    } catch (error) {
        console.error('Error in Orchestrator API', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
