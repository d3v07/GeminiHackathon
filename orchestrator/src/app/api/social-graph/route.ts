import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const agentsSnapshot = await adminDb.collection('agents').get();
        const nodes = agentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                role: data.role || 'Unknown',
                lat: data.lat,
                lng: data.lng,
                sentimentScore: data.sentimentScore || 0,
                isInteracting: data.isInteracting || false,
            };
        });

        const relationshipsSnapshot = await adminDb.collection('relationships').get();
        const edges = relationshipsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                source: data.source || data.agent1,
                target: data.target || data.agent2,
                type: data.type || 'acquaintance',
                strength: data.strength || data.weight || 0.5,
                lastInteraction: data.lastInteraction || data.updatedAt || null,
            };
        });

        return NextResponse.json({ nodes, edges });
    } catch (e) {
        console.error('Error fetching social graph:', e);
        return NextResponse.json({ error: 'Failed to fetch social graph' }, { status: 500 });
    }
}
