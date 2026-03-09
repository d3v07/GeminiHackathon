import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiting (fail-open if Redis not configured)
let expensiveLimit: Ratelimit | null = null;
let standardLimit: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    expensiveLimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '60 s'),
        analytics: true,
        prefix: 'rl:expensive',
    });
    standardLimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(120, '60 s'),
        analytics: true,
        prefix: 'rl:standard',
    });
}

const EXPENSIVE_ROUTES = ['/api/tts', '/api/interact'];

function getIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') || '127.0.0.1';
}

// Public routes: sign-in, sign-up, and API routes used by backend workers
const isPublicRoute = createRouteMatcher([
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api/orchestrator(.*)',  // Backend worker -> Firestore sync (no user session)
    '/api/state(.*)',         // Backend polling (no user session)
]);

export default clerkMiddleware(async (auth, request) => {
    // 1. Auth: protect non-public routes
    if (!isPublicRoute(request)) {
        await auth.protect();
    }

    // 2. Rate limit API routes
    const pathname = request.nextUrl.pathname;
    if (pathname.startsWith('/api/')) {
        const isExpensive = EXPENSIVE_ROUTES.some(r => pathname.startsWith(r));
        const limiter = isExpensive ? expensiveLimit : standardLimit;

        if (limiter) {
            try {
                const ip = getIp(request);
                const { success, limit, remaining, reset } = await limiter.limit(`${ip}:${pathname}`);

                if (!success) {
                    return NextResponse.json(
                        { error: 'Rate limit exceeded. Try again later.' },
                        {
                            status: 429,
                            headers: {
                                'X-RateLimit-Limit': limit.toString(),
                                'X-RateLimit-Remaining': '0',
                                'X-RateLimit-Reset': reset.toString(),
                                'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
                            },
                        }
                    );
                }
            } catch {
                // Fail-open if Redis is unreachable
            }
        }
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and static files
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
