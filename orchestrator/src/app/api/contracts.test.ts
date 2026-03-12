import { beforeEach, describe, expect, it, vi } from 'vitest';

type DocData = Record<string, unknown>;

type CollectionStore = Record<string, Record<string, DocData>>;

type SnapshotDoc = {
    id: string;
    data: () => DocData;
    exists?: boolean;
};

const store: CollectionStore = {
    agents: {},
    relationships: {},
    encounters: {},
    config: {},
};

const failures: Record<string, boolean> = {
    agents: false,
    relationships: false,
    encounters: false,
    config: false,
};

const resetStore = () => {
    store.agents = {
        a1: { role: 'Tourist', lat: 40.76, lng: -73.98, sentimentScore: 0.4, isInteracting: false },
        a2: { role: 'Vendor', lat: 40.75, lng: -73.99, sentimentScore: 0.1, isInteracting: true },
    };
    store.relationships = {
        r1: { source: 'a1', target: 'a2', type: 'ally', strength: 0.8, participants: ['a1', 'a2'] },
    };
    store.encounters = {
        e1: { participants: ['a1', 'a2'], timestamp: 2, summary: 'met' },
        e2: { participants: ['a1'], timestamp: 1, summary: 'solo' },
    };
    store.config = {
        simulation: { paused: false, speed: '1x', sleepInterval: 20000 },
    };

    Object.keys(failures).forEach((k) => {
        failures[k] = false;
    });
};

const toSnapshotDocs = (docs: Array<[string, DocData]>): SnapshotDoc[] =>
    docs.map(([id, value]) => ({
        id,
        data: () => value,
    }));

const createQuery = (collectionName: string, rows: Array<[string, DocData]>) => {
    const queryState = {
        rows,
        offsetCount: 0,
        limitCount: Number.POSITIVE_INFINITY,
    };

    const query = {
        where(field: string, op: string, value: unknown) {
            if (op === 'array-contains') {
                queryState.rows = queryState.rows.filter(([, data]) => {
                    const arr = data[field] as unknown[] | undefined;
                    return Array.isArray(arr) && arr.includes(value);
                });
            }
            return query;
        },
        orderBy(field: string, direction: string = 'asc') {
            queryState.rows = [...queryState.rows].sort(([, a], [, b]) => {
                const av = a[field] as number | string | undefined;
                const bv = b[field] as number | string | undefined;
                if (av === bv) return 0;
                if (av === undefined) return 1;
                if (bv === undefined) return -1;
                const cmp = av > bv ? 1 : -1;
                return direction === 'desc' ? -cmp : cmp;
            });
            return query;
        },
        offset(amount: number) {
            queryState.offsetCount = amount;
            return query;
        },
        limit(amount: number) {
            queryState.limitCount = amount;
            return query;
        },
        async get() {
            if (failures[collectionName]) {
                throw new Error(`forced ${collectionName} failure`);
            }
            const sliced = queryState.rows
                .slice(queryState.offsetCount)
                .slice(0, queryState.limitCount);
            return { docs: toSnapshotDocs(sliced) };
        },
    };

    return query;
};

const collection = (name: string) => {
    const readRows = () => Object.entries(store[name] ?? {});

    return {
        where(field: string, op: string, value: unknown) {
            return createQuery(name, readRows()).where(field, op, value);
        },
        orderBy(field: string, direction: string = 'asc') {
            return createQuery(name, readRows()).orderBy(field, direction);
        },
        offset(amount: number) {
            return createQuery(name, readRows()).offset(amount);
        },
        limit(amount: number) {
            return createQuery(name, readRows()).limit(amount);
        },
        async get() {
            if (failures[name]) {
                throw new Error(`forced ${name} failure`);
            }
            return { docs: toSnapshotDocs(readRows()) };
        },
        doc(id: string) {
            return {
                async get() {
                    if (failures[name]) {
                        throw new Error(`forced ${name} failure`);
                    }
                    const value = store[name]?.[id];
                    return {
                        id,
                        exists: Boolean(value),
                        data: () => value,
                    };
                },
                async set(data: DocData, opts?: { merge?: boolean }) {
                    const existing = store[name]?.[id] ?? {};
                    store[name] = {
                        ...store[name],
                        [id]: opts?.merge ? { ...existing, ...data } : { ...data },
                    };
                },
                async update(data: DocData) {
                    const existing = store[name]?.[id];
                    if (!existing) {
                        throw new Error(`doc ${id} missing`);
                    }
                    store[name] = {
                        ...store[name],
                        [id]: { ...existing, ...data },
                    };
                },
            };
        },
    };
};

vi.mock('@/lib/firebase-admin', () => ({
    adminDb: {
        collection,
    },
}));

describe('API contract tests for Sprint 6 backend routes', () => {
    beforeEach(() => {
        resetStore();
    });

    it('GET /api/social-graph returns nodes and edges', async () => {
        const { GET } = await import('./social-graph/route');
        const response = await GET();
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.nodes)).toBe(true);
        expect(Array.isArray(body.edges)).toBe(true);
        expect(body.nodes[0]).toMatchObject({ id: 'a1', role: 'Tourist' });
        expect(body.edges[0]).toMatchObject({ source: 'a1', target: 'a2', type: 'ally' });
    });

    it('GET /api/social-graph returns 500 on datastore failure', async () => {
        failures.agents = true;
        const { GET } = await import('./social-graph/route');
        const response = await GET();
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({ error: 'Failed to fetch social graph' });
    });

    it('GET /api/encounters/history supports pagination and filters', async () => {
        const { GET } = await import('./encounters/history/route');
        const response = await GET(new Request('http://localhost/api/encounters/history?agentId=a1&limit=1&offset=0'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toHaveLength(1);
        expect(body[0]).toHaveProperty('participants');
    });

    it('GET /api/encounters/history rejects invalid limit', async () => {
        const { GET } = await import('./encounters/history/route');
        const response = await GET(new Request('http://localhost/api/encounters/history?limit=0'));
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: 'Invalid parameters' });
    });

    it('GET /api/agents/[id] returns agent detail with related collections', async () => {
        const { GET } = await import('./agents/[id]/route');
        const response = await GET(new Request('http://localhost/api/agents/a1'), { params: Promise.resolve({ id: 'a1' }) });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.id).toBe('a1');
        expect(Array.isArray(body.relationships)).toBe(true);
        expect(Array.isArray(body.encounters)).toBe(true);
    });

    it('GET /api/agents/[id] rejects invalid id', async () => {
        const { GET } = await import('./agents/[id]/route');
        const response = await GET(new Request('http://localhost/api/agents/x'), {
            params: Promise.resolve({ id: 'x'.repeat(101) }),
        });
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: 'Invalid agent ID' });
    });

    it('POST /api/simulation/control supports pause and GET returns status', async () => {
        const { POST, GET } = await import('./simulation/control/route');
        const pauseResponse = await POST(
            new Request('http://localhost/api/simulation/control', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'pause' }),
            })
        );
        expect(pauseResponse.status).toBe(200);
        await expect(pauseResponse.json()).resolves.toMatchObject({ status: 'paused' });

        const getResponse = await GET();
        expect(getResponse.status).toBe(200);
        await expect(getResponse.json()).resolves.toMatchObject({ status: 'paused' });
    });

    it('POST /api/simulation/control rejects invalid action payload', async () => {
        const { POST } = await import('./simulation/control/route');
        const response = await POST(
            new Request('http://localhost/api/simulation/control', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'warp' }),
            })
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: 'Invalid input' });
    });

    it('GET /api/simulation/status returns current config snapshot', async () => {
        const { GET } = await import('./simulation/status/route');
        const response = await GET();
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ speed: '1x', sleepInterval: 20000 });
    });

    it('GET /api/simulation/status returns 500 on config read failure', async () => {
        failures.config = true;
        const { GET } = await import('./simulation/status/route');
        const response = await GET();
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({ error: 'Failed to fetch status' });
    });

    it('POST /api/agents/spawn creates agent and returns 201', async () => {
        const { POST } = await import('./agents/spawn/route');
        const response = await POST(
            new Request('http://localhost/api/agents/spawn', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ role: 'Guide', lat: 40.758, lng: -73.9855 }),
            })
        );
        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.agentId).toContain('npc-guide-');
        expect(body.role).toBe('Guide');
    });

    it('POST /api/agents/spawn rejects invalid payload', async () => {
        const { POST } = await import('./agents/spawn/route');
        const response = await POST(
            new Request('http://localhost/api/agents/spawn', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            })
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: 'Invalid input' });
    });

    it('POST /api/agents/despawn soft-deletes existing agent', async () => {
        const { POST } = await import('./agents/despawn/route');
        const response = await POST(
            new Request('http://localhost/api/agents/despawn', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ agentId: 'a1' }),
            })
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ status: 'despawned', agentId: 'a1' });
    });

    it('POST /api/agents/despawn returns 404 for missing agent', async () => {
        const { POST } = await import('./agents/despawn/route');
        const response = await POST(
            new Request('http://localhost/api/agents/despawn', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ agentId: 'missing-agent' }),
            })
        );
        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({ error: 'Agent not found' });
    });

    it('GET /api/state applies bounds filter', async () => {
        const { GET } = await import('./state/route');
        const response = await GET(new Request('http://localhost/api/state?bounds=40.759,-73.981,40.8,-73.9'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.agents)).toBe(true);
        expect(body.agents).toHaveLength(1);
        expect(body.agents[0]).toMatchObject({ id: 'a1' });
    });

    it('GET /api/state returns 500 on encounters datastore failure', async () => {
        failures.encounters = true;
        const { GET } = await import('./state/route');
        const response = await GET(new Request('http://localhost/api/state'));
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({ error: 'Failed to fetch state' });
    });
});
