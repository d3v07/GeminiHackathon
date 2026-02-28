'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface Agent {
    agentId: string;
    role: string;
    lat: number;
    lng: number;
    sentimentScore: number;
    isInteracting: boolean;
    defaultTask?: string;
}

interface ChatMessage {
    role: 'user' | 'npc';
    text: string;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
// Map a tiny slice of real NYC coords to local 3D scene coords.
// We use Times Square: ~40.757, -73.986 as origin (0,0)
const LAT_ORIGIN = 40.757;
const LNG_ORIGIN = -73.986;
const SCALE = 9000; // 1 lat/lng degree ≈ 9000 scene units → makes block ~200 units wide

function latlngTo3D(lat: number, lng: number): [number, number] {
    const x = (lng - LNG_ORIGIN) * SCALE;
    const z = -(lat - LAT_ORIGIN) * SCALE;
    return [x, z];
}

// Emoji label rendered on a canvas → THREE.Sprite
function makeAgentSprite(role: string, sentiment: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;

    // Background bubble
    ctx.fillStyle = sentiment > 0.1 ? '#22c55e' : sentiment < -0.1 ? '#ef4444' : '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 152, 16);
    ctx.fill();

    // Emoji face
    const faceEmoji =
        role.includes('Historian') ? '🧐' :
            role.includes('Ghost') ? '👻' :
                role.includes('Broker') ? '💼' :
                    role.includes('Jazz') ? '🎷' :
                        role.includes('Startup') ? '🚀' :
                            role.includes('Restaurant') ? '🍜' :
                                role.includes('Dog') ? '🐕' :
                                    role.includes('Performer') ? '🎭' :
                                        role.includes('Rogue') ? '🤖' :
                                            role.includes('Tourist') ? '📸' :
                                                role.includes('Yoga') ? '🧘' :
                                                    role.includes('Pizza') ? '🍕' :
                                                        role.includes('Sanitation') ? '🗑️' :
                                                            role.includes('Socialite') ? '💅' :
                                                                role.includes('Pigeon') ? '🐦' :
                                                                    '🧍';

    ctx.font = '52px serif';
    ctx.textAlign = 'center';
    ctx.fillText(faceEmoji, 64, 72);

    // Stick body (drawn below emoji)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 80);  // neck
    ctx.lineTo(64, 120); // torso
    ctx.stroke();
    // Arms
    ctx.beginPath();
    ctx.moveTo(42, 92);
    ctx.lineTo(86, 92);
    ctx.stroke();
    // Legs
    ctx.beginPath();
    ctx.moveTo(64, 120);
    ctx.lineTo(44, 148);
    ctx.moveTo(64, 120);
    ctx.lineTo(84, 148);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 5, 1);
    return sprite;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
export default function ExplorePage() {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const keysRef = useRef<Record<string, boolean>>({});
    const agentMeshesRef = useRef<Map<string, THREE.Sprite>>(new Map());
    const animFrameRef = useRef<number>(0);
    const yawRef = useRef(0);
    const pitchRef = useRef(0);
    const isLockedRef = useRef(false);

    const [agents, setAgents] = useState<Agent[]>([]);
    const [nearbyAgent, setNearbyAgent] = useState<Agent | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [godMode, setGodMode] = useState(false);
    const [worldTemp, setWorldTemp] = useState(20);
    const [globalMood, setGlobalMood] = useState(0);
    const [isSending, setIsSending] = useState(false);
    const [hint, setHint] = useState('Click to enter the world');
    const [playerPos, setPlayerPos] = useState({ x: 0, z: 0 });

    // Fetch real agents
    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch('/api/state');
            const data = await res.json();
            if (data.agents) {
                setAgents(data.agents);
                const avg = data.agents.length > 0
                    ? data.agents.reduce((a: number, ag: Agent) => a + (ag.sentimentScore || 0), 0) / data.agents.length
                    : 0;
                setGlobalMood(avg);
            }
        } catch (e) {
            console.warn('Could not fetch agents', e);
        }
    }, []);

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 5000);
        return () => clearInterval(interval);
    }, [fetchAgents]);

    // Build / update 3D scene
    useEffect(() => {
        if (!mountRef.current) return;
        const mount = mountRef.current;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a1a);
        scene.fog = new THREE.Fog(0x0a0a1a, 60, 200);
        sceneRef.current = scene;

        // Camera (first-person)
        const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 300);
        camera.position.set(0, 2.5, 0);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        mount.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Lighting
        const ambient = new THREE.AmbientLight(0x334455, 1.2);
        scene.add(ambient);
        const streetlight1 = new THREE.PointLight(0xffeedd, 2, 40);
        streetlight1.position.set(10, 8, 10);
        scene.add(streetlight1);
        const streetlight2 = new THREE.PointLight(0x5599ff, 1.5, 50);
        streetlight2.position.set(-15, 10, -15);
        scene.add(streetlight2);

        // Ground (city street)
        const groundGeo = new THREE.PlaneGeometry(300, 300);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x111122 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);

        // Grid overlay (street grid)
        const grid = new THREE.GridHelper(300, 60, 0x223344, 0x1a2233);
        scene.add(grid);

        // City buildings – simple but stylish
        const buildingData = [
            { x: 20, z: 20, w: 10, d: 10, h: 35, color: 0x1a2a4a },
            { x: -25, z: 15, w: 12, d: 8, h: 28, color: 0x0d1b2a },
            { x: 30, z: -20, w: 8, d: 12, h: 45, color: 0x152038 },
            { x: -20, z: -25, w: 15, d: 10, h: 22, color: 0x1e2d3d },
            { x: 5, z: 30, w: 10, d: 10, h: 60, color: 0x0f1923 },
            { x: -10, z: -35, w: 12, d: 8, h: 38, color: 0x172030 },
            { x: 40, z: 5, w: 8, d: 14, h: 55, color: 0x0a1520 },
            { x: -40, z: -10, w: 10, d: 10, h: 42, color: 0x1a2535 },
            { x: 15, z: -40, w: 14, d: 8, h: 30, color: 0x162030 },
            { x: -30, z: 35, w: 10, d: 12, h: 25, color: 0x1f2d3a },
        ];

        buildingData.forEach(b => {
            const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
            const mat = new THREE.MeshLambertMaterial({ color: b.color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(b.x, b.h / 2, b.z);
            scene.add(mesh);

            // Window lights
            const winGeo = new THREE.BoxGeometry(b.w + 0.1, b.h, b.d + 0.1);
            const wireframe = new THREE.LineSegments(
                new THREE.EdgesGeometry(winGeo),
                new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.4 })
            );
            winGeo.dispose();
            wireframe.position.copy(mesh.position);
            scene.add(wireframe);
        });

        // Street lights
        const lampPositions = [[10, 0], [-10, 0], [0, 10], [0, -10], [20, 0], [-20, 0]];
        lampPositions.forEach(([x, z]) => {
            const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6, 6);
            const poleMat = new THREE.MeshLambertMaterial({ color: 0x445566 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(x, 3, z);
            scene.add(pole);

            const light = new THREE.PointLight(0xffeecc, 1.5, 25);
            light.position.set(x, 6.2, z);
            scene.add(light);

            const glowGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.set(x, 6.2, z);
            scene.add(glow);
        });

        // Pointer lock (first-person look)
        const canvas = renderer.domElement;
        canvas.addEventListener('click', () => {
            canvas.requestPointerLock();
        });
        document.addEventListener('pointerlockchange', () => {
            isLockedRef.current = document.pointerLockElement === canvas;
            setHint(isLockedRef.current ? 'WASD to move • E to interact • ESC to exit' : 'Click to enter the world');
        });
        document.addEventListener('mousemove', (e) => {
            if (!isLockedRef.current) return;
            yawRef.current -= e.movementX * 0.002;
            pitchRef.current -= e.movementY * 0.002;
            pitchRef.current = Math.max(-0.8, Math.min(0.8, pitchRef.current));
        });

        // Keyboard
        const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = true; };
        const onKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // Resize
        const onResize = () => {
            if (!mount || !cameraRef.current || !rendererRef.current) return;
            cameraRef.current.aspect = mount.clientWidth / mount.clientHeight;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(mount.clientWidth, mount.clientHeight);
        };
        window.addEventListener('resize', onResize);

        // Animation loop
        const SPEED = 8;
        const clock = new THREE.Clock();

        const animate = () => {
            animFrameRef.current = requestAnimationFrame(animate);
            const dt = clock.getDelta();

            if (isLockedRef.current && cameraRef.current) {
                const camera = cameraRef.current;

                // Apply yaw/pitch
                camera.rotation.order = 'YXZ';
                camera.rotation.y = yawRef.current;
                camera.rotation.x = pitchRef.current;

                // Movement
                const dir = new THREE.Vector3();
                if (keysRef.current['w'] || keysRef.current['arrowup']) dir.z -= 1;
                if (keysRef.current['s'] || keysRef.current['arrowdown']) dir.z += 1;
                if (keysRef.current['a'] || keysRef.current['arrowleft']) dir.x -= 1;
                if (keysRef.current['d'] || keysRef.current['arrowright']) dir.x += 1;
                dir.normalize().applyEuler(new THREE.Euler(0, yawRef.current, 0));
                camera.position.addScaledVector(dir, SPEED * dt);
                camera.position.y = 2.5; // keep on ground

                // Clamp to world bounds
                camera.position.x = Math.max(-80, Math.min(80, camera.position.x));
                camera.position.z = Math.max(-80, Math.min(80, camera.position.z));

                setPlayerPos({ x: Math.round(camera.position.x), z: Math.round(camera.position.z) });
            }

            rendererRef.current?.render(scene, cameraRef.current!);
        };
        animate();

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('resize', onResize);
            renderer.dispose();
            if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        };
    }, []);

    // Update agent sprites when agents change
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Remove old
        agentMeshesRef.current.forEach(sprite => scene.remove(sprite));
        agentMeshesRef.current.clear();

        // Add new ones
        agents.forEach(agent => {
            const [x, z] = latlngTo3D(agent.lat, agent.lng);
            // Clamp within scene, some agents might be far out
            const cx = Math.max(-75, Math.min(75, x));
            const cz = Math.max(-75, Math.min(75, z));

            const sprite = makeAgentSprite(agent.role, agent.sentimentScore || 0);
            sprite.position.set(cx, 5, cz);
            sprite.userData = agent;
            scene.add(sprite);
            agentMeshesRef.current.set(agent.agentId, sprite);
        });
    }, [agents]);

    // Proximity detection
    useEffect(() => {
        const check = setInterval(() => {
            if (!cameraRef.current) return;
            const cam = cameraRef.current.position;
            let closest: Agent | null = null;
            let closestDist = Infinity;

            agentMeshesRef.current.forEach((sprite) => {
                const agent = sprite.userData as Agent;
                const dx = cam.x - sprite.position.x;
                const dz = cam.z - sprite.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < 10 && dist < closestDist) {
                    closestDist = dist;
                    closest = agent;
                }
            });

            setNearbyAgent(closest);
        }, 300);
        return () => clearInterval(check);
    }, []);

    // E key to open chat
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'e' && nearbyAgent && !chatOpen) {
                document.exitPointerLock();
                setChatOpen(true);
                setChatMessages([
                    { role: 'npc', text: `Hey! I'm ${nearbyAgent.role}. ${nearbyAgent.defaultTask || 'Just wandering around...'}` }
                ]);
            }
            if (e.key === 'Escape' && chatOpen) {
                setChatOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [nearbyAgent, chatOpen]);

    // Send a chat message to the NPC
    const sendMessage = async () => {
        if (!inputText.trim() || !nearbyAgent || isSending) return;
        const userText = inputText.trim();
        setInputText('');
        setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
        setIsSending(true);

        try {
            const res = await fetch('/api/orchestrator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: nearbyAgent.agentId,
                    lat: nearbyAgent.lat,
                    lng: nearbyAgent.lng,
                    defaultTask: `Respond in character as ${nearbyAgent.role}. The user says: "${userText}". Keep response under 50 words, stay in character.`,
                    memoryContext: nearbyAgent.defaultTask
                })
            });
            const data = await res.json();
            const reply = data?.interaction?.transcript || data?.message || `*${nearbyAgent.role} nods thoughtfully...*`;
            setChatMessages(prev => [...prev, { role: 'npc', text: reply.substring(0, 200) }]);
        } catch {
            setChatMessages(prev => [...prev, { role: 'npc', text: '*looks away mysteriously and keeps walking...*' }]);
        } finally {
            setIsSending(false);
        }
    };

    const moodColor = globalMood > 0.1 ? 'text-emerald-400' : globalMood < -0.1 ? 'text-rose-400' : 'text-amber-400';

    return (
        <div className="w-full h-screen bg-black relative overflow-hidden select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* 3D Canvas */}
            <div ref={mountRef} className="absolute inset-0" />

            {/* HUD Overlay */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Crosshair */}
                {!chatOpen && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                        <div className="w-5 h-5 relative">
                            <div className="absolute top-1/2 left-0 w-full h-px bg-white/60" />
                            <div className="absolute left-1/2 top-0 h-full w-px bg-white/60" />
                            <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 border border-white/60 rounded-full" />
                        </div>
                    </div>
                )}

                {/* Top bar */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20">
                    <div className="bg-black/70 backdrop-blur border border-gray-800 rounded-xl px-4 py-2">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">PROJECT METROPOLIS</div>
                        <div className="text-xs text-gray-300 font-mono">3D EXPLORE MODE • TIMES SQUARE</div>
                    </div>

                    <div className="flex gap-3">
                        <div className="bg-black/70 backdrop-blur border border-gray-800 rounded-xl px-4 py-2 text-center">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest">Entities</div>
                            <div className="text-lg font-black text-white font-mono">{agents.length}</div>
                        </div>
                        <div className="bg-black/70 backdrop-blur border border-gray-800 rounded-xl px-4 py-2 text-center">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest">Global Mood</div>
                            <div className={`text-lg font-black font-mono ${moodColor}`}>
                                {globalMood > 0 ? '+' : ''}{globalMood.toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-black/70 backdrop-blur border border-gray-800 rounded-xl px-4 py-2 text-center">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest">Position</div>
                            <div className="text-xs font-mono text-sky-400">{playerPos.x}, {playerPos.z}</div>
                        </div>
                    </div>
                </div>

                {/* Hint bar */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                    <div className="bg-black/80 backdrop-blur border border-gray-700 rounded-full px-6 py-2 text-[11px] text-gray-400 tracking-wider">
                        {hint}
                    </div>
                </div>

                {/* Nearby agent prompt */}
                {nearbyAgent && !chatOpen && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 animate-bounce pointer-events-none">
                        <div className="bg-gradient-to-r from-sky-600 to-violet-600 rounded-xl px-6 py-3 flex items-center gap-3 shadow-2xl">
                            <span className="text-xl">💬</span>
                            <div>
                                <div className="text-white font-bold text-sm">{nearbyAgent.role} is nearby!</div>
                                <div className="text-sky-200 text-xs">Press E to interact</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* God Mode Panel */}
            <div className="absolute right-4 top-20 z-30 pointer-events-auto">
                <button
                    onClick={() => setGodMode(g => !g)}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${godMode ? 'bg-violet-600 border-violet-400 text-white' : 'bg-black/70 border-gray-700 text-gray-400 hover:border-violet-500'}`}
                >
                    ⚡ God Mode
                </button>

                {godMode && (
                    <div className="mt-2 bg-black/90 backdrop-blur border border-violet-800 rounded-xl p-4 w-56 space-y-4">
                        <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">World Controls</div>

                        <div>
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>🌡 Temperature</span>
                                <span className="text-white font-mono">{worldTemp}°C</span>
                            </div>
                            <input type="range" min={-10} max={40} value={worldTemp}
                                onChange={e => setWorldTemp(Number(e.target.value))}
                                className="w-full accent-violet-500 cursor-pointer" />
                            <div className="text-[9px] text-gray-600 mt-1">
                                {worldTemp < 0 ? '❄️ Freezing — agents seek shelter' :
                                    worldTemp < 15 ? '🌥 Cold — agents move indoors' :
                                        worldTemp < 28 ? '☀️ Pleasant — agents roam freely' :
                                            '🔥 Scorching — agents seek shade'}
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] text-gray-400 mb-2">🎭 Force Global Vibe</div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-1 bg-emerald-900 border border-emerald-600 text-emerald-400 text-[10px] rounded hover:bg-emerald-800 transition"
                                    onClick={async () => {
                                        for (const a of agents.slice(0, 3)) {
                                            await fetch('/api/orchestrator', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ agentId: a.agentId, lat: a.lat, lng: a.lng, defaultTask: 'Spread joy and positivity!' })
                                            }).catch(() => { });
                                        }
                                    }}>
                                    ✨ Positive Wave
                                </button>
                                <button className="flex-1 py-1 bg-rose-900 border border-rose-600 text-rose-400 text-[10px] rounded hover:bg-rose-800 transition"
                                    onClick={async () => {
                                        for (const a of agents.slice(0, 3)) {
                                            await fetch('/api/orchestrator', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ agentId: a.agentId, lat: a.lat, lng: a.lng, defaultTask: 'Something terrible just happened nearby.' })
                                            }).catch(() => { });
                                        }
                                    }}>
                                    💀 Chaos Wave
                                </button>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] text-gray-400 mb-2">📡 Active Agents</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                                {agents.slice(0, 8).map(a => (
                                    <div key={a.agentId} className="flex items-center gap-2 text-[9px]">
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${(a.sentimentScore || 0) > 0.1 ? 'bg-emerald-500' : (a.sentimentScore || 0) < -0.1 ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                        <span className="text-gray-400 truncate">{a.role}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Chat Interface */}
            {chatOpen && nearbyAgent && (
                <div className="absolute inset-0 z-40 flex items-end justify-center pb-8 px-4 pointer-events-auto bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                        {/* Chat Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-black/60">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-sm">
                                    🧍
                                </div>
                                <div>
                                    <div className="text-white font-bold text-sm">{nearbyAgent.role}</div>
                                    <div className={`text-[10px] ${nearbyAgent.isInteracting ? 'text-sky-400' : 'text-emerald-400'}`}>
                                        {nearbyAgent.isInteracting ? '⚡ Currently interacting' : '● Available'}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setChatOpen(false)}
                                className="text-gray-600 hover:text-white text-xl leading-none transition-colors">✕</button>
                        </div>

                        {/* Messages */}
                        <div className="h-64 overflow-y-auto p-4 space-y-3">
                            {chatMessages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs rounded-xl px-3 py-2 text-sm ${msg.role === 'user'
                                        ? 'bg-sky-600 text-white'
                                        : 'bg-gray-800 text-gray-200'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {isSending && (
                                <div className="flex justify-start">
                                    <div className="bg-gray-800 rounded-xl px-4 py-2 text-gray-400 text-xs font-mono animate-pulse">
                                        thinking...
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t border-gray-800 flex gap-2">
                            <input
                                type="text"
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder="Say something to shift their vibe..."
                                autoFocus
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-sky-500 transition"
                            />
                            <button onClick={sendMessage}
                                disabled={isSending}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
