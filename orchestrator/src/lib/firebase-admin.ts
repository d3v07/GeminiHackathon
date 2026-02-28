import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    let initialized = false;
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
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
        // Fallback for Next.js build step when environment variables are unavailable or invalid
        console.warn('Initializing empty Firebase Admin app for build step.');
        admin.initializeApp({ projectId: 'demo-project' });
    }
}

const adminDb = admin.firestore();

export { adminDb };
