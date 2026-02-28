import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
        return new NextResponse('Missing coordinates', { status: 400 });
    }

    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
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
