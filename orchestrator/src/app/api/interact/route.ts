import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import language from '@google-cloud/language';
import { adminDb } from '@/lib/firebase-admin';

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
let geminiKey = process.env.GEMINI_API_KEY || '';
if (!geminiKey) {
    try {
        const envStr = fs.readFileSync(path.join(process.cwd(), '../.env'), 'utf8');
        const match = envStr.match(/GEMINI_API_KEY=([^\n\r]+)/);
        if (match) geminiKey = match[1];
    } catch (e) {
        console.error('Failed to read root .env');
    }
}

// Initialize GCP Clients
const ai = new GoogleGenAI({ apiKey: geminiKey });
const nlpClient = new language.LanguageServiceClient({
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: privateKey.replace(/\\n/g, '\n')
    },
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { agentId, message, role } = body;

        if (!agentId || !message) {
            return NextResponse.json({ error: 'Missing agentId or message' }, { status: 400 });
        }

        console.log(`[Comm-Link] Received message for ${agentId} (${role}): "${message}"`);

        // 1. Calculate the user's text sentiment value to inject into the Ripple Effect engine
        const nlpDocument = {
            content: message,
            type: 'PLAIN_TEXT' as const,
        };
        const [sentimentResult] = await nlpClient.analyzeSentiment({ document: nlpDocument });
        const sentimentScore = sentimentResult.documentSentiment?.score || 0;

        // 2. Generate an AI response from the targeted Persona
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are the ${role} in New York City. A mysterious overseer (the User) has just transmitted a message directly into your mind via a Comm-Link. Respond briefly in 1-2 sentences in-character to this message: "${message}"`
        });

        const aiReply = response.text || "System anomaly: Connection lost.";

        // 3. Update the global Firestore database to reflect the interaction and the new agent Vibe (Sentiment)
        await adminDb.collection('agents').doc(agentId).set({
            lastEncounterDialogue: `[USER]: ${message} | [REPLY]: ${aiReply}`,
            sentimentScore: sentimentScore,
            isInteracting: false,
            lastUpdated: Date.now()
        }, { merge: true });

        console.log(`[Comm-Link] ${agentId} sentiment shifted to ${sentimentScore} based on User interaction.`);

        return NextResponse.json({ success: true, aiReply, sentimentScore });

    } catch (error) {
        console.error('API /interact error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
