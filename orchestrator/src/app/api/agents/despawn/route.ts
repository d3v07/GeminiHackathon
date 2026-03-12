import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { DespawnAgentSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = DespawnAgentSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { agentId } = parsed.data;
        const agentRef = adminDb.collection('agents').doc(agentId);
        const agentDoc = await agentRef.get();

        if (!agentDoc.exists) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        // Soft delete — mark inactive, preserve data
        await agentRef.update({
            isActive: false,
            despawnedAt: new Date().toISOString(),
        });

        return NextResponse.json({ status: 'despawned', agentId });
    } catch (e) {
        console.error('Error despawning agent:', e);
        return NextResponse.json({ error: 'Failed to despawn agent' }, { status: 500 });
    }
}
