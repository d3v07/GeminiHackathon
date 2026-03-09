import { NextResponse } from 'next/server';
import { StreetviewSchema } from '@/lib/schemas';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const parsed = StreetviewSchema.safeParse({
        lat: searchParams.get('lat'),
        lng: searchParams.get('lng'),
    });

    if (!parsed.success) {
        return new NextResponse('Invalid coordinates', { status: 400 });
    }

    const { lat, lng } = parsed.data;

    const key = process.env.STREETVIEW_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/streetview?size=400x250&location=${lat},${lng}&key=${key}`;

    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (e) {
        console.error("StreetView Proxy Error:", e);
        return new NextResponse('Proxy Fetch Error', { status: 500 });
    }
}
