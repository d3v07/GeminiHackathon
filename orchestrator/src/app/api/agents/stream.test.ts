import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotDoc = { id: string; data: () => Record<string, unknown> };

type Snapshot = { docs: SnapshotDoc[] };

const unsubscribe = vi.fn();
let snapshotHandler: ((snapshot: Snapshot) => void) | undefined;
let errorHandler: ((error: unknown) => void) | undefined;

vi.mock('@/lib/firebase-admin', () => ({
    adminDb: {
        collection: () => ({
            onSnapshot: (
                onNext: (snapshot: Snapshot) => void,
                onError: (error: unknown) => void
            ) => {
                snapshotHandler = onNext;
                errorHandler = onError;
                return unsubscribe;
            },
        }),
    },
}));

const decoder = new TextDecoder();

const readChunk = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const result = await reader.read();
    if (result.done || !result.value) {
        return '';
    }
    return decoder.decode(result.value);
};

describe('GET /api/agents/stream', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        unsubscribe.mockReset();
        snapshotHandler = undefined;
        errorHandler = undefined;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('emits deterministic hello event on connect', async () => {
        const { GET } = await import('./stream/route');
        const response = await GET();
        const reader = response.body?.getReader();

        expect(response.headers.get('Content-Type')).toBe('text/event-stream');
        expect(reader).toBeTruthy();

        const firstChunk = await readChunk(reader!);
        expect(firstChunk).toContain('event: hello');
        expect(firstChunk).toContain('"type":"hello"');
        expect(firstChunk).toContain('"message":"agents stream connected"');

        await reader?.cancel();
    });

    it('emits default array payload plus typed agents event on snapshot', async () => {
        const { GET } = await import('./stream/route');
        const response = await GET();
        const reader = response.body!.getReader();

        await readChunk(reader);
        snapshotHandler?.({
            docs: [
                { id: 'a1', data: () => ({ role: 'Guide' }) },
                { id: 'a2', data: () => ({ role: 'Vendor' }) },
            ],
        });

        const dataChunk = await readChunk(reader);
        const metaChunk = await readChunk(reader);

        expect(dataChunk).toContain('data: [{"id":"a1"');
        expect(metaChunk).toContain('event: agents');
        expect(metaChunk).toContain('"type":"agents"');
        expect(metaChunk).toContain('"count":2');

        await reader.cancel();
    });

    it('emits heartbeat event metadata every 15 seconds', async () => {
        const { GET } = await import('./stream/route');
        const response = await GET();
        const reader = response.body!.getReader();

        await readChunk(reader);

        vi.advanceTimersByTime(15000);
        const heartbeatChunk = await readChunk(reader);

        expect(heartbeatChunk).toContain('event: heartbeat');
        expect(heartbeatChunk).toContain('"type":"heartbeat"');

        await reader.cancel();
    });

    it('emits typed error event when Firestore listener fails', async () => {
        const { GET } = await import('./stream/route');
        const response = await GET();
        const reader = response.body!.getReader();

        await readChunk(reader);
        errorHandler?.(new Error('listener failed'));

        const errorChunk = await readChunk(reader);
        expect(errorChunk).toContain('event: error');
        expect(errorChunk).toContain('"type":"error"');
        expect(errorChunk).toContain('"message":"Listener error"');

        await reader.cancel();
    });

    it('cleans up interval and unsubscribe on stream cancel', async () => {
        const { GET } = await import('./stream/route');
        const response = await GET();
        const reader = response.body!.getReader();

        await readChunk(reader);
        await reader.cancel();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});
