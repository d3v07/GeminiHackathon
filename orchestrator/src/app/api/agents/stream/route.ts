import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const sendRaw = (data: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    // Stream closed by client
                }
            };

            const sendEvent = (eventType: string, payload: Record<string, unknown>) => {
                try {
                    controller.enqueue(
                        encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ts: Date.now(), ...payload })}\n\n`)
                    );
                } catch {
                    // Stream closed by client
                }
            };

            // Deterministic initial event for reconnecting clients.
            sendEvent('hello', { message: 'agents stream connected' });

            // Heartbeat every 15s to keep connection alive
            heartbeatInterval = setInterval(() => {
                sendEvent('heartbeat', {});
            }, 15000);

            // Subscribe to agent updates
            unsubscribe = adminDb.collection('agents').onSnapshot(
                (snapshot) => {
                    const agents = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                    }));
                    // Keep default message payload for existing EventSource onmessage consumers.
                    sendRaw(JSON.stringify(agents));
                    sendEvent('agents', { count: agents.length });
                },
                (err) => {
                    console.error('SSE Firestore listener error:', err);
                    sendEvent('error', { message: 'Listener error' });
                }
            );
        },
        cancel() {
            if (unsubscribe) unsubscribe();
            if (heartbeatInterval) clearInterval(heartbeatInterval);
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
