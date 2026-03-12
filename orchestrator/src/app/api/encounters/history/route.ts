import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { EncounterHistorySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

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

        let query = adminDb.collection('encounters')
            .orderBy('timestamp', 'desc')
            .offset(offset)
            .limit(limit);

        if (agentId) {
            query = adminDb.collection('encounters')
                .where('participants', 'array-contains', agentId)
                .orderBy('timestamp', 'desc')
                .offset(offset)
                .limit(limit);
        }

        const snapshot = await query.get();
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
