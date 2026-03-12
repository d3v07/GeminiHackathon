import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const send = (data: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    // Stream closed by client
                }
            };

            // Heartbeat every 15s to keep connection alive
            heartbeatInterval = setInterval(() => {
                send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
            }, 15000);

            // Subscribe to agent updates
            unsubscribe = adminDb.collection('agents').onSnapshot(
                (snapshot) => {
                    const agents = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                    }));
                    send(JSON.stringify(agents));
                },
                (err) => {
                    console.error('SSE Firestore listener error:', err);
                    send(JSON.stringify({ type: 'error', message: 'Listener error' }));
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
