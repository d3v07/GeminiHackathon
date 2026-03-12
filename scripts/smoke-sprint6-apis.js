#!/usr/bin/env node
/* eslint-disable no-console */

const BASE_URL = process.env.ORCHESTRATOR_BASE_URL || 'http://localhost:3000';

const jsonHeaders = { 'content-type': 'application/json' };

async function requestJson(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, options);
    let payload;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }
    return { url, status: response.status, ok: response.ok, payload };
}

function assertOk(label, result) {
    if (!result.ok) {
        throw new Error(`${label} failed (${result.status}) ${result.url}`);
    }
    console.log(`[smoke:s6] OK ${label} (${result.status})`);
}

async function main() {
    console.log('[smoke:s6] base url:', BASE_URL);

    const social = await requestJson('/api/social-graph');
    assertOk('GET /api/social-graph', social);

    const encounters = await requestJson('/api/encounters/history?limit=5');
    assertOk('GET /api/encounters/history', encounters);

    const simStatus = await requestJson('/api/simulation/status');
    assertOk('GET /api/simulation/status', simStatus);

    const simPause = await requestJson('/api/simulation/control', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ action: 'pause' }),
    });
    assertOk('POST /api/simulation/control pause', simPause);

    const spawn = await requestJson('/api/agents/spawn', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ role: 'SmokeTester', lat: 40.758, lng: -73.9855 }),
    });
    assertOk('POST /api/agents/spawn', spawn);

    const agentId = spawn.payload?.agentId;
    if (!agentId) {
        throw new Error('spawn response missing agentId');
    }

    const detail = await requestJson(`/api/agents/${agentId}`);
    assertOk('GET /api/agents/[id]', detail);

    const bounds = await requestJson('/api/state?bounds=40.70,-74.05,40.85,-73.90');
    assertOk('GET /api/state?bounds=...', bounds);

    const despawn = await requestJson('/api/agents/despawn', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ agentId }),
    });
    assertOk('POST /api/agents/despawn', despawn);

    console.log('[smoke:s6] all checks passed');
}

main().catch((err) => {
    console.error('[smoke:s6] failed:', err.message);
    process.exit(1);
});
