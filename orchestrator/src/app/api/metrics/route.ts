import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Active agents count
        const agentsSnap = await adminDb.collection('agents').get();
        const agentCount = agentsSnap.size;

        // Today's encounters
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const encountersSnap = await adminDb.collection('encounters')
            .where('timestamp', '>=', todayStart.getTime())
            .get();
        const encountersToday = encountersSnap.size;

        // Fetch Prometheus metrics from worker if available
        let promMetrics: Record<string, number> = {};
        try {
            const metricsUrl = process.env.WORKER_METRICS_URL || 'http://worker:9090/metrics';
            const res = await fetch(metricsUrl, { signal: AbortSignal.timeout(2000) });
            const text = await res.text();
            promMetrics = parsePromMetrics(text);
        } catch {
            // Worker metrics unavailable — return what we have
        }

        return NextResponse.json({
            agents: agentCount,
            encountersToday,
            tokens: {
                input: promMetrics['gemini_tokens_total_input'] || 0,
                output: promMetrics['gemini_tokens_total_output'] || 0,
            },
            geminiCalls: promMetrics['gemini_calls_total'] || 0,
            cognitiveSteps: promMetrics['cognitive_steps_total'] || 0,
            toolCalls: promMetrics['tool_calls_total'] || 0,
            toolErrors: promMetrics['tool_call_errors_total'] || 0,
        });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
    }
}

function parsePromMetrics(text: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const line of text.split('\n')) {
        if (line.startsWith('#') || !line.trim()) continue;
        // Aggregate counters by base name + direction label
        const dirMatch = line.match(/^(\w+)\{.*direction="(input|output)".*\}\s+([\d.e+]+)/);
        if (dirMatch) {
            const key = `${dirMatch[1]}_${dirMatch[2]}`;
            result[key] = (result[key] || 0) + parseFloat(dirMatch[3]);
            continue;
        }
        const match = line.match(/^(\w+?)(?:\{[^}]*\})?\s+([\d.e+]+)/);
        if (match) {
            result[match[1]] = (result[match[1]] || 0) + parseFloat(match[2]);
        }
    }
    return result;
}
