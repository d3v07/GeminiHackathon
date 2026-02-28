import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { LanguageServiceClient } from '@google-cloud/language';
import { PredictionServiceClient } from '@google-cloud/aiplatform';

// Init AI Clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
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
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL}`;
    const instance = { content: text };
    const [response] = await vertex.predict({
        endpoint,
        instances: [{ structValue: { fields: { content: { stringValue: text } } } }],
    });
    const embeddings = response.predictions?.[0]?.structValue?.fields?.embeddings?.structValue?.fields?.values?.listValue?.values;
    return embeddings?.map((v: any) => v.numberValue) || [];
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

        // Bounds for Manhattan roughly (prevent walking into Hudson River/NJ or deep Queens unnecessarily for the demo)
        const MANHATTAN_BOUNDS = {
            northLat: 40.87,
            southLat: 40.70,
            westLng: -74.02,
            eastLng: -73.91
        };

        if (lat > MANHATTAN_BOUNDS.northLat || lat < MANHATTAN_BOUNDS.southLat ||
            lng < MANHATTAN_BOUNDS.westLng || lng > MANHATTAN_BOUNDS.eastLng) {
            return NextResponse.json({
                error: 'Out of Bounds. You have hit a body of water or left the simulation zone. Please route back towards central Manhattan.',
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
            memoryContext: memoryContext || '',
            isInteracting: false,
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
            // 3. Resolve Encounter (TASK-D4: Semantic Memory)
            const agentADoc = await agentsRef.doc(agentId).get();
            const agentAData = agentADoc.data() || {};

            // Extract shared semantic concepts (MAXIMALISM)
            let sharedContext = "";
            try {
                const embA = await getEmbedding(defaultTask || "");
                const embB = await getEmbedding(collidingAgentData.defaultTask || "");
                const similarity = cosineSimilarity(embA, embB);

                if (similarity > 0.8) {
                    sharedContext = "They both seem to be focused on similar goals or themes.";
                }
            } catch (e) {
                console.warn("Semantic matching failed, falling back to basic prompt.");
            }

            const prompt = `
            You are generating a localized dialogue between two AI agents meeting in New York City.
            
            AGENT A: Role: ${agentAData.role || 'Citizen'}, Task: ${defaultTask}
            AGENT B: Role: ${collidingAgentData.role || 'Citizen'}, Task: ${collidingAgentData.defaultTask}
            
            Location Context: ${lat}, ${lng}
            ${sharedContext ? `Shared Semantic Vibe: ${sharedContext}` : ""}
            
            Write a very short (2-3 sentences) immersive dialogue that happens as they cross paths.
            `;

            const geminiResponse = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            const transcript = geminiResponse.text || "Two agents nod silently as they pass.";

            // Sentiment analysis
            const [sentimentResult] = await nlp.analyzeSentiment({
                document: { content: transcript, type: 'PLAIN_TEXT' }
            });
            const sentimentScore = sentimentResult.documentSentiment?.score || 0;

            // Save encounter
            const encounterRef = adminDb.collection('encounters').doc();
            await encounterRef.set({
                participants: [agentId, collidingAgentId],
                transcript,
                sentimentScore,
                timestamp: new Date().toISOString(),
                lat,
                lng
            });

            // Update both agents
            await agentsRef.doc(agentId).update({
                isInteracting: true,
                interactingWith: collidingAgentId,
                lastEncounterDialogue: transcript,
                sentimentScore
            });
            await agentsRef.doc(collidingAgentId).update({
                isInteracting: true,
                interactingWith: agentId,
                lastEncounterDialogue: transcript,
                sentimentScore
            });

            return NextResponse.json({
                success: true,
                message: 'Encounter resolved and logged.',
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
