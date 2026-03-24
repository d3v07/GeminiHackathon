import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { SimControlSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const SPEED_MAP: Record<string, number> = {
    '0.5x': 40000,
    '1x': 20000,
    '2x': 10000,
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = SimControlSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { action, value } = parsed.data;
        const configRef = adminDb.collection('config').doc('simulation');

        switch (action) {
            case 'pause':
                await configRef.set({ paused: true }, { merge: true });
                return NextResponse.json({ status: 'paused' });

            case 'resume':
                await configRef.set({ paused: false }, { merge: true });
                return NextResponse.json({ status: 'running' });

            case 'speed': {
                const interval = value ? SPEED_MAP[value] : undefined;
                if (!interval) {
                    return NextResponse.json(
                        { error: 'Invalid speed value. Use 0.5x, 1x, or 2x' },
                        { status: 400 }
                    );
                }
                await configRef.set({ sleepInterval: interval, speed: value }, { merge: true });
                return NextResponse.json({ status: 'speed_updated', speed: value, intervalMs: interval });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (e) {
        console.error('Error in simulation control:', e);
        return NextResponse.json({ error: 'Failed to update simulation' }, { status: 500 });
    }
}

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
