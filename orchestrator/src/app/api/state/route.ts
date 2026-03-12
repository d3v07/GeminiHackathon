import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const boundsParam = url.searchParams.get('bounds');

        const agentsSnapshot = await adminDb.collection('agents').get();
        let agents = agentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Apply bounding box filter if provided
        if (boundsParam) {
            const parts = boundsParam.split(',').map(Number);
            if (parts.length === 4 && parts.every(n => !Number.isNaN(n))) {
                const [lat1, lng1, lat2, lng2] = parts;
                const minLat = Math.min(lat1, lat2);
                const maxLat = Math.max(lat1, lat2);
                const minLng = Math.min(lng1, lng2);
                const maxLng = Math.max(lng1, lng2);
                agents = agents.filter((a: any) => {
                    const lat = Number(a.lat);
                    const lng = Number(a.lng);
                    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
                });
            }
        }

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
