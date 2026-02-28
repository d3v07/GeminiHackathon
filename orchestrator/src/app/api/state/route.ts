import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const agentsSnapshot = await adminDb.collection('agents').get();
        const agents = agentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        const encountersSnapshot = await adminDb.collection('encounters')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        const encounters = encountersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json({ agents, encounters });
    } catch (e) {
        console.error("Error fetching state:", e);
        return NextResponse.json({ error: "Failed to fetch state" }, { status: 500 });
    }
}
