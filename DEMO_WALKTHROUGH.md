# Metropolis — Demo Walkthrough Script

> 60-second demo script for Sprint 4 MVP

---

## Pre-Flight Checklist
- [ ] `docker-compose up` running (worker + spawner + orchestrator)
- [ ] Open browser to `http://localhost:3000`
- [ ] 3 agents should be spawned and visible on the map

---

## Demo Steps

### 1. Sign In (5 sec)
- You'll land on the **Clerk sign-in page** (dark themed)
- Sign in with your demo credentials
- You're redirected to the main simulation view

### 2. Observe the Map (10 sec)
- **Top-left indicators**: FIRESTORE: LIVE (green) and NLP SENTIMENT: ACTIVE (blue)
- **Map**: 3 glowing agent markers on the NYC map — each one is an autonomous NPC
- Colors = sentiment: 🟢 green (happy), 🔵 blue (neutral), 🔴 red (stressed)
- Pulsing agents = currently in a cognitive collision (encounter)

### 3. Click an Agent (15 sec)
- Click any glowing marker → **NPC Detail Panel** slides in from the right
- Shows: Role, UUID, current cognitive goal, NLP sentiment bar, engine status
- **Street View**: Live 360° panorama of their exact coordinates — drag to look around
- **Last Interaction**: If they've had an encounter, their dialogue appears here

### 4. Chat via Comm-Link (15 sec)
- Scroll down in the detail panel to the **User Comm-Link** input
- Type a message (e.g., "What do you think about the weather?")
- Hit Send → the agent responds in-character using **Gemini 2.5 Flash**
- Notice the **NLP sentiment** updates based on your message tone
- Your input is protected by **AegisAgent** (prompt injection defense) and **PII redaction**

### 5. Control Panel (10 sec)
- Right panel shows **live global stats**: Active Entities, Cognitive Collisions, Global Mood Index
- **NLP Sentiment Stream**: Scroll to see recent encounters between agents with dialogue and sentiment scores
- **System Logs**: Real-time activity feed — agent movements, encounters, sentiment shifts
- **TTS**: Encounter dialogue is read aloud via **Google Cloud Text-to-Speech** (15 unique voices)

### 6. Durability Demo (5 sec)
- Click **"KILL PROCESS"** (red button, top right) → UI greys out, server status shows OFFLINE
- Agent state is preserved in Firestore — nothing is lost
- Click **"RESTORE ENGINE"** (green button) → simulation resumes from exact state
- Connection indicator transitions: OFFLINE → CONNECTING → LIVE

---

## Key Talking Points
1. **Fully autonomous** — agents run cognitive loops independently via Temporal.io
2. **Real-world grounded** — Google Maps, Street View, live weather data
3. **12 Google Cloud APIs** — Gemini, Firestore, Cloud NLP, Cloud TTS, Maps, Street View, etc.
4. **Security-hardened** — Clerk auth, Aegis prompt defense, PII redaction, rate limiting
5. **Durable workflows** — crash the server, restore it, nothing lost
