import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!id || id.length > 100) {
            return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
        }

        const agentDoc = await adminDb.collection('agents').doc(id).get();
        if (!agentDoc.exists) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        const agentData = { id: agentDoc.id, ...agentDoc.data() };

        // Fetch relationships
        const relSnapshot = await adminDb.collection('relationships')
            .where('participants', 'array-contains', id)
            .limit(50)
            .get();

        const relationships = relSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        // Fetch recent encounters
        const encSnapshot = await adminDb.collection('encounters')
            .where('participants', 'array-contains', id)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        const encounters = encSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({
            ...agentData,
            relationships,
            encounters,
        });
    } catch (e) {
        console.error('Error fetching agent detail:', e);
        return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
    }
}
