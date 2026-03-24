import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { SpawnAgentSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = SpawnAgentSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { role, personality, lat, lng } = parsed.data;
        const agentId = `npc-${role.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;

        const agentData = {
            role,
            personality: personality || `A ${role} going about their day in NYC`,
            lat,
            lng,
            sentimentScore: 0,
            isInteracting: false,
            isActive: true,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
        };

        await adminDb.collection('agents').doc(agentId).set(agentData);

        return NextResponse.json({ agentId, ...agentData }, { status: 201 });
    } catch (e) {
        console.error('Error spawning agent:', e);
        return NextResponse.json({ error: 'Failed to spawn agent' }, { status: 500 });
    }
}
