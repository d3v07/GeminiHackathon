# Metropolis

Real-time NPC simulation engine — AI agents that live, move, and interact across a city map.

Built with **Gemini AI**, **Temporal.io**, **Firebase Firestore**, **Next.js**, and **Google Maps Platform**.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Next.js UI  │────▶│  API Routes  │────▶│  Firestore (state)│
│  (React Map) │     │  /interact   │     │  agents/encounters│
└─────────────┘     │  /orchestrate│     └───────────────────┘
                    │  /tts        │              ▲
                    └──────────────┘              │
                                           ┌─────┴─────┐
                    ┌──────────────┐        │  Temporal  │
                    │   Spawner    │───────▶│  Workers   │
                    │ (3 or 45     │        │ Activities │
                    │  NPC agents) │        └───────────┘
                    └──────────────┘              │
                                           ┌─────┴─────┐
                                           │ Gemini AI  │
                                           │ Pinecone   │
                                           │ Redis      │
                                           └───────────┘
```

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- API keys (see below)

### 1. Clone and configure

```bash
git clone https://github.com/d3v07/GeminiHackathon.git
cd GeminiHackathon
cp .env.example .env
```

Edit `.env` and fill in your keys:

| Key | Where to get it |
|-----|----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `NEXT_PUBLIC_FIREBASE_*` | [Firebase Console](https://console.firebase.google.com/) → Project Settings |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Firebase → Service Accounts → Generate Key |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Maps JS + Places) |
| `STREETVIEW_API_KEY` | Same console (Street View Static API) |
| `PINECONE_API_KEY` / `PINECONE_INDEX_HOST` | [Pinecone Console](https://app.pinecone.io/) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | [Upstash Console](https://console.upstash.com/) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | [Clerk Dashboard](https://dashboard.clerk.com/) |

Also create `orchestrator/.env.local` with the same Clerk + Firebase public keys:

```bash
cp .env.example orchestrator/.env.local
# Keep only the NEXT_PUBLIC_* and CLERK_* keys
```

### 2. Start the stack

```bash
# Demo mode — 3 agents, lightweight
DEMO_MODE=true docker compose up --build

# Full mode — 15 primary + 30 swarm agents
docker compose up --build
```

### 3. Open the app

Navigate to **http://localhost:3000**

You should see:
- A map of NYC with agent markers moving in real-time
- Click any agent to open a chat panel
- Type a message — the agent responds using Gemini AI with tool-augmented knowledge
- Agents emit speech via Google Cloud TTS

### 4. Verify it works

```bash
# Run the smoke test while the stack is up
node scripts/smoke-test.js
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js UI + API routes |
| Temporal | 7233 | Workflow orchestration |
| Temporal UI | 8080 | Workflow monitor dashboard |
| Worker (health) | 8080 | Temporal activity worker |
| Redis | 6379 | State checkpointing |

## Development

```bash
# Frontend only (hot reload)
cd orchestrator && npm install && npm run dev

# Backend worker (connects to local Temporal)
TEMPORAL_ADDRESS=localhost:7233 node worker.js

# Spawn agents
TEMPORAL_ADDRESS=localhost:7233 DEMO_MODE=true node spawn-agents.js
```

## Project Structure

```
├── activities.js          # Temporal activities (MCP tools, Gemini calls)
├── worker.js              # Temporal worker process
├── workflows.js           # NPC lifecycle workflow (LangGraph)
├── spawn-agents.js        # Agent spawner (15 primary + 30 swarm)
├── lib/                   # Shared modules
│   ├── model-router.js    #   Gemini model selection
│   ├── memory.js          #   Pinecone vector memory
│   ├── encounter.js       #   Agent-to-agent dialogue
│   ├── daily-routines.js  #   Per-role daily schedules
│   ├── cognitive-graph.js #   LangGraph cognitive architecture
│   └── ...
├── orchestrator/          # Next.js frontend
│   ├── src/app/api/       #   API routes (interact, TTS, orchestrator)
│   ├── src/components/    #   React components (MapUI, ControlPanel)
│   └── Dockerfile         #   Multi-stage production build
├── scripts/
│   ├── smoke-test.js      #   MVP smoke test
│   └── bigquery-streamer.js
├── k8s/                   # Kubernetes manifests (base + Helm)
├── docker-compose.yml     # Full stack orchestration
└── .env.example           # All required environment variables
```

## License

See [LICENSE](LICENSE).
