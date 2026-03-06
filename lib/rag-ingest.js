/**
 * RAG Ingestion Pipeline (Issue #33)
 * 
 * Ingests NYC knowledge documents into Pinecone so agents can retrieve
 * contextual information about neighborhoods, landmarks, and history
 * during their cognitive loops via the recall_memories tool.
 * 
 * Usage:
 *   node lib/rag-ingest.js                  # Ingest all built-in NYC knowledge
 *   node lib/rag-ingest.js --file data.json # Ingest a custom JSON file
 */
require('dotenv').config();
require('dotenv').config({ path: './orchestrator/.env.local' });
const { storeMemory, embed } = require('./memory');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const INDEX_NAME = 'metropolis-memory';

// ── Built-in NYC Knowledge Base ──────────────────────────────────────
// Each entry becomes a vector in Pinecone tagged with type: 'knowledge'
// and the relevant neighborhood / category metadata for filtered recall.

const NYC_KNOWLEDGE = [
    // ── Manhattan Neighborhoods ──
    {
        text: "Times Square is the commercial and entertainment hub of Midtown Manhattan, famous for its bright neon signs, Broadway theaters, and massive New Year's Eve ball drop celebration. Over 330,000 pedestrians pass through daily.",
        metadata: { neighborhood: 'times-square', category: 'landmark', lat: 40.7580, lng: -73.9855 }
    },
    {
        text: "Wall Street in Lower Manhattan is the financial capital of the world. The New York Stock Exchange and Federal Reserve Bank of New York are located here. The Charging Bull statue is a symbol of financial optimism.",
        metadata: { neighborhood: 'wall-street', category: 'finance', lat: 40.7074, lng: -74.0113 }
    },
    {
        text: "Chinatown in Manhattan is one of the oldest and largest Chinese communities outside of Asia. It spans roughly 40 blocks and is known for dim sum restaurants, herbal medicine shops, and the annual Lunar New Year parade.",
        metadata: { neighborhood: 'chinatown', category: 'culture', lat: 40.7158, lng: -73.9970 }
    },
    {
        text: "Harlem is the cultural capital of Black America. The Harlem Renaissance of the 1920s produced legendary artists like Langston Hughes, Duke Ellington, and Zora Neale Hurston. The Apollo Theater remains a world-famous music venue.",
        metadata: { neighborhood: 'harlem', category: 'culture', lat: 40.8116, lng: -73.9465 }
    },
    {
        text: "Central Park is an 843-acre urban park in Upper Manhattan. Designed by Frederick Law Olmsted and Calvert Vaux, it features Bethesda Fountain, Bow Bridge, the Central Park Zoo, and Strawberry Fields memorial to John Lennon.",
        metadata: { neighborhood: 'central-park', category: 'park', lat: 40.7829, lng: -73.9654 }
    },
    {
        text: "The Chelsea neighborhood is known for the High Line elevated park, Chelsea Market, and its vibrant art gallery scene along 10th and 11th Avenues. During Prohibition, many speakeasies operated in Chelsea's brownstones.",
        metadata: { neighborhood: 'chelsea', category: 'history', lat: 40.7411, lng: -74.0084 }
    },
    {
        text: "City Hall Park in Lower Manhattan sits near the Brooklyn Bridge and contains New York's City Hall, the oldest continuously used city hall in the U.S. The abandoned City Hall subway station, built in 1904, lies beneath it.",
        metadata: { neighborhood: 'city-hall', category: 'history', lat: 40.7128, lng: -74.0060 }
    },
    {
        text: "Grand Central Terminal is a Beaux-Arts masterpiece opened in 1913. Its Main Concourse ceiling features a mural of the night sky with zodiac constellations painted backwards. A secret underground platform, Track 61, was used by President Roosevelt.",
        metadata: { neighborhood: 'midtown', category: 'landmark', lat: 40.7527, lng: -73.9772 }
    },

    // ── Brooklyn ──
    {
        text: "Williamsburg in Brooklyn transformed from a working-class neighborhood into a tech startup and artisanal hub. It's known for craft breweries, vintage shops, and the converted Domino Sugar Factory waterfront development.",
        metadata: { neighborhood: 'williamsburg', category: 'culture', lat: 40.6892, lng: -73.9442 }
    },
    {
        text: "The Brooklyn Bridge, completed in 1883, was the first steel-wire suspension bridge ever constructed. It connects Manhattan to Brooklyn and offers iconic views of the NYC skyline and the Statue of Liberty.",
        metadata: { neighborhood: 'brooklyn-bridge', category: 'landmark', lat: 40.7061, lng: -73.9969 }
    },

    // ── Historical Events ──
    {
        text: "During Prohibition (1920-1933), New York City had an estimated 30,000 speakeasies — twice the number of legal bars before the ban. The Cotton Club in Harlem and McSorley's Old Ale House in the East Village were famous gathering spots.",
        metadata: { neighborhood: 'nyc-wide', category: 'prohibition', lat: 40.7300, lng: -73.9950 }
    },
    {
        text: "The NYC subway system opened on October 27, 1904. Today it has 472 stations — more than any other system in the world. Abandoned stations like City Hall, Worth Street, and 18th Street remain hidden underground.",
        metadata: { neighborhood: 'nyc-wide', category: 'transit', lat: 40.7128, lng: -74.0060 }
    },
    {
        text: "The Triangle Shirtwaist Factory fire on March 25, 1911, killed 146 garment workers in Greenwich Village. It led to landmark workplace safety legislation and the growth of the International Ladies' Garment Workers' Union.",
        metadata: { neighborhood: 'greenwich-village', category: 'history', lat: 40.7295, lng: -73.9965 }
    },
    {
        text: "Jazz flourished in Harlem during the 1920s-1940s. Legendary venues included the Cotton Club, Savoy Ballroom, and Minton's Playhouse, where bebop was born. Musicians like Charlie Parker, Thelonious Monk, and Dizzy Gillespie shaped modern jazz here.",
        metadata: { neighborhood: 'harlem', category: 'jazz', lat: 40.8116, lng: -73.9465 }
    },

    // ── Food & Culture ──
    {
        text: "New York-style pizza is characterized by its large, foldable slices with a thin crust. The first pizzeria in America, Lombardi's, opened in 1905 on Spring Street. Famous dollar slice joints line nearly every Manhattan avenue.",
        metadata: { neighborhood: 'little-italy', category: 'food', lat: 40.7195, lng: -73.9973 }
    },
    {
        text: "The High Line is a 1.45-mile elevated linear park built on a former New York Central Railroad spur on Manhattan's West Side. It runs from the Meatpacking District through Chelsea to Hudson Yards, with art installations and native plantings.",
        metadata: { neighborhood: 'chelsea', category: 'park', lat: 40.7480, lng: -74.0048 }
    },

    // ── Modern NYC ──
    {
        text: "Hudson Yards, completed in 2019, is the largest private real-estate development in U.S. history. It features The Vessel interactive sculpture, the Edge observation deck, and a luxury shopping center on Manhattan's far West Side.",
        metadata: { neighborhood: 'hudson-yards', category: 'landmark', lat: 40.7537, lng: -74.0008 }
    },
    {
        text: "The Oculus, designed by Santiago Calatrava, is a transportation hub and shopping center at the World Trade Center site. Its white steel ribs were designed to evoke a bird being released from a child's hand.",
        metadata: { neighborhood: 'world-trade-center', category: 'landmark', lat: 40.7115, lng: -74.0133 }
    },
];

// ── Chunking Utilities ──────────────────────────────────────────────

function chunkText(text, maxChunkSize = 500) {
    if (text.length <= maxChunkSize) return [text];

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }
    if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
    return chunks;
}

// ── Ingestion Pipeline ──────────────────────────────────────────────

async function ingestKnowledgeBase(documents = NYC_KNOWLEDGE) {
    console.log(`\n=== RAG INGESTION PIPELINE ===`);
    console.log(`Ingesting ${documents.length} knowledge documents into Pinecone...\n`);

    let ingested = 0;
    let failed = 0;

    for (const doc of documents) {
        const chunks = chunkText(doc.text);

        for (const chunk of chunks) {
            try {
                const id = await storeMemory('knowledge-base', chunk, {
                    type: 'knowledge',
                    neighborhood: doc.metadata.neighborhood || 'unknown',
                    category: doc.metadata.category || 'general',
                    lat: doc.metadata.lat || 0,
                    lng: doc.metadata.lng || 0,
                });
                ingested++;
                console.log(`  [✓] Ingested: "${chunk.substring(0, 60)}..." → ${id}`);
            } catch (e) {
                failed++;
                console.error(`  [✗] Failed: "${chunk.substring(0, 60)}..." → ${e.message}`);
            }
        }
    }

    console.log(`\n=== INGESTION COMPLETE ===`);
    console.log(`  Total: ${ingested + failed} | Success: ${ingested} | Failed: ${failed}\n`);
    return { ingested, failed };
}

async function ingestFromFile(filePath) {
    const fs = require('fs');
    const raw = fs.readFileSync(filePath, 'utf8');
    const documents = JSON.parse(raw);

    if (!Array.isArray(documents)) {
        throw new Error('JSON file must contain an array of { text, metadata } objects');
    }

    return ingestKnowledgeBase(documents);
}

// ── CLI Entry Point ─────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);
    const fileIdx = args.indexOf('--file');

    if (fileIdx !== -1 && args[fileIdx + 1]) {
        ingestFromFile(args[fileIdx + 1])
            .then(() => process.exit(0))
            .catch(e => { console.error(e); process.exit(1); });
    } else {
        ingestKnowledgeBase()
            .then(() => process.exit(0))
            .catch(e => { console.error(e); process.exit(1); });
    }
}

module.exports = { ingestKnowledgeBase, ingestFromFile, chunkText, NYC_KNOWLEDGE };
