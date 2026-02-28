require('dotenv').config({ path: '.env.local' });
const { PubSub } = require('@google-cloud/pubsub');
const { LanguageServiceClient } = require('@google-cloud/language');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}
const db = admin.firestore();

// 2. Initialize Pub/Sub Client
const pubSubClient = new PubSub({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
});

const languageClient = new LanguageServiceClient({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
});

const subscriptionName = 'agent-updates-sub';

async function listenForMessages() {
    console.log(`[Pub/Sub] Listening for messages on ${subscriptionName}...`);

    try {
        const subscription = pubSubClient.subscription(subscriptionName);

        // Receive message handler
        const messageHandler = async (message) => {
            console.log(`[Pub/Sub] Received message ${message.id}:`);
            console.log(`\tData: ${message.data}`);

            try {
                // Parse the payload that Kush publishes
                const payload = JSON.parse(message.data.toString());
                const agentId = payload.agentId || message.attributes.agentId;

                if (!agentId) {
                    console.error("[Pub/Sub Error] Missing agentId in message.");
                    message.ack();
                    return;
                }

                console.log(`[Pub/Sub] Updating Firestore for Agent: ${agentId}`);

                // Analyze Sentiment if there is a thought
                let sentiment = { score: 0, magnitude: 0 };
                if (payload.currentThought) {
                    try {
                        const [result] = await languageClient.analyzeSentiment({
                            document: {
                                content: payload.currentThought,
                                type: 'PLAIN_TEXT',
                            },
                        });
                        sentiment = result.documentSentiment;
                        console.log(`[Sentiment] ${agentId} Score: ${sentiment.score}`);
                    } catch (err) {
                        console.error("[Sentiment Error]", err);
                    }
                }

                // Write the raw telemetry directly into our Firestore durable state
                await db.collection('agents').doc(agentId).set({
                    ...payload,
                    sentimentScore: sentiment.score,
                    sentimentMagnitude: sentiment.magnitude,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`[Firestore] Successfully persisted state for ${agentId}.`);

                // Acknowledge the message so it is removed from the queue
                message.ack();
            } catch (e) {
                console.error("[Pub/Sub Processing Error]", e);
                // Nack the message to retry later (or just ack it if we want to drop bad data)
                message.ack();
            }
        };

        const errorHandler = function (error) {
            console.error(`[Pub/Sub] ERROR: ${error}`);
        };

        subscription.on('message', messageHandler);
        subscription.on('error', errorHandler);

        console.log('[Pub/Sub] Subscriber attached and running. Waiting for agent events...');

    } catch (e) {
        console.error("Failed to initialize Pub/Sub subscriber:", e);
    }
}

listenForMessages();
