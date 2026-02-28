require('dotenv').config({ path: '.env.local' });
const { PubSub } = require('@google-cloud/pubsub');
const { BigQuery } = require('@google-cloud/bigquery');

// 1. Initialize BigQuery
const bq = new BigQuery({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
});

const datasetId = 'metropolis_analytics';
const tableId = 'agent_telemetry';

// 2. Initialize Pub/Sub
const pubSubClient = new PubSub({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
});

const subscriptionName = 'agent-updates-sub-bq'; // Dedicated subscription for BQ

async function startStreamer() {
    console.log(`[BigQuery] Starting telemetry streamer on topic...`);

    // Create subscription if it doesn't exist
    try {
        const [subscription] = await pubSubClient.topic('agent-updates').createSubscription(subscriptionName);
        console.log(`[Pub/Sub] Created subscription ${subscriptionName}`);
    } catch (e) {
        if (e.code === 6) {
            console.log(`[Pub/Sub] Subscription ${subscriptionName} already exists.`);
        } else {
            console.error("Pub/Sub Error:", e);
        }
    }

    const subscription = pubSubClient.subscription(subscriptionName);

    const messageHandler = async (message) => {
        try {
            const payload = JSON.parse(message.data.toString());
            const agentId = payload.agentId || message.attributes.agentId;

            console.log(`[BigQuery] Ingesting telemetry for ${agentId}`);

            const row = {
                agentId: agentId,
                timestamp: new Date().toISOString(),
                lat: payload.lat,
                lng: payload.lng,
                status: payload.status,
                currentThought: payload.currentThought || "",
                sentimentScore: payload.sentimentScore || 0,
                sentimentMagnitude: payload.sentimentMagnitude || 0
            };

            await bq.dataset(datasetId).table(tableId).insert([row]);
            console.log(`[BigQuery] Inserted row for ${agentId}`);

            message.ack();
        } catch (e) {
            console.error("[BigQuery Streamer Error]", e);
            message.ack(); // Avoid infinite loops on bad data
        }
    };

    subscription.on('message', messageHandler);
    console.log(`[BigQuery] Streamer is live. Monitoring 'agent-updates'...`);
}

startStreamer();
