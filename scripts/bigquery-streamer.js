#!/usr/bin/env node
/**
 * BigQuery Streaming Worker (Issue #38)
 *
 * Subscribes to Pub/Sub topic `agent-telemetry` and streams rows
 * into BigQuery table `metropolis.agent_telemetry`.
 *
 * Batch inserts: collects up to 10 rows or 5s, whichever comes first.
 * Dead-letter: failed rows are published to `agent-telemetry-dlq` topic.
 *
 * Usage: node scripts/bigquery-streamer.js
 */
require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const SUBSCRIPTION_NAME = 'agent-telemetry-sub';
const DLQ_TOPIC = 'agent-telemetry-dlq';
const DATASET = 'metropolis';
const TABLE = 'agent_telemetry';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;

const bigquery = new BigQuery({ projectId: PROJECT_ID });
const pubsub = new PubSub({ projectId: PROJECT_ID });

let rowBuffer = [];
let flushTimer = null;

/**
 * Ensure the BigQuery dataset and table exist with the correct schema.
 */
async function ensureTable() {
    const dataset = bigquery.dataset(DATASET);
    const [dsExists] = await dataset.exists();
    if (!dsExists) {
        await bigquery.createDataset(DATASET, { location: 'US' });
        console.log(`[BQ] Created dataset: ${DATASET}`);
    }

    const table = dataset.table(TABLE);
    const [tblExists] = await table.exists();
    if (!tblExists) {
        const schema = [
            { name: 'agentId', type: 'STRING', mode: 'REQUIRED' },
            { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'lat', type: 'FLOAT', mode: 'REQUIRED' },
            { name: 'lng', type: 'FLOAT', mode: 'REQUIRED' },
            { name: 'status', type: 'STRING', mode: 'NULLABLE' },
            { name: 'currentThought', type: 'STRING', mode: 'NULLABLE' },
            { name: 'sentimentScore', type: 'FLOAT', mode: 'NULLABLE' },
            { name: 'toolsUsed', type: 'STRING', mode: 'REPEATED' },
            { name: 'modelUsed', type: 'STRING', mode: 'NULLABLE' },
            { name: 'tokenCount', type: 'INTEGER', mode: 'NULLABLE' },
        ];
        await dataset.createTable(TABLE, { schema });
        console.log(`[BQ] Created table: ${DATASET}.${TABLE}`);
    }
}

/**
 * Flush buffered rows to BigQuery via streaming insert.
 */
async function flushRows() {
    if (rowBuffer.length === 0) return;
    const batch = rowBuffer.splice(0, rowBuffer.length);
    console.log(`[BQ] Flushing ${batch.length} rows`);

    try {
        const table = bigquery.dataset(DATASET).table(TABLE);
        await table.insert(batch);
        console.log(`[BQ] Inserted ${batch.length} rows`);
    } catch (e) {
        console.error(`[BQ] Insert failed:`, e.message);
        // Dead-letter: publish failed rows to DLQ
        try {
            const dlq = pubsub.topic(DLQ_TOPIC);
            const promises = batch.map(row =>
                dlq.publishMessage({ data: Buffer.from(JSON.stringify(row)) })
            );
            await Promise.all(promises);
            console.warn(`[DLQ] ${batch.length} rows sent to dead-letter queue`);
        } catch (dlqErr) {
            console.error(`[DLQ] Failed to publish to DLQ:`, dlqErr.message);
        }
    }
}

/**
 * Start the Pub/Sub subscription listener.
 */
async function main() {
    await ensureTable();

    const subscription = pubsub.subscription(SUBSCRIPTION_NAME);
    const [exists] = await subscription.exists();
    if (!exists) {
        const topic = pubsub.topic('agent-telemetry');
        await topic.createSubscription(SUBSCRIPTION_NAME, {
            ackDeadlineSeconds: 30,
        });
        console.log(`[PubSub] Created subscription: ${SUBSCRIPTION_NAME}`);
    }

    console.log(`[Streamer] Listening on ${SUBSCRIPTION_NAME}...`);

    flushTimer = setInterval(flushRows, FLUSH_INTERVAL_MS);

    subscription.on('message', (message) => {
        try {
            const event = JSON.parse(message.data.toString());
            rowBuffer.push({
                agentId: event.agentId,
                timestamp: event.timestamp,
                lat: event.lat,
                lng: event.lng,
                status: event.status || null,
                currentThought: (event.currentThought || '').substring(0, 500),
                sentimentScore: event.sentimentScore || 0,
                toolsUsed: Array.isArray(event.toolsUsed) ? event.toolsUsed : [],
                modelUsed: event.modelUsed || null,
                tokenCount: event.tokenCount || 0,
            });
            message.ack();

            if (rowBuffer.length >= BATCH_SIZE) {
                flushRows();
            }
        } catch (e) {
            console.error('[Streamer] Bad message:', e.message);
            message.nack();
        }
    });

    subscription.on('error', (err) => {
        console.error('[Streamer] Subscription error:', err.message);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('[Streamer] Shutting down...');
        clearInterval(flushTimer);
        await flushRows();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        clearInterval(flushTimer);
        await flushRows();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error('[Streamer] Fatal:', err);
    process.exit(1);
});
