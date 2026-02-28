require('dotenv').config({ path: 'orchestrator/.env.local' });
const admin = require('firebase-admin');
const fs = require('fs');
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
try {
    const match = fs.readFileSync('orchestrator/.env.local', 'utf8').match(/FIREBASE_PRIVATE_KEY="([^"]+)"/);
    if (match) privateKey = match[1];
} catch (e) {}

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey.replace(/\\n/g, '\n')
    })
});

admin.firestore().collection('agents').get().then(snap => {
    let promises = [];
    snap.docs.forEach(doc => {
        if (!doc.id.startsWith('npc-')) {
            console.log('Deleting stale agent:', doc.id);
            promises.push(doc.ref.delete());
        }
    });
    Promise.all(promises).then(() => {
        console.log("Cleanup complete.");
        process.exit(0);
    });
});
