import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { VertexAI } from '@google-cloud/vertexai';
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
const vertexAI = new VertexAI({ 
    project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 
    location: 'us-central1',
    googleAuthOptions: {
        credentials: {
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: privateKey.replace(/\\n/g, '\n')
        }
    }
});
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
        let aiReply = "System anomaly: Connection lost.";
        const prompt = `You are the ${role} in New York City. A mysterious overseer (the User) has just transmitted a message directly into your mind via a Comm-Link. Respond briefly in 1-2 sentences in-character to this message: "${cleanMessage}"`;

        try {
            // Choice 1: Gemini 2.0 Flash with Grounding (Balanced & Fast)
            const groundedClient = new GoogleGenAI({ 
                apiKey: geminiKey,
                vertexai: true,
                project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                location: 'us-central1'
            });

            const result = await groundedClient.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    tools: [{ googleSearch: {} }],
                    thinkingConfig: { includeThoughts: true }
                }
            });
            
            aiReply = result.text || aiReply;
            console.log(`[Unified-GenAI] Grounded 2.0 success with ${aiReply.substring(0, 30)}...`);
        } catch (vErr: any) {
            console.warn(`[Unified-GenAI] Grounded 2.0 failed: ${vErr.message}. Trying 1.5 Flash...`);
            try {
                // Choice 2: Gemini 1.5 Flash Grounded (Higher Quota)
                const flashClient = new GoogleGenAI({ 
                    apiKey: geminiKey,
                    vertexai: true,
                    project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                    location: 'us-central1'
                });
                const result = await flashClient.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        tools: [{ googleSearch: {} }]
                    }
                });
                aiReply = result.text || aiReply;
                console.log(`[Unified-GenAI] Grounded 1.5 success with ${aiReply.substring(0, 30)}...`);
            } catch (pErr: any) {
                console.warn(`[Unified-GenAI] Grounded 1.5 failed. Falling back to simple AI...`);
                try {
                    // Choice 3: Standard Gemini 1.5 Flash (No Grounding, High Quota)
                    const standardResult = await ai.models.generateContent({
                        model: 'gemini-1.5-flash',
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    });
                    aiReply = standardResult.text || aiReply;
                } catch (sErr: any) {
                    console.error(`[Unified-GenAI] All fallbacks failed:`, sErr.message);
                    aiReply = "The Comm-Link is currently restricted. Check GCP API status.";
                }
            }
        }

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

        console.log(`[Comm-Link] Agent ${agentId} replied: "${aiReply}"`);
        console.log(`[Comm-Link] ${agentId} sentiment shifted to ${sentimentScore} based on User interaction.`);

        return NextResponse.json({ success: true, aiReply, sentimentScore });

    } catch (error: any) {
        console.error('API /interact error:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
    }
}
