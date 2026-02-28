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

admin.firestore().collection('agents').limit(3).get().then(snap => {
    snap.docs.forEach(doc => console.log(doc.id, '->', doc.data().role));
    process.exit(0);
});
