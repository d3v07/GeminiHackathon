import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

type EncounterRecord = {
    timestamp?: number | string;
    [key: string]: unknown;
};

function toTimestampValue(value: number | string | undefined): number {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    return 0;
}

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
            .get();

        const encounters = encSnapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data(),
            }))
            .sort((left, right) => {
                const leftEncounter = left as EncounterRecord;
                const rightEncounter = right as EncounterRecord;
                return toTimestampValue(rightEncounter.timestamp) - toTimestampValue(leftEncounter.timestamp);
            })
            .slice(0, 10);

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
