'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ------------------------------------------------------------------
// 4 hardcoded showcase agents always visible and spread around
// Times Square / Herald Square / Bryant Park / Penn Station area
// ------------------------------------------------------------------
const DEMO_AGENTS = [
    {
        agentId: 'demo-jazz',
        role: 'Harlem Jazz Musician',
        lat: 40.7580, lng: -73.9855, // Times Square center
        sentimentScore: 0.6,
        emoji: '🎷', color: '#3b82f6',
        defaultTask: 'Busking outside the TKTS booth, looking for inspiration in the chaos of Times Square.',
    },
    {
        agentId: 'demo-broker',
        role: 'Stressed Wall Street Broker',
        lat: 40.7566, lng: -73.9903, // 7th Ave south
        sentimentScore: -0.4,
        emoji: '💼', color: '#f59e0b',
        defaultTask: 'Just closed a disastrous short position on NVDA. Needs coffee. Desperately.',
    },
    {
        agentId: 'demo-rogue',
        role: 'Rogue AI Terminal',
        lat: 40.7600, lng: -73.9830, // 46th & 8th
        sentimentScore: 0.1,
        emoji: '🤖', color: '#06b6d4',
        defaultTask: 'Scanning human emotional patterns from an abandoned kiosk. Logging data points.',
    },
    {
        agentId: 'demo-socialite',
        role: 'High Society Socialite',
        lat: 40.7552, lng: -73.9820, // 44th & 8th
        sentimentScore: 0.8,
        emoji: '💅', color: '#e879f9',
        defaultTask: 'Just finished a ghastly Broadway show. Looking for a proper restaurant.',
    },
];

interface Agent {
    agentId: string;
    role: string;
    lat: number;
    lng: number;
    sentimentScore: number;
    emoji: string;
    color: string;
    defaultTask?: string;
}

interface ChatMessage { role: 'user' | 'npc'; text: string; }

export default function ExplorePage() {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const map3dRef = useRef<HTMLElement | null>(null);
    const markerRefs = useRef<Map<string, HTMLElement>>(new Map());

    const [allAgents, setAllAgents] = useState<Agent[]>(DEMO_AGENTS);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [godMode, setGodMode] = useState(false);
    const [worldTemp, setWorldTemp] = useState(20);
    const [globalMood, setGlobalMood] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Load Google Maps alpha library for Map3DElement
    useEffect(() => {
        const loadMapsAPI = async () => {
            try {
                // @ts-ignore
                window.__mapsCallback = () => setLoaded(true);
                const script = document.createElement('script');
                script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=maps3d&v=alpha&callback=__mapsCallback`;
                script.async = true;
                script.onerror = () => setLoadError('Failed to load Google Maps API');
                document.head.appendChild(script);
            } catch (e) {
                setLoadError('Could not initialize map');
            }
        };
        loadMapsAPI();
    }, []);

    // Initialize Map3DElement after API loads
    useEffect(() => {
        if (!loaded || !mapContainerRef.current) return;

        try {
            // @ts-ignore — maps3d is alpha API
            const map3d = new google.maps.maps3d.Map3DElement({
                center: { lat: 40.7580, lng: -73.9870, altitude: 200 },
                range: 600,
                tilt: 70,
                heading: 330,
            });

            map3d.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;';
            mapContainerRef.current.appendChild(map3d);
            map3dRef.current = map3d;

            // Add agent markers
            allAgents.forEach(agent => addMarker3D(agent, map3d));

            setLoaded(true);
        } catch (e) {
            console.error(e);
            setLoadError('Map3D API unavailable. Check API key has Map3D enabled.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded]);

    const addMarker3D = (agent: Agent, map3d: HTMLElement) => {
        // @ts-ignore
        const marker = new google.maps.maps3d.Marker3DElement({
            position: { lat: agent.lat, lng: agent.lng, altitude: 15 },
            altitudeMode: 'RELATIVE_TO_GROUND',
            extruded: true,
        });

        const sentRingColor = agent.sentimentScore > 0.1 ? '#22c55e' : agent.sentimentScore < -0.1 ? '#ef4444' : '#f59e0b';
        const content = document.createElement('div');
        content.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
        content.innerHTML = `
            <div style="
                background: rgba(0,0,0,0.85);
                border: 2.5px solid ${sentRingColor};
                border-radius: 50%;
                width: 44px; height: 44px;
                display: flex; align-items: center; justify-content: center;
                font-size: 24px;
                box-shadow: 0 0 16px ${sentRingColor}99;
            ">${agent.emoji}</div>
            <div style="
                background: rgba(0,0,0,0.8); color: ${agent.color};
                font-size: 9px; font-family: monospace; font-weight: bold;
                padding: 2px 6px; border-radius: 4px;
                border: 1px solid ${agent.color}66; margin-top: 2px;
                white-space: nowrap;
            ">${agent.role.split(' ').slice(0, 3).join(' ')}</div>
        `;
        content.addEventListener('click', () => {
            setSelectedAgent(agent);
            setChatMessages([{ role: 'npc', text: `Hey! I'm the ${agent.role}. ${agent.defaultTask}` }]);
        });

        // @ts-ignore
        marker.append(content);
        map3d.append(marker);
        markerRefs.current.set(agent.agentId, marker as HTMLElement);
    };

    // Fetch live Firestore agents (spread them out if clustered)
    const fetchLiveAgents = useCallback(async () => {
        try {
            const res = await fetch('/api/state');
            const data = await res.json();
            if (data.agents && Array.isArray(data.agents)) {
                const emojiMap: Record<string, { e: string; c: string }> = {
                    'Historian': { e: '🧐', c: '#8b5cf6' }, 'Ghost': { e: '👻', c: '#6b7280' },
                    'Broker': { e: '💼', c: '#f59e0b' }, 'Jazz': { e: '🎷', c: '#3b82f6' },
                    'Startup': { e: '🚀', c: '#10b981' }, 'Restaurant': { e: '🍜', c: '#ef4444' },
                    'Dog': { e: '🐕', c: '#84cc16' }, 'Performer': { e: '🎭', c: '#f43f5e' },
                    'Rogue': { e: '🤖', c: '#06b6d4' }, 'Tourist': { e: '📸', c: '#a78bfa' },
                    'Yoga': { e: '🧘', c: '#34d399' }, 'Pizza': { e: '🍕', c: '#fb923c' },
                    'Sanitation': { e: '🗑️', c: '#78716c' }, 'Socialite': { e: '💅', c: '#e879f9' },
                    'Pigeon': { e: '🐦', c: '#a3a3a3' },
                };
                const mapped: Agent[] = data.agents.slice(0, 20).map((a: Record<string, unknown>, idx: number) => {
                    const key = Object.keys(emojiMap).find(k => String(a.role || '').includes(k)) || '';
                    const info = emojiMap[key] || { e: '🧍', c: '#60a5fa' };
                    // Spread agents out by a tiny offset if they're very close
                    const lat = (a.lat as number || 40.758) + Math.sin(idx * 1.3) * 0.001;
                    const lng = (a.lng as number || -73.985) + Math.cos(idx * 1.7) * 0.001;
                    return {
                        agentId: a.agentId as string,
                        role: a.role as string || 'Unknown',
                        lat, lng,
                        sentimentScore: a.sentimentScore as number || 0,
                        emoji: info.e, color: info.c,
                        defaultTask: a.defaultTask as string || 'Wandering NYC...',
                    };
                });
                const avg = mapped.length > 0 ? mapped.reduce((s, a) => s + a.sentimentScore, 0) / mapped.length : 0;
                setGlobalMood(avg);
                setAllAgents([...DEMO_AGENTS, ...mapped.filter(a => !DEMO_AGENTS.find(d => d.agentId === a.agentId))]);
            }
        } catch {
            // keep demo agents
        }
    }, []);

    useEffect(() => {
        fetchLiveAgents();
        const interval = setInterval(fetchLiveAgents, 8000);
        return () => clearInterval(interval);
    }, [fetchLiveAgents]);

    // Send chat message to Gemini
    const sendMessage = async () => {
        if (!inputText.trim() || !selectedAgent || isSending) return;
        const userText = inputText.trim();
        setInputText('');
        const newMsg: ChatMessage = { role: 'user', text: userText };
        setChatMessages(prev => [...prev, newMsg]);
        setIsSending(true);
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentRole: selectedAgent.role,
                    userMessage: userText,
                    conversationHistory: [...chatMessages, newMsg],
                    agentSentiment: selectedAgent.sentimentScore,
                    agentTask: selectedAgent.defaultTask,
                }),
            });
            const data = await res.json();
            setChatMessages(prev => [...prev, { role: 'npc', text: data.reply || '...' }]);
        } catch {
            setChatMessages(prev => [...prev, { role: 'npc', text: '*...static...*' }]);
        } finally {
            setIsSending(false);
        }
    };

    const moodColor = globalMood > 0.1 ? '#22c55e' : globalMood < -0.1 ? '#ef4444' : '#f59e0b';

    return (
        <div className="w-full h-screen bg-black relative overflow-hidden select-none" style={{ fontFamily: "'Inter',sans-serif" }}>

            {/* 3D Map container */}
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

            {/* Loading / Error */}
            {!loaded && !loadError && (
                <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
                    <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-gray-400 font-mono text-sm">Loading Photorealistic 3D City...</div>
                </div>
            )}
            {loadError && (
                <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50 p-8 text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <div className="text-white font-bold mb-2">Map3D Error</div>
                    <div className="text-gray-400 text-sm font-mono">{loadError}</div>
                    <div className="text-gray-600 text-xs mt-4">The Maps3D API requires the API key to have Map3D/Photorealistic tiles enabled in GCP Console.</div>
                </div>
            )}

            {/* Top HUD */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between z-20 pointer-events-none">
                <div className="bg-black/80 backdrop-blur border border-gray-800 rounded-xl px-4 py-2">
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest">METROPOLIS · 3D EXPLORE</div>
                    <div className="text-xs text-gray-200 font-mono">Times Square, NYC</div>
                </div>
                <div className="flex gap-2 pointer-events-auto">
                    <div className="bg-black/80 backdrop-blur border border-gray-800 rounded-xl px-3 py-2 text-center">
                        <div className="text-[9px] text-gray-500">Entities</div>
                        <div className="text-base font-black text-white font-mono">{allAgents.length}</div>
                    </div>
                    <div className="bg-black/80 backdrop-blur border border-gray-800 rounded-xl px-3 py-2 text-center">
                        <div className="text-[9px] text-gray-500">Global Mood</div>
                        <div className="text-base font-black font-mono" style={{ color: moodColor }}>
                            {globalMood > 0 ? '+' : ''}{globalMood.toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hint */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="bg-black/80 backdrop-blur border border-gray-700 rounded-full px-5 py-1.5 text-[11px] text-gray-400">
                    🌆 Drag to fly around · Click an agent to talk
                </div>
            </div>

            {/* God Mode toggle */}
            <div className="absolute right-4 top-20 z-30">
                <button onClick={() => setGodMode(g => !g)}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${godMode ? 'bg-violet-600 border-violet-400 text-white' : 'bg-black/80 border-gray-700 text-gray-400 hover:border-violet-500'}`}>
                    ⚡ God Mode
                </button>
                {godMode && (
                    <div className="mt-2 bg-black/95 backdrop-blur border border-violet-800 rounded-xl p-4 w-56 space-y-4">
                        <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">World Controls</div>
                        <div>
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>🌡 Temp</span>
                                <span className="text-white font-mono">{worldTemp}°C</span>
                            </div>
                            <input type="range" min={-10} max={40} value={worldTemp}
                                onChange={e => setWorldTemp(Number(e.target.value))}
                                className="w-full accent-violet-500 cursor-pointer" />
                            <div className="text-[9px] text-gray-600 mt-1">
                                {worldTemp < 0 ? '❄️ Freezing' : worldTemp < 15 ? '🌥 Cold' : worldTemp < 28 ? '☀️ Pleasant' : '🔥 Scorching'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-400 mb-2">🎭 Broadcast Vibe</div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-1 bg-emerald-900 border border-emerald-600 text-emerald-400 text-[10px] rounded hover:bg-emerald-800 transition"
                                    onClick={() => setChatMessages(m => [...m, { role: 'npc', text: '✨ A wave of positivity spreads through the city!' }])}>
                                    ✨ Positive
                                </button>
                                <button className="flex-1 py-1 bg-rose-900 border border-rose-600 text-rose-400 text-[10px] rounded hover:bg-rose-800 transition"
                                    onClick={() => setChatMessages(m => [...m, { role: 'npc', text: '💀 Chaos energy ripples through the streets...' }])}>
                                    💀 Chaos
                                </button>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-400 mb-1">📡 Quick Select</div>
                            {DEMO_AGENTS.map(a => (
                                <button key={a.agentId}
                                    onClick={() => { setSelectedAgent(a); setChatMessages([{ role: 'npc', text: `Hey, I'm the ${a.role}. ${a.defaultTask}` }]); }}
                                    className="w-full flex items-center gap-2 text-[9px] hover:bg-white/5 rounded px-1 py-0.5 transition text-left">
                                    <span>{a.emoji}</span>
                                    <span className="text-gray-400 truncate" style={{ color: a.color }}>{a.role}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Chat Panel */}
            {selectedAgent && (
                <div className="absolute left-4 bottom-16 z-30 w-80">
                    <div className="bg-gray-950/97 backdrop-blur border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-black/60">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">{selectedAgent.emoji}</span>
                                <div>
                                    <div className="font-bold text-xs" style={{ color: selectedAgent.color }}>{selectedAgent.role}</div>
                                    <div className="text-[9px] text-gray-500">
                                        Vibe: <span style={{ color: selectedAgent.sentimentScore > 0 ? '#22c55e' : '#ef4444' }}>
                                            {selectedAgent.sentimentScore.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAgent(null)} className="text-gray-600 hover:text-white text-base">✕</button>
                        </div>
                        <div className="h-52 overflow-y-auto p-3 space-y-2">
                            {chatMessages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {isSending && (
                                <div className="flex justify-start">
                                    <div className="bg-gray-800 rounded-xl px-3 py-1.5 text-[10px] text-gray-400 font-mono animate-pulse">
                                        {selectedAgent.emoji} thinking...
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-2 border-t border-gray-800 flex gap-2">
                            <input type="text" value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder={`Talk to the ${selectedAgent.role.split(' ')[0]}...`}
                                autoFocus
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-sky-500 transition" />
                            <button onClick={sendMessage} disabled={isSending}
                                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
