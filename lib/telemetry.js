/**
 * Agent Telemetry Pipeline (Issue #38)
 *
 * Publishes agent tick data to Google Cloud Pub/Sub topic `agent-telemetry`.
 * Batches messages locally (10 rows or 5s) before flushing.
 * Falls back to console logging when Pub/Sub is unavailable (local dev).
 */
require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');
const logger = require('./logger').child({ module: 'telemetry' });

const TOPIC_NAME = 'agent-telemetry';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;

let _pubsub = null;
let _topic = null;
let _buffer = [];
let _flushTimer = null;
let _initialized = false;
let _disabled = false;

function init() {
    if (_initialized || _disabled) return;
    _initialized = true;
    try {
        _pubsub = new PubSub({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
        _topic = _pubsub.topic(TOPIC_NAME, {
            batching: { maxMessages: BATCH_SIZE, maxMilliseconds: FLUSH_INTERVAL_MS },
        });
        logger.info('Pub/Sub publisher initialized');
    } catch (e) {
        logger.warn({ err: e.message }, 'Pub/Sub unavailable, falling back to logs');
        _disabled = true;
    }
}

/**
 * Build a telemetry event from the cognitive step result.
 */
function buildEvent(agentId, state, action, meta = {}) {
    return {
        agentId,
        timestamp: new Date().toISOString(),
        lat: state.lat,
        lng: state.lng,
        status: action || 'idle',
        currentThought: (state.history?.slice(-1)[0]?.parts?.[0]?.text || '').substring(0, 500),
        sentimentScore: state.sentimentScore || 0,
        toolsUsed: meta.toolsUsed || [],
        modelUsed: meta.modelUsed || 'unknown',
        tokenCount: meta.tokenCount || 0,
    };
}

/**
 * Publish a telemetry event. Buffers locally and flushes to Pub/Sub.
 */
async function publishTelemetry(agentId, state, action, meta = {}) {
    const event = buildEvent(agentId, state, action, meta);
    init();

    if (_disabled || !_topic) {
        // Fallback: buffer to local array (for dev inspection)
        _buffer.push(event);
        if (_buffer.length >= BATCH_SIZE) {
            logger.info({ count: _buffer.length }, 'Local buffer flush');
            _buffer = [];
        }
        return event;
    }

    try {
        const data = Buffer.from(JSON.stringify(event));
        await _topic.publishMessage({ data });
    } catch (e) {
        logger.warn({ err: e.message }, 'Pub/Sub publish failed');
        _buffer.push(event);
    }

    return event;
}

/**
 * Flush any remaining buffered events. Call on graceful shutdown.
 */
async function flushTelemetry() {
    if (_topic && _buffer.length > 0) {
        const promises = _buffer.map(evt =>
            _topic.publishMessage({ data: Buffer.from(JSON.stringify(evt)) })
                .catch(e => logger.warn({ err: e.message }, 'Flush failed'))
        );
        await Promise.all(promises);
        _buffer = [];
    }
    if (_flushTimer) clearInterval(_flushTimer);
}

module.exports = { publishTelemetry, flushTelemetry, buildEvent };
