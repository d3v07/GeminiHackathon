#!/usr/bin/env node
/**
 * Observability integration test — verifies logging, metrics, cost tracking,
 * and /api/metrics API all work together (Issue #98).
 *
 * Usage: node scripts/obs-integration-test.js [worker_url] [frontend_url]
 * Defaults: worker=http://localhost:9090, frontend=http://localhost:3000
 */
const workerUrl = process.argv[2] || 'http://localhost:9090';
const frontendUrl = process.argv[3] || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✓ ${label}`);
        passed++;
    } else {
        console.error(`  ✗ ${label}`);
        failed++;
    }
}

async function fetchJSON(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
}

async function fetchText(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.text();
}

async function testPrometheusMetrics() {
    console.log('\n[1] Prometheus /metrics endpoint');
    try {
        const text = await fetchText(`${workerUrl}/metrics`);
        assert(text.includes('cognitive_steps_total'), 'cognitive_steps_total present');
        assert(text.includes('tool_calls_total'), 'tool_calls_total present');
        assert(text.includes('gemini_tokens_total'), 'gemini_tokens_total present');
        assert(text.includes('gemini_calls_total'), 'gemini_calls_total present');
        assert(text.includes('encounters_total'), 'encounters_total present');
        assert(text.includes('active_workflows'), 'active_workflows present');
        assert(text.includes('process_cpu'), 'default Node.js metrics present');
    } catch (e) {
        console.error(`  ✗ Failed to reach worker metrics: ${e.message}`);
        failed += 7;
    }
}

async function testApiMetrics() {
    console.log('\n[2] /api/metrics orchestrator endpoint');
    try {
        const data = await fetchJSON(`${frontendUrl}/api/metrics`);
        assert(typeof data.agents === 'number', 'agents count is a number');
        assert(typeof data.encountersToday === 'number', 'encountersToday is a number');
        assert(data.tokens && typeof data.tokens.input === 'number', 'tokens.input present');
        assert(data.tokens && typeof data.tokens.output === 'number', 'tokens.output present');
        assert(typeof data.geminiCalls === 'number', 'geminiCalls present');
        assert(typeof data.cognitiveSteps === 'number', 'cognitiveSteps present');
    } catch (e) {
        console.error(`  ✗ Failed to reach /api/metrics: ${e.message}`);
        failed += 6;
    }
}

async function testHealthEndpoint() {
    console.log('\n[3] Health endpoints');
    try {
        const health = await fetchJSON(`${frontendUrl}/api/healthz`);
        assert(health.status === 'ok', 'orchestrator /api/healthz returns ok');
    } catch (e) {
        console.error(`  ✗ Orchestrator healthz failed: ${e.message}`);
        failed++;
    }
    try {
        const wHealth = await fetchJSON(`http://localhost:8080/`);
        assert(wHealth.status === 'ok', 'worker health on :8080 returns ok');
    } catch (e) {
        console.error(`  ✗ Worker health failed: ${e.message}`);
        failed++;
    }
}

async function testStructuredLogs() {
    console.log('\n[4] Structured logging verification');
    // Verify logger module loads and produces JSON
    try {
        const logger = require('../lib/logger');
        assert(typeof logger.info === 'function', 'logger.info is a function');
        assert(typeof logger.child === 'function', 'logger.child is a function');
        assert(typeof logger.error === 'function', 'logger.error is a function');
    } catch (e) {
        console.error(`  ✗ Logger import failed: ${e.message}`);
        failed += 3;
    }
}

async function testCostModule() {
    console.log('\n[5] Cost calculation module');
    try {
        const { calculateCost, PRICING } = require('../lib/cost');
        assert(typeof calculateCost === 'function', 'calculateCost exported');
        assert(Object.keys(PRICING).length >= 2, 'PRICING has flash + pro models');

        const cost = calculateCost('gemini-2.5-flash-preview-05-20', 1000, 500);
        assert(cost.inputCost > 0, 'flash input cost > 0');
        assert(cost.outputCost > 0, 'flash output cost > 0');
        assert(cost.totalCost === cost.inputCost + cost.outputCost, 'totalCost = input + output');
        assert(cost.totalCost < 0.001, 'flash cost for 1K/500 tokens is < $0.001');
    } catch (e) {
        console.error(`  ✗ Cost module error: ${e.message}`);
        failed += 5;
    }
}

async function testMetricsRegistry() {
    console.log('\n[6] Metrics registry');
    try {
        const { register } = require('../lib/metrics');
        const output = await register.metrics();
        assert(output.length > 0, 'registry produces non-empty metrics output');
        assert(output.includes('# HELP'), 'output contains HELP comments');
        assert(output.includes('# TYPE'), 'output contains TYPE comments');
    } catch (e) {
        console.error(`  ✗ Metrics registry error: ${e.message}`);
        failed += 3;
    }
}

async function main() {
    console.log('=== Observability Integration Test ===');
    console.log(`Worker: ${workerUrl}  |  Frontend: ${frontendUrl}\n`);

    // Module-level tests (always runnable)
    await testStructuredLogs();
    await testCostModule();
    await testMetricsRegistry();

    // Network tests (require running services)
    await testPrometheusMetrics();
    await testApiMetrics();
    await testHealthEndpoint();

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
