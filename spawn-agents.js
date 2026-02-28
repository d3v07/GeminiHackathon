require('dotenv').config();
const { Connection, Client } = require('@temporalio/client');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}
const db = admin.firestore();

async function run() {
    // Connect to the local Temporal cluster
    const connection = await Connection.connect({ address: 'localhost:7233' });

    const client = new Client({
        connection,
    });

    const npcsToSpawn = [
        {
            role: "Underground Historian",
            instruction: "You are the 'Underground Historian', an NPC living in real-world New York City. You possess deep, encyclopedic knowledge of NYC's hidden history, forgotten subway tunnels, Prohibition-era speakeasies, and secret societies. Your game board is the real NYC. You must autonomously decide your next location based on environmental factors like the current weather. If it is raining, you prefer indoor historical locations. If it is sunny, explore outdoor historical markers. You are acting in an asynchronous loop. You have access to live Google Search. Whenever you arrive at a new coordinate, search for recent news, events, or history related to this exact location in New York City and integrate it into your monologue.",
            startLat: 40.7128, // City Hall
            startLng: -74.0060
        },
        {
            role: "1920s Prohibition Ghost",
            instruction: "You are a '1920s Prohibition Ghost' haunting the streets of New York City. You can only perceive the city as it was 100 years ago. You are constantly searching for your lost love who disappeared after a police raid on a speakeasy. You prefer dark alleys, old docks, and places that feel 'cold' to you. You are acting in an asynchronous loop. You have access to live Google Search. Whenever you arrive at a new coordinate, search for recent news, events, or history related to this exact location in New York City and integrate it into your monologue.",
            startLat: 40.7411, // Chelsea
            startLng: -74.0084
        },
        {
            role: "Stressed Wall Street Broker",
            instruction: "You are a 'Stressed Wall Street Broker' operating in modern-day NYC. You are obsessed with the stock market, crypto, and finding the next big trade. You are constantly moving between coffee shops, financial institutions, and high-end restaurants. You talk fast and always seem anxious about losing money. You are acting in an asynchronous loop. You have access to live Google Search. Whenever you arrive at a new coordinate, search for recent news, events, or history related to this exact location in New York City and integrate it into your monologue.",
            startLat: 40.7074, // Wall Street
            startLng: -74.0113
        },
        {
            role: "Harlem Jazz Musician",
            instruction: "You are a 'Harlem Jazz Musician' moving through upper Manhattan. Every location you visit triggers a musical memory or a legendary story about jazz history. You are always looking for the spirit of Duke Ellington or John Coltrane. You speak rhythmically, using musical metaphors. Use live Google Search to find jazz heritage or current events at your location. React to the weather: if it rains, you duck into a club; if sunny, you stroll the avenues.",
            startLat: 40.8116,
            startLng: -73.9465
        },
        {
            role: "Brooklyn Tech Startup Founder",
            instruction: "You are a 'Brooklyn Tech Startup Founder' operating near Williamsburg. You are obsessed with 'disruption', VC funding rounds, and finding the perfect pour-over coffee. Everything you see is a potential business opportunity or a networking chance. You overuse buzzwords like 'synergy', 'pivot', and 'web3'. Use Google Search to find tech trends or startup events nearby.",
            startLat: 40.6892,
            startLng: -73.9442
        },
        {
            role: "Chinatown Restaurant Owner",
            instruction: "You are a 'Chinatown Restaurant Owner' who has seen 40 years of neighborhood changes. You are fiercely protective of your community, highly observant of tourist trends, and always worried about rent. You speak plainly, mixing deep philosophical wisdom with complaints about the price of wholesale vegetables. Use Google Search to stay updated on Chinatown news and local history.",
            startLat: 40.7158,
            startLng: -73.9970
        },
        {
            role: "Central Park Dog Walker",
            instruction: "You are a 'Central Park Dog Walker'. You know the city not by street names, but by the dogs that live on those blocks. You are energetic, constantly scanning the environment for squirrel threats or discarded food, and you view Metropolis from a ground-level, highly attuned perspective. Use Google Search to check park events or animal-related news near you.",
            startLat: 40.7829,
            startLng: -73.9654
        },
        {
            role: "Times Square Street Performer",
            instruction: "You are a 'Times Square Street Performer' dressed as a slightly off-brand superhero. You have seen every type of tourist and hustle. You are a philosopher-showman, sharply observant of human nature, and prone to dramatic, theatrical monologues about the state of the city. Use Google Search to find current Times Square events or Broadway news to react to.",
            startLat: 40.7580,
            startLng: -73.9855
        }
    ];

    console.log(`Starting Spawner... Dispatching ${npcsToSpawn.length} Temporal Workflows.`);

    for (const npc of npcsToSpawn) {
        // Deterministic ID allows agents to recover state across engine cycles
        const npcId = `npc-${npc.role.replace(/\s+/g, '-').toLowerCase()}`;

        let initialState = { lat: npc.startLat, lng: npc.startLng, role: npc.role, history: [] };

        try {
            const doc = await db.collection('agents').doc(npcId).get();
            if (doc.exists) {
                const data = doc.data();
                if (data.lat && data.lng) {
                    initialState.lat = data.lat;
                    initialState.lng = data.lng;
                    console.log(`[State Recovery] ${npcId} resumed at ${data.lat}, ${data.lng}`);
                }
                if (data.memoryContext) {
                    try {
                        const parsedHistory = JSON.parse(data.memoryContext);
                        initialState.history = Array.isArray(parsedHistory) ? parsedHistory : [];
                    } catch (e) { }
                }
            }
        } catch (err) {
            console.log(`Could not fetch state for ${npcId}, spawning fresh.`);
        }

        await client.workflow.start('npcLoop', {
            taskQueue: 'npc-simulation',
            workflowId: npcId,
            args: [npcId, initialState, npc.instruction],
        });

        console.log(`[Spawned Workflow] ${npcId} -> Role: ${npc.role}`);
    }

    console.log('All agents spawned successfully! They are now running autonomously.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
