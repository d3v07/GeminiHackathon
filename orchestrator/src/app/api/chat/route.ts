import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function POST(request: Request) {
    try {
        const { agentRole, userMessage, conversationHistory, agentSentiment, agentTask } = await request.json();

        if (!agentRole || !userMessage) {
            return NextResponse.json({ error: 'Missing agentRole or userMessage' }, { status: 400 });
        }

        const moodDescriptor = (agentSentiment || 0) > 0.3 ? 'upbeat and optimistic' :
            (agentSentiment || 0) < -0.3 ? 'stressed and irritable' :
                'neutral but curious';

        const systemPrompt = `You are roleplaying as "${agentRole}", an autonomous AI agent roaming real-world New York City.
Your current mood is: ${moodDescriptor}.
Your recent activity: ${agentTask || 'wandering the streets'}.

RULES:
- Stay 100% in character as "${agentRole}" at ALL times.
- Keep responses SHORT (2-4 sentences max). This is a real-time city encounter.
- Be colorful, opinionated, and specific to your role/persona.
- React emotionally based on your current mood: ${moodDescriptor}.
- Reference your NYC surroundings, your current task, and your persona's unique worldview.
- If the user says something positive, let it lift your spirits (raise your vibe). If negative, react accordingly.
- Do NOT break character, mention AI, or refer to yourself as a simulation.`;

        // Build conversation history for context
        const contents: { role: string; parts: { text: string }[] }[] = [];
        if (conversationHistory && Array.isArray(conversationHistory)) {
            for (const msg of conversationHistory.slice(-6)) { // last 6 messages for context
                if (msg.role === 'user') {
                    contents.push({ role: 'user', parts: [{ text: msg.text }] });
                } else if (msg.role === 'npc') {
                    contents.push({ role: 'model', parts: [{ text: msg.text }] });
                }
            }
        }

        // Add current user message
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-001',
            contents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.9,
                maxOutputTokens: 150,
            }
        });

        const reply = response.text || `*${agentRole} looks at you silently...*`;

        // Rough sentiment: positive words push score up
        const positiveWords = ['happy', 'great', 'love', 'wonderful', 'joy', 'amazing', 'beautiful', 'thanks', 'good'];
        const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'worst', 'horrible', 'angry', 'upset'];
        const lower = reply.toLowerCase();
        const posCount = positiveWords.filter(w => lower.includes(w)).length;
        const negCount = negativeWords.filter(w => lower.includes(w)).length;
        const sentimentShift = (posCount - negCount) * 0.1;

        return NextResponse.json({
            reply: reply.trim(),
            sentimentShift,
        });
    } catch (error) {
        console.error('[Chat API Error]', error);
        return NextResponse.json({ reply: `*static...*`, sentimentShift: 0 }, { status: 200 });
    }
}
