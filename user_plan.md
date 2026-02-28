# METROPOLIS - Hackathon Grand Plan
**Gemini 3 NYC Hackathon | Feb 28 – Mar 1, 2026 | Cerebral Valley x Google DeepMind**

---

## What We're Building

**Metropolis** is a real-time multi-agent simulation of New York City. Autonomous AI characters with distinct personalities roam real NYC coordinates, perceive the actual world through multimodal vision (Street View), check real weather, calculate live travel times via Google Maps, and generate emergent dialogue when they encounter each other. Every agent cognitive loop runs as a durable Temporal workflow. All telemetry streams through GCP: Pub/Sub → Cloud NLP → Firestore → BigQuery. The UI is a live mission control dashboard on Google Maps.

**Tagline:** "NYC as a living world, powered by Gemini 3's full stack."

---

## Current Stack (Already Built)

| Layer | Technology | Status |
|---|---|---|
| AI Brain | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | ✅ Live |
| Web Search | Gemini native `googleSearch` tool | ✅ Live |
| Multimodal Vision | Google Maps Street View → Gemini inline image | ✅ Live |
| Routing | Google Maps Routes API v2 | ✅ Live |
| Durable Workflow | Temporal.io (NPC cognitive loop) | ✅ Live |
| State Bus | Google Cloud Pub/Sub (`agent-updates` topic) | ✅ Live |
| Sentiment | Google Cloud Natural Language API | ✅ Live |
| State DB | Firebase Firestore (real-time to UI) | ✅ Live |
| Analytics | BigQuery (`metropolis_analytics.agent_telemetry`) | ✅ Live |
| Voice | Google Cloud Text-to-Speech (per-NPC unique voices) | ✅ Live |
| UI | Next.js 16 + @vis.gl/react-google-maps | ✅ Live |

**Active NPCs (3):** Underground Historian, 1920s Prohibition Ghost, Stressed Wall Street Broker

---

## Critical Bugs (Fix These First)

### BUG-1: NPCs Never Actually Move
**File:** `workflows.js:104-108` + `activities.js:93-111`
**Problem:** Gemini returns a text decision ("I'm heading to Times Square, coordinates 40.758, -73.985") but `currentState.lat` and `currentState.lng` are never updated. NPCs are permanently frozen at their spawn coordinates.
**Owner:** Kush

### BUG-2: Encounter Dialogue Never Fires
**File:** `orchestrator/src/app/api/orchestrator/route.ts:85-97`
**Problem:** When two agents are within 50m, the API sets `isInteracting: true` on both in Firestore - but never calls `trigger_multi_agent_interaction` from `activities.js:113-149` and never saves the generated dialogue to the `encounters` Firestore collection. The encounter system is wired but the wire is cut.
**Owner:** d3v07

### BUG-3: Weather Is Mocked
**File:** `activities.js:9-11`
**Problem:** `get_weather_mcp` returns `Math.random() > 0.5 ? "Raining" : "Sunny"`. NPCs are making decisions based on fake weather.
**Owner:** d3v07

---

## Phase 4 - GCP Maximalism (New Work)

### d3v07's Tasks

#### TASK-D1: Fix Encounter Resolution Pipeline [CRITICAL]
**File:** `orchestrator/src/app/api/orchestrator/route.ts`
When collision is detected, the API must:
1. Fetch both agents' full state (role, lat, lng, last 3 history entries) from Firestore
2. Call Gemini 3 Flash to generate the encounter dialogue (use the same `trigger_multi_agent_interaction` prompt pattern from `activities.js:117-132`)
3. Run Cloud Natural Language sentiment analysis on the dialogue
4. Write to `encounters` collection: `{ participants, transcript, sentimentScore, timestamp, lat, lng }`
5. Update both agent docs: `{ isInteracting: true, lastEncounterDialogue: transcript, sentimentScore }`
6. Return the dialogue in the API response

This is what makes the demo magical - agents physically collide and spontaneously generate conversation that's immediately voiced by TTS.

#### TASK-D2: Live Weather API [CRITICAL]
**File:** `activities.js:9-11`
Replace mock with real weather data. Options in priority order:
1. **Google Weather API** (if available on your GCP project) - `GET https://weather.googleapis.com/v1/currentConditions:lookup`
2. **OpenWeatherMap API** (free tier) - `api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={key}`

The weather tool receives a location string. Parse it to get coordinates or use the NPC's current lat/lng. Return: `{ weather: "Raining" | "Sunny" | "Cloudy" | "Snowing", temperature, description }`.

#### TASK-D3: NPC Detail Panel (Click-to-Inspect)
**File:** `orchestrator/src/components/MapUI.tsx`
When a user clicks an agent marker, show a side panel with:
- Agent role and ID
- Current `defaultTask` (truncated to 120 chars)
- Sentiment score with color-coded meter (red ← 0 → green)
- `isInteracting` badge (pulse if active encounter)
- Mini Street View static image of their current position: `https://maps.googleapis.com/maps/api/streetview?size=300x150&location={lat},{lng}&key={KEY}`

Use `useState` for `selectedAgent`. On marker click, set the selected agent ID. Render panel on the right side of the map area.

#### TASK-D4: Vertex AI Embeddings for NPC Memory
**File:** `activities.js` (new function) + `orchestrator/src/app/api/orchestrator/route.ts`

When an encounter happens, before generating dialogue:
1. Embed both agents' recent history entries using Vertex AI text-embedding model (`text-embedding-004` via `@google-cloud/aiplatform`)
2. Find the top-2 most semantically similar memories between the two agents
3. Inject those memories into the encounter dialogue prompt as shared context

Install: `npm install @google-cloud/aiplatform` (root package)

This makes dialogue richer and more contextual - the ghost remembers meeting the historian before, the broker remembers the historian's financial tip, etc.

#### TASK-D5: Add 5 More NPC Archetypes
**File:** `spawn-agents.js`
Add these to `npcsToSpawn`:

```
- "Harlem Jazz Musician" - starts at 40.8116, -73.9465 (Apollo Theater)
  Persona: Riffing on jazz history, searching for collaborators, perceives locations through musical memory

- "Brooklyn Tech Startup Founder" - starts at 40.6892, -73.9442 (Williamsburg)
  Persona: Obsessed with disruption and funding rounds, sees every location as a potential office space

- "Chinatown Restaurant Owner" - starts at 40.7158, -73.9970 (Chinatown)
  Persona: Philosophical, knows 40 years of NYC immigrant history, always looking for suppliers

- "Central Park Dog Walker" - starts at 40.7829, -73.9654 (Central Park)
  Persona: Knows every dog in the park, observes the city from a ground-level human perspective

- "Times Square Street Performer" - starts at 40.7580, -73.9855 (Times Square)
  Persona: Been doing this 15 years, philosopher-showman, sharp observer of human nature
```

#### TASK-D6: Live Stats Bar in UI Header
**File:** `orchestrator/src/components/ControlPanel.tsx`
Add real-time stats derived from Firestore data already being received:
- **Active Agents:** count of agents in snapshot
- **Encounters:** count of `encounters` collection
- **Avg Sentiment:** mean of all `sentimentScore` values
- **Hottest Zone:** most common neighborhood (can bucket lat/lng ranges into neighborhood names)

Display as a horizontal strip of stat chips above the existing sentiment stream panel.

---

### Kush's Tasks

#### TASK-K1: Fix NPC Movement (Coordinate Extraction) [CRITICAL]
**File:** `workflows.js` + `activities.js`

Right now Gemini decides where to go in natural language text. Extract the destination coordinates.

**Option A (cleaner):** Add a new MCP tool `move_to_location`:
```js
{
    name: 'move_to_location',
    description: 'Update your current position to new coordinates after deciding where to go.',
    parameters: {
        type: 'OBJECT',
        properties: {
            lat: { type: 'NUMBER', description: 'New latitude' },
            lng: { type: 'NUMBER', description: 'New longitude' },
            destination_name: { type: 'STRING', description: 'Name of where you are going' }
        },
        required: ['lat', 'lng', 'destination_name']
    }
}
```

When Gemini calls `move_to_location`, update `currentState.lat` and `currentState.lng` in the workflow loop. This is the single most impactful fix - without it, NPCs are stationary and the whole demo is broken.

#### TASK-K2: Google Places API for Real Landmark Navigation
**File:** `activities.js`

Add `find_nearby_place_mcp` tool:
```
- Input: { category: STRING, lat: NUMBER, lng: NUMBER }
- Calls: https://places.googleapis.com/v1/places:searchNearby
- Returns: { name, address, lat, lng, rating } of top result
```

NPCs call this to discover real named places near them instead of picking abstract coordinates. The Historian would search for `category: "museum"`, the Broker for `category: "coffee_shop"`, the Ghost for `category: "historic_site"`. Combine with `move_to_location` - NPC finds a real place, then moves there.

#### TASK-K3: NPC State Recovery from Firestore on Worker Restart
**File:** `worker.js` / `workflows.js`

Temporal's replay mechanism already handles workflow durability. But if the Temporal server itself is down and restarted, the NPC's position in Firestore should be used to seed `initialState`.

In `npc_agent.js` (the spawner), before starting each workflow:
1. Check if an `agents/{npcId}` doc exists in Firestore
2. If yes, read `lat`, `lng`, and `memoryContext` from it
3. Use those as the `initialState` instead of the hardcoded spawn coordinates

This enables the "Kill Process → Restore Engine" demo to be fully live - agents resume from their last REAL position.

#### TASK-K4: Encounter Dialogue as Temporal Activity
**File:** `workflows.js` + `activities.js`

Currently `trigger_multi_agent_interaction` is defined but never wired into the Temporal workflow. When `pingOrchestrator` returns a signal that the agent is `isInteracting`, the workflow should call a new `generateEncounterDialogue(agentA_state, agentB_state)` activity.

The activity: calls Gemini, gets dialogue, publishes to Pub/Sub on a new topic `agent-encounters`, which the orchestrator API picks up and saves to Firestore `encounters`.

This makes the encounter flow durable and retryable via Temporal, not a one-shot API call.

#### TASK-K5: Vertex AI Grounding (NPC Intelligence Upgrade)
**File:** `activities.js:63-91`

Use Vertex AI's `generateContent` with grounding instead of (or in addition to) Gemini API:
```js
// Use Vertex AI SDK with grounding
const { VertexAI } = require('@google-cloud/vertexai');
const vertexAI = new VertexAI({ project: process.env.GCP_PROJECT_ID, location: 'us-central1' });
```

Add grounding with Google Search for real-time NYC context. This makes the NPCs aware of ACTUAL current events at their location - not just indexed data but live search results injected into context.

Install: `npm install @google-cloud/vertexai`

---

## Vertex AI Integration (Both)

We need at least one explicit Vertex AI call for the judging criteria. Options:
1. **Vertex AI Text Embeddings** (d3v07, TASK-D4) - for NPC memory semantic retrieval
2. **Vertex AI Grounding** (Kush, TASK-K5) - for live NYC context injection
3. **Vertex AI NLP** (alternative to Cloud Natural Language)

Minimum viable: d3v07 does Vertex AI embeddings for encounter memory context. This is a clean, demonstrable use case.

---

## Antigravity Angle

Antigravity is Google's agentic development IDE - it's the development environment, not an embeddable runtime. Our Metropolis project IS the living embodiment of the Antigravity paradigm:

- **Manager Surface analog:** Our Temporal server is our multi-agent orchestrator
- **Agent autonomy:** NPCs plan, execute, verify, and iterate autonomously
- **Multi-agent coordination:** Collision detection and encounter dialogue
- **Tool use:** MCP tools (weather, routing, vision, places)
- **Durable execution:** Temporal workflows survive crashes = Antigravity's background agent model

**Demo narrative:** "We built this using Antigravity and Gemini 3. What you're seeing on screen is exactly what Antigravity enables - multiple autonomous agents with distinct goals, collaborating and conflicting in a shared environment, with a Manager Surface (our Metropolis UI) giving you full observability."

Use Antigravity IDE during development. In the demo, equate Metropolis with the Antigravity paradigm.

---

## Full GCP Service Checklist for Demo

| Service | Usage | Status |
|---|---|---|
| Gemini 3 Flash Preview | NPC cognition, dialogue generation | ✅ |
| Gemini Google Search tool | Live NYC news/events per location | ✅ |
| Gemini multimodal (Street View vision) | NPC sees their surroundings | ✅ |
| Google Maps Routes API | Live travel time calculation | ✅ |
| Google Maps Street View API | Visual scene capture | ✅ |
| Google Maps Places API | Real landmark navigation | 🔲 Kush TASK-K2 |
| Google Cloud Pub/Sub | Agent telemetry bus | ✅ |
| Google Cloud Natural Language API | Encounter sentiment scoring | ✅ |
| Google Cloud Text-to-Speech | Per-NPC voice synthesis | ✅ |
| Firebase Firestore | Real-time durable state | ✅ |
| BigQuery | Agent telemetry analytics | ✅ |
| Vertex AI (Embeddings) | NPC semantic memory | 🔲 d3v07 TASK-D4 |
| Vertex AI (Grounding) | Live context injection | 🔲 Kush TASK-K5 |
| Cloud Run (stretch) | Deploy Temporal worker + listeners | 🔲 Stretch |

---

## Execution Order

### Hour 1-2: Fix Broken Things
1. **Kush:** TASK-K1 - Fix NPC movement (coordinate extraction via `move_to_location` tool)
2. **d3v07:** TASK-D1 - Fix encounter dialogue (call Gemini + save to Firestore on collision)

### Hour 3-4: High-Impact Features
3. **d3v07:** TASK-D2 - Real weather API
4. **Kush:** TASK-K2 - Google Places API for real landmark navigation
5. **d3v07:** TASK-D3 - NPC detail panel (click to inspect)
6. **Kush:** TASK-K3 - State recovery from Firestore

### Hour 5-6: GCP Maximalism
7. **d3v07:** TASK-D4 - Vertex AI embeddings for encounter memory
8. **Kush:** TASK-K4 - Encounter dialogue as Temporal activity
9. **d3v07:** TASK-D5 - Add 5 more NPCs

### Hour 7-8: Polish
10. **d3v07:** TASK-D6 - Live stats bar
11. **Kush:** TASK-K5 - Vertex AI grounding
12. Both: Demo rehearsal, ensure all services are live

---

## Demo Script (3 Minutes)

1. **[0:00-0:30] Opening:** Show the live map - agents pulsing across NYC. "This is Metropolis. 8 autonomous AI characters are living in New York City right now."

2. **[0:30-1:00] Individual Agent:** Click a marker → detail panel opens. Show the Street View thumbnail - "This agent right now is at the corner of Wall Street and Broadway. It just saw this view, processed it through Gemini 3's multimodal vision, and is deciding its next move based on real weather and real travel times from Google Maps."

3. **[1:00-1:30] Kill & Restore:** Hit "Kill Process" → map blurs. "The worker is down. But these aren't regular API calls - they're durable Temporal workflows. The agents aren't dead, they're paused." Hit "Restore Engine" → map snaps back. "Fully resumed. State preserved in Firestore."

4. **[1:30-2:00] Encounter:** Watch two agents approach each other (or manually move them close). Collision triggers → TTS audio plays the spontaneous dialogue. "These two just met organically. Gemini generated this conversation based on their actual histories and real context from their locations. Cloud NLP scored it."

5. **[2:00-2:30] GCP Pipeline:** Show the control panel logs scrolling. "Every thought goes through Pub/Sub → Natural Language API → Firestore → BigQuery. We have full telemetry on every agent cognitive cycle."

6. **[2:30-3:00] Stack slide:** List all GCP services. "We built this entirely on Google's stack: Gemini 3, Google Maps Platform, Pub/Sub, Natural Language, TTS, Firestore, BigQuery, and Vertex AI."

---

## Kush Onboarding Prompt

> Copy this entire prompt and paste it into your environment when you start work.

```
You are a senior engineer on Project Metropolis - a real-time multi-agent NYC simulation
built for the Gemini 3 NYC Hackathon (Feb 28, 2026).

REPOSITORY: github.com/d3v07/GeminiHackathon
STACK: Node.js, Gemini 3 Flash Preview (@google/genai), Temporal.io workflows,
       Google Cloud Pub/Sub, Firebase Firestore, Google Maps Platform

YOUR ROLE: You own the backend NPC AI layer - the Temporal worker and the activities
that power NPC cognition.

ARCHITECTURE:
- `worker.js` - Temporal worker, registers activities and the npcLoop workflow
- `workflows.js` - The `npcLoop` function - the NPC's infinite cognitive loop running
  as a durable Temporal workflow. Each iteration: send messages to Gemini → handle
  function calls → update state → sleep 20s → repeat
- `activities.js` - All side-effectful operations exposed as Temporal activities:
  - `generateGeminiContent(messages, tools)` - calls Gemini 3 Flash Preview
  - `executeToolCall(name, args)` - executes MCP tools (weather/travel/streetview)
  - `pingOrchestrator(npcId, state, action)` - publishes to Pub/Sub 'agent-updates'
  - `trigger_multi_agent_interaction(agentA, agentB)` - generates encounter dialogue
- `spawn-agents.js` - Starts Temporal workflows for each NPC archetype
- `npc_agent.js` - Single NPC spawner (legacy, use spawn-agents.js)

CURRENT NPC TOOLS (mcpTools in workflows.js):
- `get_weather_mcp(location)` - currently MOCKED, returns random rain/sun
- `calculate_travel_time_mcp(origin_lat, origin_lng, dest_lat, dest_lng, mode)` -
  LIVE via Google Maps Routes API
- `describe_surroundings(lat, lng)` - LIVE via Google Maps Street View → Gemini vision

ACTIVE NPCs (in spawn-agents.js):
- Underground Historian (City Hall area)
- 1920s Prohibition Ghost (Chelsea)
- Stressed Wall Street Broker (Wall Street)

CRITICAL BUG YOU MUST FIX FIRST:
NPCs never move. Gemini returns text like "I'll head to the Brooklyn Bridge" but
currentState.lat and currentState.lng in the workflow loop are never updated.
Fix by adding a `move_to_location` function declaration tool that Gemini must call
when deciding its destination. When this tool is called, extract lat/lng from
call.args and update currentState.

YOUR TASKS (in priority order):
1. TASK-K1: Add `move_to_location` MCP tool + update currentState when called
2. TASK-K2: Add `find_nearby_place_mcp` tool using Google Places API
   (searchNearby endpoint) so NPCs navigate to real named places
3. TASK-K3: On worker restart, check Firestore for existing NPC position before
   spawning - use last known lat/lng as initialState
4. TASK-K4: Wire `trigger_multi_agent_interaction` into the Temporal workflow -
   when pingOrchestrator returns isInteracting:true, call it as a durable activity
5. TASK-K5: Install @google-cloud/vertexai and switch generateGeminiContent to use
   Vertex AI with grounding enabled for live NYC context injection

ENV VARS AVAILABLE (.env):
- GEMINI_API_KEY
- NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY

The Temporal server runs locally on port 7233.
Start the worker: node worker.js
Spawn NPCs: node spawn-agents.js
The Next.js frontend is in ./orchestrator/ (not your concern, d3v07 owns it)

DO NOT break the Pub/Sub publishing in pingOrchestrator - d3v07's whole pipeline
depends on that. The topic name is 'agent-updates' and the payload must include:
agentId, lat, lng, defaultTask, memoryContext.
```

---

## d3v07's (my) Antigravity Task Prompt

```
You are working on Project Metropolis - a real-time multi-agent NYC simulation.

YOUR DOMAIN: orchestrator/ (Next.js 16 app) + activities.js (shared backend)

CRITICAL BUG TO FIX FIRST - orchestrator/src/app/api/orchestrator/route.ts:
When two NPCs are within 50 meters, the code sets isInteracting:true on both agents
in Firestore but never generates or saves the encounter dialogue.

Fix plan:
1. After setting isInteracting:true, fetch both agents' full docs from adminDb
2. Call Gemini 3 Flash directly from this API route to generate the encounter dialogue
   Use the same collisionPrompt pattern from activities.js:117-132
3. Run Cloud Natural Language sentiment analysis on the generated dialogue
4. Write to adminDb.collection('encounters'): { participants, transcript,
   sentimentScore, timestamp, lat, lng }
5. Update both agent docs with lastEncounterDialogue and sentimentScore

SECOND PRIORITY - activities.js:9-11:
Replace mock weather with real API. Use OpenWeatherMap:
GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={OPENWEATHER_KEY}
or Google Weather API if available on the GCP project.
Add OPENWEATHER_API_KEY to .env

THIRD - orchestrator/src/components/MapUI.tsx:
Add click handler to AdvancedMarker. On click, set selectedAgent state.
Show a slide-in panel (absolute positioned over map, right side):
- Agent ID and role
- Current defaultTask text
- Sentiment score colored bar
- Static Street View: https://maps.googleapis.com/maps/api/streetview?size=300x150&location={lat},{lng}&key={KEY}
- isInteracting badge

FOURTH - Vertex AI embeddings for encounter context:
npm install @google-cloud/aiplatform
In the orchestrator API encounter handler, before calling Gemini for dialogue:
1. Embed both agents' last 3 history entries using Vertex AI text-embedding-004
2. Find the 2 most similar memory pairs (cosine similarity)
3. Inject them into the dialogue prompt as "shared context they both remember"
Use GCP project from process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

FIFTH - spawn-agents.js:
Add 5 NPCs: Harlem Jazz Musician (40.8116, -73.9465), Brooklyn Tech Startup Founder
(40.6892, -73.9442), Chinatown Restaurant Owner (40.7158, -73.9970), Central Park Dog
Walker (40.7829, -73.9654), Times Square Street Performer (40.7580, -73.9855)
Write vivid, personality-rich instruction strings for each.

SIXTH - orchestrator/src/components/ControlPanel.tsx:
Add a stats bar above the NLP Sentiment Stream panel showing:
Active Agents | Encounters | Avg Sentiment |
Derive from the existing agents and encounters Firestore snapshots already loaded.

ENV: orchestrator/.env.local has all GCP keys.
The adminDb is initialized in orchestrator/src/lib/firebase-admin.ts
The Gemini SDK used in activities.js is @google/genai (not the Vertex SDK)
For Vertex AI in the Next.js API routes, use @google-cloud/aiplatform
```

---

## Notes

- Gemini model ID: `gemini-3-flash-preview` (current in codebase, correct)
- Temporal UI available at http://localhost:8080 (verify workflows running)
- Next.js runs on port 3000, orchestrator API at /api/orchestrator
- Firestore collections: `agents`, `encounters`
- Pub/Sub topics: `agent-updates` (publisher: activities.js, subscribers: pubsub-listener.js + bigquery-streamer.js)
- BigQuery dataset: `metropolis_analytics`, table: `agent_telemetry`
- The `firebase-admin-key.json` in root is the service account - don't commit additional key files
- All Google Maps API calls use `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
