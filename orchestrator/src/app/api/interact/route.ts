import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import language from '@google-cloud/language';
import { adminDb } from '@/lib/firebase-admin';
import { InteractSchema } from '@/lib/schemas';

// Phase 4 Security: AegisAgent prompt defense
const { aegisGuard, scanOutput } = require('../../../../../lib/aegis-agent');
const { redactPII } = require('../../../../../lib/pii-redactor');

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
        const parsed = InteractSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { agentId, message, role } = parsed.data;

        // Phase 4: AegisAgent — scan for prompt injection
        const aegisResult = aegisGuard(message, { maxChars: 2000, logThreats: true });
        const safeMessage = aegisResult.input;

        if (!aegisResult.safe) {
            console.warn(`[AegisAgent] Threats detected in message for ${agentId}: ${aegisResult.threats.length} pattern(s)`);
        }

        // Phase 4: PII Redaction — strip sensitive data before logging
        const { redacted: cleanMessage } = redactPII(safeMessage, { log: true });

        console.log(`[Comm-Link] Received message for ${agentId} (${role}): "${cleanMessage}"`);

        // 1. Calculate the user's text sentiment value to inject into the Ripple Effect engine
        const nlpDocument = {
            content: cleanMessage,
            type: 'PLAIN_TEXT' as const,
        };
        const [sentimentResult] = await nlpClient.analyzeSentiment({ document: nlpDocument });
        const sentimentScore = sentimentResult.documentSentiment?.score || 0;

        // 2. Generate an AI response from the targeted Persona (using sanitized input)
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are the ${role} in New York City. A mysterious overseer (the User) has just transmitted a message directly into your mind via a Comm-Link. Respond briefly in 1-2 sentences in-character to this message: "${cleanMessage}"`
        });

        let aiReply = response.text || "System anomaly: Connection lost.";

        // Phase 4: Scan output for leaked system prompt content
        const outputScan = scanOutput(aiReply);
        if (!outputScan.safe) {
            console.warn(`[AegisAgent] Output leak detected — sanitizing response`);
            aiReply = outputScan.cleaned;
        }

        // 3. Update Firestore (PII-redacted dialogue)
        const { redacted: cleanDialogue } = redactPII(`[USER]: ${cleanMessage} | [REPLY]: ${aiReply}`);
        await adminDb.collection('agents').doc(agentId).set({
            lastEncounterDialogue: cleanDialogue,
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
