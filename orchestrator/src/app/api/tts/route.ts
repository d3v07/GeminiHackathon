import { NextRequest, NextResponse } from 'next/server';
import textToSpeech from '@google-cloud/text-to-speech';

// Initialize the TTS Client
// It expects GOOGLE_APPLICATION_CREDENTIALS in a standard environment,
// but since we are relying on FIREBASE_PRIVATE_KEY for the hackathon, we can initialize it directly:
const client = new textToSpeech.TextToSpeechClient({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
});

// A map to give each Agent a distinct, recognizable voice
const VOICE_MAP: Record<string, { languageCode: string, name: string }> = {
    "Underground Historian": { languageCode: 'en-US', name: 'en-US-Journey-D' },
    "1920s Prohibition Ghost": { languageCode: 'en-GB', name: 'en-GB-Studio-C' },
    "Stressed Wall Street Broker": { languageCode: 'en-US', name: 'en-US-Journey-F' },
    "Harlem Jazz Musician": { languageCode: 'en-US', name: 'en-US-Studio-M' },
    "Brooklyn Tech Startup Founder": { languageCode: 'en-US', name: 'en-US-Neural2-J' },
    "Chinatown Restaurant Owner": { languageCode: 'en-US', name: 'en-US-Neural2-D' },
    "Central Park Dog Walker": { languageCode: 'en-US', name: 'en-US-Journey-O' },
    "Times Square Street Performer": { languageCode: 'en-US', name: 'en-US-Studio-Q' },
    "Rogue AI Terminal": { languageCode: 'en-US', name: 'en-US-Neural2-A' },
    "Time-Displaced Tourist 1985": { languageCode: 'en-US', name: 'en-US-Neural2-I' },
    "Aggressively Positive Yoga Instructor": { languageCode: 'en-US', name: 'en-US-Journey-F' },
    "Late Night Slice Critic": { languageCode: 'en-US', name: 'en-US-Neural2-H' },
    "Grumbling Sanitation Worker": { languageCode: 'en-US', name: 'en-US-Neural2-D' },
    "High Society Socialite": { languageCode: 'en-GB', name: 'en-GB-Studio-B' },
    "Undercover Pigeon Informant": { languageCode: 'en-US', name: 'en-US-Neural2-C' },
    "Unknown Encountee": { languageCode: 'en-US', name: 'en-US-Neural2-A' }
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { text, role } = body;

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // Default to a standard voice if the role is unknown
        const voiceConfig = VOICE_MAP[role] || { languageCode: 'en-US', name: 'en-US-Neural2-F' };

        // Construct the request
        const request = {
            input: { text: text },
            voice: voiceConfig,
            audioConfig: { audioEncoding: 'MP3' as const }, // Valid TS type for the SDK
        };

        // Performs the text-to-speech request
        const [response] = await client.synthesizeSpeech(request);

        if (!response.audioContent) {
            throw new Error("Failed to generate audio content from Google Cloud.");
        }

        // Convert the Uint8Array/string returned by GCP to a standard Buffer for Next.js
        const buffer = Buffer.from(response.audioContent as Uint8Array);

        // Return the raw audio buffer securely to the frontend
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000'
            },
        });

    } catch (error: any) {
        console.error('TTS Generation Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
