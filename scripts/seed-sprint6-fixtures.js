#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_KEY_PATH = path.join(ROOT, 'firebase-admin-key.json');

function initFirebaseAdmin() {
    if (admin.apps.length > 0) {
        return admin.firestore();
    }

    const keyPath = process.env.FIREBASE_ADMIN_KEY_PATH || DEFAULT_KEY_PATH;
    const hasServiceAccountEnv = Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

    if (hasServiceAccountEnv) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
        return admin.firestore();
    }

    if (fs.existsSync(keyPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        return admin.firestore();
    }

    admin.initializeApp();
    return admin.firestore();
}

async function seed() {
    const db = initFirebaseAdmin();

    const agents = {
        'npc-guide-demo': {
            role: 'Guide',
            personality: 'Helpful city guide',
            lat: 40.758,
            lng: -73.9855,
            sentimentScore: 0.4,
            isInteracting: false,
            isActive: true,
            createdAt: '2026-03-12T00:00:00.000Z',
            lastUpdated: '2026-03-12T00:00:00.000Z',
        },
        'npc-vendor-demo': {
            role: 'Vendor',
            personality: 'Busy street vendor',
            lat: 40.757,
            lng: -73.986,
            sentimentScore: 0.2,
            isInteracting: true,
            isActive: true,
            createdAt: '2026-03-12T00:00:00.000Z',
            lastUpdated: '2026-03-12T00:00:00.000Z',
        },
    };

    const relationships = {
        'rel-guide-vendor': {
            source: 'npc-guide-demo',
            target: 'npc-vendor-demo',
            participants: ['npc-guide-demo', 'npc-vendor-demo'],
            type: 'acquaintance',
            strength: 0.6,
            updatedAt: '2026-03-12T00:00:00.000Z',
        },
    };

    const encounters = {
        'enc-demo-1': {
            participants: ['npc-guide-demo', 'npc-vendor-demo'],
            timestamp: 1741737600000,
            summary: 'Guide asked vendor about lunch rush',
        },
    };

    const simulationConfig = {
        paused: false,
        speed: '1x',
        sleepInterval: 20000,
    };

    const writes = [];

    Object.entries(agents).forEach(([id, data]) => {
        writes.push(db.collection('agents').doc(id).set(data, { merge: true }));
    });

    Object.entries(relationships).forEach(([id, data]) => {
        writes.push(db.collection('relationships').doc(id).set(data, { merge: true }));
    });

    Object.entries(encounters).forEach(([id, data]) => {
        writes.push(db.collection('encounters').doc(id).set(data, { merge: true }));
    });

    writes.push(db.collection('config').doc('simulation').set(simulationConfig, { merge: true }));

    await Promise.all(writes);

    console.log('[seed:s6] seeded fixtures');
    console.log('[seed:s6] agents:', Object.keys(agents).length);
    console.log('[seed:s6] relationships:', Object.keys(relationships).length);
    console.log('[seed:s6] encounters:', Object.keys(encounters).length);
}

seed().catch((err) => {
    console.error('[seed:s6] failed:', err.message);
    process.exit(1);
});
