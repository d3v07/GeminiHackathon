import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { EncounterHistorySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

type EncounterRecord = {
    id: string;
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

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const parsed = EncounterHistorySchema.safeParse({
            agentId: url.searchParams.get('agentId') || undefined,
            limit: url.searchParams.get('limit') || 20,
            offset: url.searchParams.get('offset') || 0,
        });

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { agentId, limit, offset } = parsed.data;

        const baseQuery = adminDb.collection('encounters')
            .orderBy('timestamp', 'desc')
            .offset(offset)
            .limit(limit);

        if (agentId) {
            const filteredSnapshot = await adminDb.collection('encounters')
                .where('participants', 'array-contains', agentId)
                .get();

            const encounters = filteredSnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }))
                .sort((left, right) => {
                    const leftEncounter = left as EncounterRecord;
                    const rightEncounter = right as EncounterRecord;
                    return toTimestampValue(rightEncounter.timestamp) - toTimestampValue(leftEncounter.timestamp);
                })
                .slice(offset, offset + limit);

            return NextResponse.json(encounters);
        }

        const snapshot = await baseQuery.get();
        const encounters = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json(encounters);
    } catch (e) {
        console.error('Error fetching encounter history:', e);
        return NextResponse.json({ error: 'Failed to fetch encounters' }, { status: 500 });
    }
}
