# Metropolis — Sprint Plan to MVP and Beyond

> Last updated: $(date)  
> Team: **d3v07** (backend, infra, APIs) · **kushyarwar** (frontend, observability, polish)

---

## Current State (Post Sprint 3 + Security PR #79/#80)

| Layer | Status | Notes |
|-------|--------|-------|
| Temporal Worker + Workflows | COMPLETE | `worker.js`, `workflows.js` — infinite cognitive loop |
| 7 MCP Tools (activities.js) | COMPLETE | weather, travel, street view, places, nearby agents, move, recall |
| LangGraph Cognitive Graph | COMPLETE | perceive→think→act→reflect, 377 lines |
| Encounter System | COMPLETE | Multi-turn dialogue, Pinecone memory, social context |
| All 13 lib/ modules | COMPLETE | memory, social-memory, checkpointer, telemetry, etc. |
| Next.js Frontend (MapUI + ControlPanel) | COMPLETE | Google Maps, AdvancedMarker, StreetView, comm-link |
| 5 API Routes | COMPLETE | orchestrator, interact, state, streetview, tts |
| Clerk Auth + Middleware | COMPLETE | PR #79 |
| AegisAgent + PII Redaction | COMPLETE | PR #79 |
| Rate Limiting + Zod Validation | COMPLETE | PR #80 |
| Firestore Rules | COMPLETE | PR #80 |
| Docker (worker + spawner) | COMPLETE | `Dockerfile.worker`, `Dockerfile.spawner` |
| Docker (orchestrator) | **MISSING** | `docker-compose.yml` references it, file doesn't exist |
| CI/CD | **MISSING** | No GitHub Actions |
| Observability | **MISSING** | No LangSmith, Sentry, Prometheus, Grafana |

### Known Bugs
- `activities.js` L157, L264: hardcodes `gemini-3-flash-preview` (non-existent) — should use `model-router.js`
- `daily-routines.js`: only 8 of 15 NPC roles have routines (7 get generic default)
- TTS route: only 3 of 15 voices mapped

---

## Sprint Structure

### Sprint 4 — MVP (1 week)
**Goal**: Docker-compose up → all services run → agents move on map → user can interact.

### Sprint 5 — Observability & Reliability (1 week)  
**Goal**: See what's happening — traces, errors, costs, health dashboards.

### Sprint 6 — Frontend Features & Polish (1 week)
**Goal**: Live explore page, full TTS, social graph, simulation controls.

### Sprint 7 — Production Deployment (1 week)
**Goal**: CI/CD, GCP deploy, DNS, env management, production-grade.

---

## Sprint 4: MVP — Task Breakdown

### d3v07 (Issue #A: Backend MVP Hardening)
1. Fix `activities.js` L157/L264 — replace `gemini-3-flash-preview` with model-router import
2. Create `orchestrator/Dockerfile` — multi-stage Next.js build
3. Verify full `docker-compose up` — worker + spawner + orchestrator all start
4. Fix `spawn-agents.js` to work with 3 NPCs for demo (not 45)
5. Add health-check endpoints to worker (`/healthz`)
6. Complete daily routines for remaining 7 NPC roles
7. Map all 15 TTS voices in `orchestrator/src/app/api/tts/route.ts`
8. Add `.env.example` with all required env vars documented
9. Wire model-router into encounter.js if hardcoded
10. Verify Firestore state persistence + recovery on restart
11. Smoke test: 3 agents run cognitive loop for 5 min without crash
12. Write README.md "Quick Start" — clone → env → docker-compose up → open browser

### kushyarwar (Issue #B: Frontend MVP Polish)
1. Replace hardcoded demo agents on explore page with live Firestore query (#66)
2. Wire MapUI agent markers to real-time Firestore listener (onSnapshot)
3. Add loading states and error boundaries to MapUI and ControlPanel
4. Show agent encounter dialogues in real-time on the map sidebar
5. Fix comm-link chat to properly send/receive via /api/interact
6. Add connection status indicator (connected to Firestore / disconnected)
7. Style polish: consistent dark theme, proper spacing, no broken layouts
8. Test full auth flow: sign in → see map → click agent → chat → see response
9. Mobile viewport basic test (doesn't need to be perfect, just not broken)
10. Create demo walkthrough script (what to click, what to say)

---

## Sprint 5: Observability — Task Breakdown

### d3v07 (Issue #C: Backend Observability)
1. Integrate LangSmith tracing into cognitive-graph.js (#59)
2. Add Prometheus metrics endpoint to worker.js (#61)
3. Instrument activities.js with call duration + success/failure counters
4. Add token usage tracking per generateGeminiContent call (#63)
5. Create cost calculation utility (flash vs pro pricing)
6. Add structured JSON logging to all backend services
7. Instrument encounter.js with trace spans
8. Add Firestore read/write operation counters
9. Export worker health metrics (active workflows, queue depth)
10. Create /api/metrics endpoint on orchestrator for frontend consumption

### kushyarwar (Issue #D: Frontend Observability)
1. Integrate Sentry for client-side error tracking (#60)
2. Build real-time system health dashboard component (#62)
3. Replace decorative status labels with real data (#65)
4. Add WebSocket/SSE connection health indicator
5. Show per-agent cost consumption in agent detail panel
6. Build simple Grafana dashboard config (JSON export) (#62)
7. Add API latency tracking on frontend (time each fetch)
8. Show encounter frequency graph (encounters/min over time)
9. Add error toast notifications for failed API calls
10. Build debug panel (toggle-able) showing raw Firestore state

---

## Sprint 6: Frontend Features — Task Breakdown

### d3v07 (Issue #E: Backend Feature APIs)
1. Add agent social graph API endpoint (relationships from social-memory)
2. Create simulation control API — speed multiplier, pause/resume
3. Add region-focus API — filter agents by neighborhood/borough
4. Implement agent spawn/despawn endpoints (#73)
5. Add NLP output gate — toxicity filtering on agent dialogue (#55)
6. Add API endpoint for encounter history (paginated)
7. Add SSE/WebSocket endpoint for real-time agent state push
8. Implement agent thread isolation — tenant-scoped IDs (#58)
9. Migrate API keys to env-based config (prep for Secret Manager, #57)
10. Performance test: 15 agents × 5 min, measure API p99 latency

### kushyarwar (Issue #F: Frontend Features)
1. Build agent social network graph visualization (#71)
2. Implement player avatar and first-person explore mode (#69)
3. Complete TTS integration — play voice on encounter in UI (#67)
4. Add global simulation controls UI — speed, region, spawn (#73)
5. Build encounter replay viewer — browse past dialogues
6. Add spatial audio indicator (visual, not actual 3D audio) (#70)
7. Mobile-responsive layout pass (#72)
8. Add keyboard shortcuts for map navigation
9. Build agent filter/search — by role, neighborhood, sentiment
10. Polish StreetView integration — better camera angles (#68)

---

## Sprint 7: Production — Task Breakdown

### d3v07 (Issue #G: Production Infrastructure)
1. Create GitHub Actions CI — lint + typecheck + build on every PR (#45)
2. Create GitHub Actions CD — deploy to GCP on merge to main (#45)
3. Set up GCP Cloud Run / GKE for the 3 services
4. Migrate API keys to GCP Secret Manager (#57)
5. Set up environment config — dev/staging/prod (#47)
6. Configure Cloudflare DNS + edge caching (#46)
7. Add Health check + readiness probes to K8s manifests
8. Set up Upstash Redis production instance
9. Configure Firestore production security rules
10. Load test: 15 agents for 1 hour, document resource usage
11. Set up alerting — Slack for critical failures (#64)
12. Write production runbook — deploy, rollback, debug

### kushyarwar (Issue #H: Production Frontend)
1. Production build optimization — bundle analysis, tree shaking
2. Add CSP headers and security headers
3. Configure environment-specific API URLs
4. Add service worker for offline map caching
5. Implement graceful degradation when backend is down
6. Add analytics tracking (page views, feature usage)
7. Performance audit — Lighthouse score > 80
8. Cross-browser testing (Chrome, Safari, Firefox)
9. Add error recovery UI — reconnect button, retry logic
10. Final QA pass — go through demo walkthrough, fix all bugs

---

## Code Review Workflow

To increase d3v07's code review metrics on GitHub:

1. **Branch protection on `main`**: Require 1 review before merge
2. **Workflow**: kushyarwar creates PRs → d3v07 reviews (and vice versa)
3. **Each sprint**: minimum 2 PRs per person = 4 reviews/week
4. **Review style**: Approve with comments, leave substantive feedback (not just "LGTM")
5. **GitHub counts reviews** when you submit a review via PR → Files Changed → Review Changes → Submit

---

## Definition of Done (per Sprint)

- [ ] All tasks in sprint issue checked off
- [ ] PR created, reviewed by other team member, merged
- [ ] docker-compose up works after merge
- [ ] No new lint/typecheck errors
- [ ] Quick demo recorded (30s screen recording)

---
---

# Use Case Roadmap — Post-MVP Feature Verticals

> Metropolis is a **human behavior simulation engine**. The MVP proves the core loop (autonomous agents with memory, perception, and dialogue on a real city map). Everything below builds on top of that foundation — each use case is a vertical slice that reuses the existing cognitive graph, encounter system, memory layer, and MCP tools without rearchitecting.

## Selection Criteria

We picked 5 use cases based on:
1. **Leverage** — how much of the current stack it reuses (high = less new code)
2. **Differentiation** — how unique it is vs what others are building
3. **Demoability** — can we show it in 60 seconds to a non-technical audience
4. **Revenue signal** — real buyers exist today
5. **Data value** — generates behavioral datasets that compound over time

---

## Use Case 1: Living Game Worlds (NPC Intelligence Engine)

### What It Is
An SDK/API layer that game developers plug into their worlds to get NPCs that remember players, form opinions, spread rumors, have daily routines, and react to emergent events — replacing scripted dialogue trees with autonomous cognition.

### Why This First
This is the most natural extension of what we already built. Every component maps 1:1.

### Current Components Used

| Component | Game World Mapping |
|-----------|-------------------|
| `cognitive-graph.js` (perceive→think→act→reflect) | NPC decision loop — already does exactly what game NPCs need |
| `encounter.js` (multi-turn dialogue) | Player-NPC conversations with memory of past interactions |
| `social-memory.js` (relationship tracking) | NPCs remember the player, form opinions, gossip with other NPCs |
| `memory.js` (Pinecone vector store) | Long-term NPC memory — "last time you were here you stole from my shop" |
| `daily-routines.js` (role-based schedules) | NPCs go to work, eat lunch, go home — schedules vary by role |
| `activities.js` (7 MCP tools) | NPCs check weather, navigate, find places, scan for nearby entities |
| `spawn-agents.js` (15 NPC profiles) | Template for spawning game-world populations with unique personalities |
| `model-router.js` (flash/pro routing) | Cheap model for chitchat, expensive model for plot-critical dialogue |

### Sub-Features
1. **Player memory persistence** — NPC remembers what the player said/did across sessions (extend `social-memory.js` to track player entity)
2. **Reputation system** — aggregate relationship scores into a neighborhood/faction reputation (new field in Firestore agent doc)
3. **Rumor propagation** — when NPC A witnesses an event, they tell NPC B during encounters, who tells NPC C (extend `encounter.js` to inject gossip from recent memories)
4. **Dynamic quest generation** — NPCs observe problems in their environment and ask the player for help (new LangGraph node after `reflect` that evaluates if an unresolved problem exists)
5. **Emotional state model** — beyond sentiment score, track fear/anger/joy/trust as floats that decay over time and influence dialogue tone (extend `NpcState` in cognitive-graph)
6. **Crowd behavior** — groups of NPCs react collectively to events (fire, police, celebrity) using geohash proximity from `geohash.js`

### Execution Plan
- **Sprint 8** (1 week): Player entity tracking + reputation system + rumor propagation
- **Sprint 9** (1 week): Dynamic quest generation + emotional state model + crowd reactions
- **Deliverable**: Demo where a player interacts with 5 NPCs, builds a reputation, NPCs gossip about the player, and one NPC generates a quest based on an observed problem

---

## Use Case 2: Urban Planning Simulation (Smart City Digital Twin)

### What It Is
A simulation tool where city planners define a scenario (close a road, add a subway stop, host a 50K-person event) and watch how a simulated population reacts — movement patterns, congestion, sentiment, business impact.

### Why This
Governments and urban planning firms are already paying for agent-based simulation tools (AnyLogic, SUMO). Ours is differentiated by having agents that *reason* about changes rather than follow probability distributions.

### Current Components Used

| Component | Urban Planning Mapping |
|-----------|----------------------|
| `cognitive-graph.js` | Citizens evaluate route changes, react to disruptions, make decisions |
| `activities.js` → `get_travel_time` | Real Google Maps Routes API — actual travel time between any two points |
| `activities.js` → `find_nearby_places` | Citizens find alternative shops, restaurants, transit when their usual is blocked |
| `activities.js` → `get_weather` | Weather affects pedestrian behavior, outdoor events |
| `geohash.js` | Spatial query for density heatmaps — how many agents per grid cell |
| `telemetry.js` (Pub/Sub) | Stream agent movement data to BigQuery for analysis |
| `scripts/bigquery-streamer.js` | Already built — real-time data pipeline to BigQuery |
| `daily-routines.js` | Commuter patterns — agents have home/work/errands schedules |

### Sub-Features
1. **Scenario injection API** — define events via API: road closure at coords X,Y from time T1 to T2 (new `/api/scenario` endpoint that modifies agent perception context)
2. **Population density heatmap** — aggregate geohash cell counts into a visual grid overlay on the map (frontend component using `geohash.js` data)
3. **Traffic flow analysis** — track agent movement vectors over time, identify bottlenecks (extend `telemetry.js` to log origin→destination pairs)
4. **Sentiment impact tracking** — measure population sentiment before/after a scenario (aggregate `sentimentScore` from Firestore across time)
5. **Emergency evacuation mode** — inject a disaster event, observe how agents flee, identify chokepoints (new disaster event type in scenario API)
6. **Public transit modeling** — agents choose between walking, transit, and driving based on travel time results (extend `think` node to compare options)
7. **Before/after comparison dashboard** — side-by-side view: baseline simulation vs scenario simulation (frontend split-view component)

### Execution Plan
- **Sprint 10** (1 week): Scenario injection API + density heatmap + traffic flow logging
- **Sprint 11** (1 week): Sentiment tracking + evacuation mode + comparison dashboard
- **Deliverable**: Demo where user closes a street in Midtown, watches agents reroute, sees density spike on adjacent streets, and views a before/after sentiment comparison

---

## Use Case 3: Training & Role-Play Simulator (Enterprise Training)

### What It Is
A platform where professionals practice high-stakes conversations with AI characters that behave realistically — police de-escalation, medical triage, sales negotiation, customer service, crisis management. The AI characters have backstories, emotional states, and react dynamically to the trainee's approach.

### Why This
Enterprise training is a $370B market. Current role-play training uses scripted scenarios or expensive human actors. Our agents already have personality, memory, and dialogue — we just need to point them at training scenarios instead of NYC streets.

### Current Components Used

| Component | Training Mapping |
|-----------|-----------------|
| `encounter.js` (multi-turn dialogue) | Core of every training session — sustained back-and-forth conversation |
| `cognitive-graph.js` | Character evaluates trainee's approach and adapts behavior |
| `social-memory.js` | Character remembers past training sessions with same trainee |
| `memory.js` (Pinecone) | Character recalls scenario-specific knowledge (medical protocols, legal rights, product specs) |
| `aegis-agent.js` | Safety layer — prevent training characters from generating harmful content |
| `pii-redactor.js` | Redact any real PII the trainee accidentally shares |
| `model-router.js` | Flash for quick responses, Pro for complex emotional/ethical scenarios |
| `/api/interact` route | Already handles user→agent conversation with security layers |
| `/api/tts` route | Voice output for immersive training (character speaks back) |

### Sub-Features
1. **Scenario template system** — define training scenarios: character profile, situation context, evaluation rubric, difficulty level (new Firestore collection `scenarios`)
2. **Performance scoring** — after each session, Gemini evaluates the trainee's approach against the rubric and gives a score + feedback (new `evaluate` LangGraph node)
3. **Difficulty scaling** — character becomes more confrontational/complex at higher levels (modify system prompt injection in `encounter.js` based on difficulty param)
4. **Session recording & replay** — store full dialogue transcript with timestamps for review (extend encounter logging to include trainee messages)
5. **Multi-character scenarios** — trainee interacts with 2-3 characters simultaneously (e.g., witness + suspect + bystander) using existing multi-agent encounter system
6. **Emotional escalation model** — character's emotional state intensifies if trainee uses wrong approach, de-escalates if they use correct techniques (extend emotional state from Use Case 1)

### Execution Plan
- **Sprint 12** (1 week): Scenario template system + performance scoring + difficulty scaling
- **Sprint 13** (1 week): Session replay + multi-character scenarios + emotional escalation
- **Deliverable**: Demo of a police de-escalation training scenario where the AI character gets increasingly agitated if the trainee is aggressive, calms down if they use proper technique, and gives a performance score at end

---

## Use Case 4: Social Research & Behavioral Analysis (Research Platform)

### What It Is
A research tool where social scientists define a population with specific demographic distributions, inject stimuli (news events, policy changes, marketing campaigns), and observe emergent social dynamics — opinion formation, group polarization, information cascading, decision-making patterns.

### Why This
This is the *core thesis* of Metropolis — understanding human patterns by simulating them. Academic institutions and think tanks are the early adopters. The data generated has compounding value.

### Current Components Used

| Component | Research Mapping |
|-----------|-----------------|
| `cognitive-graph.js` | Each agent independently reasons about stimuli — no central script |
| `encounter.js` + `social-memory.js` | Agents influence each other's opinions through conversation — organic information spread |
| `memory.js` (Pinecone) | Agents form long-term beliefs from accumulated experiences |
| `rag-ingest.js` (18 NYC knowledge entries) | Extensible — inject domain-specific knowledge (news articles, policy documents) |
| `telemetry.js` + `bigquery-streamer.js` | Full behavioral data pipeline for statistical analysis |
| `spawn-agents.js` (15 profiles) | Template for creating diverse populations with varied backgrounds and biases |
| `geohash.js` | Spatial analysis — do opinions cluster geographically? |

### Sub-Features
1. **Population builder** — define demographic distributions: age, income, education, political leaning, personality traits (extend NPC profiles in `spawn-agents.js` with demographic fields)
2. **Stimulus injection** — broadcast news/events to all agents or targeted subgroups (new API: inject a "world event" into agents' perception context)
3. **Opinion tracking** — extract and track agent stances on configurable topics over time (new `opinion` field in Firestore agent doc, updated during `reflect` node)
4. **Influence network visualization** — who changed whose mind, and through how many hops (extend `social-memory.js` to track opinion-change events with source attribution)
5. **Experiment control groups** — run identical populations with and without a stimulus, compare outcomes (multiple concurrent simulation instances)
6. **Data export pipeline** — one-click export of full behavioral dataset to CSV/Parquet for external analysis tools (extend BigQuery streamer with export endpoint)
7. **Reproducibility** — seed-based deterministic replay of simulations for peer review (checkpoint-based replay using `checkpointer.js`)

### Execution Plan
- **Sprint 14** (1 week): Population builder + stimulus injection + opinion tracking
- **Sprint 15** (1 week): Influence visualization + experiment controls + data export
- **Deliverable**: Demo where 15 agents with diverse demographics receive a news event, form opinions, influence each other through encounters, and produce a time-series graph showing opinion shift + an influence network graph

---

## Use Case 5: Autonomous Vehicle Testing (Pedestrian Behavior Simulation)

### What It Is
A simulation environment where autonomous vehicle systems are tested against realistic pedestrian behavior — jaywalking, group crossings, distracted walking, children running, elderly slow crossings. Instead of scripted pedestrian paths, agents make real human-like decisions about when and where to cross.

### Why This
AV companies spend millions on pedestrian simulation. Current tools use scripted paths or simple probability models. Our agents *decide* to jaywalk because they're late for work, or hesitate because they're looking at their phone — behavior that's much harder to script.

### Current Components Used

| Component | AV Testing Mapping |
|-----------|-------------------|
| `cognitive-graph.js` | Pedestrians reason about whether to cross, wait, or jaywalk |
| `activities.js` → `get_travel_time` | Real walking time estimates between points |
| `activities.js` → `get_street_view` | Visual perception of the street environment |
| `daily-routines.js` | Pedestrians have schedules — they rush during commute, stroll during leisure |
| `geohash.js` | Precise spatial positioning for collision detection zones |
| `telemetry.js` | Stream pedestrian trajectories for AV system consumption |
| `model-router.js` | Flash for routine movement, Pro for complex crossing decisions |

### Sub-Features
1. **Pedestrian trajectory API** — real-time stream of agent position + velocity + heading for AV system consumption (new SSE endpoint with 100ms update interval)
2. **Crossing behavior model** — agents decide to cross based on urgency (daily routine pressure), visibility (weather), attention (personality trait), group influence (nearby agents crossing) (extend `think` node with crossing-specific reasoning)
3. **Distraction modeling** — some agents are "on their phone" or "talking to a friend" and have reduced awareness (new attention field in NpcState)
4. **Group dynamics** — groups of pedestrians move together, one person crosses and others follow (extend geohash proximity + encounter system)
5. **Edge case generation** — automatically create rare but important scenarios: child chasing a ball, person in wheelchair, cyclist on sidewalk (scenario template system from Use Case 3)
6. **Trajectory recording for replay** — record and replay agent trajectories for regression testing of AV algorithms (extend checkpointer with full position history)

### Execution Plan
- **Sprint 16** (1 week): Pedestrian trajectory API + crossing behavior model + distraction modeling
- **Sprint 17** (1 week): Group dynamics + edge case generation + trajectory replay
- **Deliverable**: Demo showing 10 pedestrian agents at a NYC intersection, AV test harness receiving their trajectory stream, with one agent jaywalking because they're late and another hesitating because it's raining

---

## Full Timeline Overview

```
PHASE 1: FOUNDATION (Sprints 4-7, 4 weeks)
├── Sprint 4:  MVP — docker-compose up, agents move, user chats         ← YOU ARE HERE
├── Sprint 5:  Observability — traces, metrics, dashboards
├── Sprint 6:  Frontend features — explore mode, social graph, controls
└── Sprint 7:  Production — CI/CD, GCP deploy, monitoring

PHASE 2: USE CASE VERTICALS (Sprints 8-17, 10 weeks)
├── UC1: Game Worlds
│   ├── Sprint 8:  Player memory + reputation + rumor propagation
│   └── Sprint 9:  Quest generation + emotional model + crowd behavior
├── UC2: Urban Planning
│   ├── Sprint 10: Scenario API + density heatmap + traffic flow
│   └── Sprint 11: Sentiment impact + evacuation + comparison dashboard
├── UC3: Training Simulator
│   ├── Sprint 12: Scenario templates + performance scoring + difficulty
│   └── Sprint 13: Session replay + multi-character + escalation model
├── UC4: Social Research
│   ├── Sprint 14: Population builder + stimulus injection + opinion tracking
│   └── Sprint 15: Influence viz + experiment controls + data export
└── UC5: AV Testing
    ├── Sprint 16: Trajectory API + crossing behavior + distraction model
    └── Sprint 17: Group dynamics + edge cases + trajectory replay
```

### Shared Infrastructure (Built Once, Used by All)
These components get built during the first use case (UC1) and are reused by all subsequent ones:
- **Emotional state model** → UC1 builds it, UC3/UC4 reuse it
- **Scenario injection API** → UC2 builds it, UC3/UC4/UC5 reuse it
- **Population builder** → UC4 builds it, all others can use custom populations
- **SSE real-time streaming** → UC5 builds it, all others benefit from live push
- **Session recording & replay** → UC3 builds it, UC5 reuses for trajectory replay

This is why the use cases are ordered this way — each one adds infrastructure that makes the next one cheaper to build. No use case depends on a previous one being complete (they can be built in any order), but building them in this order minimizes total work.
