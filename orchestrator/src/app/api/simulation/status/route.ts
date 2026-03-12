import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const configDoc = await adminDb.collection('config').doc('simulation').get();
        const data = configDoc.exists ? configDoc.data() : {};
        return NextResponse.json({
            status: data?.paused ? 'paused' : 'running',
            speed: data?.speed || '1x',
            sleepInterval: data?.sleepInterval || 20000,
        });
    } catch (e) {
        console.error('Error fetching simulation status:', e);
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}
