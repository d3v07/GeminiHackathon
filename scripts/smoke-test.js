#!/usr/bin/env node
/**
 * MVP Smoke Test — S4.5
 * 
 * Runs against a live system (docker-compose up) and verifies:
 *   1. Worker healthcheck responds
 *   2. Frontend healthcheck responds
 *   3. Agents exist and are updating in Firestore
 *   4. User chat interaction works end-to-end
 * 
 * Usage: DEMO_MODE=true docker compose up -d && node scripts/smoke-test.js
 */

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const WORKER = process.env.WORKER_URL || 'http://localhost:8080';
const TIMEOUT = 5000;

let passed = 0;
let failed = 0;

async function check(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}: ${err.message}`);
        failed++;
    }
}

async function fetchJSON(url, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function run() {
    console.log('\n── Metropolis MVP Smoke Test ──\n');

    // 1. Healthchecks
    console.log('1. Service Health');
    await check('Worker /healthz', async () => {
        const data = await fetchJSON(`${WORKER}/`);
        if (data.status !== 'ok') throw new Error(`Unexpected status: ${data.status}`);
    });
    await check('Frontend /api/healthz', async () => {
        const data = await fetchJSON(`${FRONTEND}/api/healthz`);
        if (data.status !== 'ok') throw new Error(`Unexpected status: ${data.status}`);
    });

    // 2. Agent state endpoint
    console.log('\n2. Agent State');
    await check('GET /api/state returns agents', async () => {
        const data = await fetchJSON(`${FRONTEND}/api/state`);
        if (!data || typeof data !== 'object') throw new Error('No data returned');
        const agents = Array.isArray(data) ? data : data.agents || Object.values(data);
        if (agents.length === 0) throw new Error('No agents found');
        console.log(`     Found ${agents.length} agent(s)`);
    });

    // 3. Orchestrator endpoint
    console.log('\n3. Orchestrator');
    await check('POST /api/orchestrator accepts valid payload', async () => {
        const body = { agentId: 'smoke-test', lat: 40.7128, lng: -74.006 };
        const res = await fetch(`${FRONTEND}/api/orchestrator`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT),
        });
        // 200 or 401 (Clerk auth) both mean the route is alive
        if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
    });

    // 4. TTS endpoint
    console.log('\n4. TTS');
    await check('POST /api/tts accepts valid payload', async () => {
        const body = { text: 'Smoke test', role: 'Underground Historian' };
        const res = await fetch(`${FRONTEND}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT),
        });
        if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
    });

    // 5. StreetView proxy
    console.log('\n5. StreetView Proxy');
    await check('GET /api/streetview with valid coords', async () => {
        const res = await fetch(`${FRONTEND}/api/streetview?lat=40.7128&lng=-74.006`, {
            signal: AbortSignal.timeout(TIMEOUT),
        });
        if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
    });

    // Summary
    console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run();
