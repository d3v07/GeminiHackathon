import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Haversine formula to calculate distance between two coordinates in meters
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371000; // Radius of the earth in m
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in m
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

export async function POST(request: Request) {
    try {
        const { agentId, lat, lng, defaultTask, memoryContext } = await request.json();

        if (!agentId || lat === undefined || lng === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const INTERACTION_RADIUS_METERS = 50; // Detect if within 50 meters

        // Bounds for Manhattan roughly (prevent walking into Hudson River/NJ or deep Queens unnecessarily for the demo)
        const MANHATTAN_BOUNDS = {
            northLat: 40.87,
            southLat: 40.70,
            westLng: -74.02,
            eastLng: -73.91
        };

        if (lat > MANHATTAN_BOUNDS.northLat || lat < MANHATTAN_BOUNDS.southLat ||
            lng < MANHATTAN_BOUNDS.westLng || lng > MANHATTAN_BOUNDS.eastLng) {
            return NextResponse.json({
                error: 'Out of Bounds. You have hit a body of water or left the simulation zone. Please route back towards central Manhattan.',
                correction: {
                    suggested_lat: Math.max(MANHATTAN_BOUNDS.southLat, Math.min(MANHATTAN_BOUNDS.northLat, lat)),
                    suggested_lng: Math.max(MANHATTAN_BOUNDS.westLng, Math.min(MANHATTAN_BOUNDS.eastLng, lng))
                }
            }, { status: 400 });
        }

        const agentsRef = adminDb.collection('agents');

        // 1. Durably log the current position and state of the pinging agent
        await agentsRef.doc(agentId).set({
            lat,
            lng,
            lastUpdated: new Date().toISOString(),
            defaultTask: defaultTask || 'Idle',
            memoryContext: memoryContext || '',
            isInteracting: false,
        }, { merge: true });

        // 2. Proximity calculation logic
        // Fetch all active agents to see if our agent is colliding with another
        const snapshot = await agentsRef.get();
        let collisionDetected = false;
        let collidingAgentId = null;

        snapshot.forEach(doc => {
            const otherAgent = doc.data();
            const otherAgentId = doc.id;

            // Don't collide with self
            if (otherAgentId === agentId) return;

            const distance = getDistanceFromLatLonInM(lat, lng, otherAgent.lat, otherAgent.lng);

            // Simple threshold to trigger the Gemini interaction
            if (distance < INTERACTION_RADIUS_METERS && !otherAgent.isInteracting) {
                collisionDetected = true;
                collidingAgentId = otherAgentId;
            }
        });

        if (collisionDetected && collidingAgentId) {
            // 3. Trigger the asynchronous dialogue (this simulates calling Kush's agentic loop)
            // Here we set a flag in Firebase indicating the two agents should pause travel and interact.
            await agentsRef.doc(agentId).update({ isInteracting: true, interactingWith: collidingAgentId });
            await adminDb.collection('agents').doc(collidingAgentId).update({ isInteracting: true, interactingWith: agentId });

            return NextResponse.json({
                success: true,
                message: 'Agent position logged and proximity interaction triggered.',
                interaction: {
                    withAgent: collidingAgentId
                }
            });
        }

        return NextResponse.json({ success: true, message: 'Agent position durably logged.' });
    } catch (error) {
        console.error('Error in Orchestrator API', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
