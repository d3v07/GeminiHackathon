import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

if (!admin.apps.length) {
    let initialized = false;

    // 1. Try loading from absolute firebase-admin-key.json in project root
    try {
        const rootPath = path.resolve(process.cwd(), '..');
        const keyPath = path.join(rootPath, 'firebase-admin-key.json');

        if (fs.existsSync(keyPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            initialized = true;
            console.log('Firebase admin properly injected via root JSON key.');
        } else {
            // Check fallback for local dev execution context
            const localKeyPath = path.join(process.cwd(), 'firebase-admin-key.json');
            if (fs.existsSync(localKeyPath)) {
                const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                initialized = true;
                console.log('Firebase admin properly injected via local JSON key.');
            }
        }
    } catch (err) {
        console.warn('Failed to parse admin json key, falling back to ENV vars...');
    }

    if (!initialized && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
        try {
            let pk = process.env.FIREBASE_PRIVATE_KEY;
            pk = pk.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: pk,
                }),
            });
            initialized = true;
        } catch (error) {
            console.error('Firebase admin initialization error', error);
        }
    }

    if (!initialized) {
        console.warn('Initializing empty Firebase Admin app for build step.');
        admin.initializeApp({ projectId: 'demo-project' });
    }
}

const adminDb = admin.firestore();

export { adminDb };
