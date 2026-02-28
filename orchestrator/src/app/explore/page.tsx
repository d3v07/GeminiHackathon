'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

// Role → emoji + color
function getAgentEmoji(role: string): { emoji: string; color: string } {
    const map: Record<string, { emoji: string; color: string }> = {
        'Underground Historian': { emoji: '🧐', color: '#8b5cf6' },
        '1920s Prohibition Ghost': { emoji: '👻', color: '#6b7280' },
        'Stressed Wall Street Broker': { emoji: '💼', color: '#f59e0b' },
        'Harlem Jazz Musician': { emoji: '🎷', color: '#3b82f6' },
        'Brooklyn Tech Startup Founder': { emoji: '🚀', color: '#10b981' },
        'Chinatown Restaurant Owner': { emoji: '🍜', color: '#ef4444' },
        'Central Park Dog Walker': { emoji: '🐕', color: '#84cc16' },
        'Times Square Street Performer': { emoji: '🎭', color: '#f43f5e' },
        'Rogue AI Terminal': { emoji: '🤖', color: '#06b6d4' },
        'Time-Displaced Tourist 1985': { emoji: '📸', color: '#a78bfa' },
        'Aggressively Positive Yoga Instructor': { emoji: '🧘', color: '#34d399' },
        'Late Night Slice Critic': { emoji: '🍕', color: '#fb923c' },
        'Grumbling Sanitation Worker': { emoji: '🗑️', color: '#78716c' },
        'High Society Socialite': { emoji: '💅', color: '#e879f9' },
        'Undercover Pigeon Informant': { emoji: '🐦', color: '#a3a3a3' },
    };
    for (const [key, val] of Object.entries(map)) {
        if (role.includes(key.split(' ')[0])) return val;
    }
    return { emoji: '🧍', color: '#60a5fa' };
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
export default function ExplorePage() {
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());

    const [agents, setAgents] = useState<Agent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [godMode, setGodMode] = useState(false);
    const [worldTemp, setWorldTemp] = useState(20);
    const [globalMood, setGlobalMood] = useState(0);
    const [mapsLoaded, setMapsLoaded] = useState(false);

    // Load Google Maps
    useEffect(() => {
        if (window.google?.maps) { setMapsLoaded(true); return; }
        const existingScript = document.getElementById('gmaps-loader');
        if (existingScript) { existingScript.addEventListener('load', () => setMapsLoaded(true)); return; }

        const script = document.createElement('script');
        script.id = 'gmaps-loader';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=maps,marker&v=beta`;
        script.async = true;
        script.defer = true;
        script.onload = () => setMapsLoaded(true);
        document.head.appendChild(script);
    }, []);

    // Initialize the Google Map once loaded
    useEffect(() => {
        if (!mapsLoaded || !mapRef.current || googleMapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
            center: { lat: 40.758, lng: -73.9855 }, // Times Square
            zoom: 18,
            tilt: 67.5,                              // Maximum tilt – real 3D buildings
            heading: -30,
            mapId: 'DEMO_MAP_ID',                    // Required for AdvancedMarker & 3D
            mapTypeId: 'roadmap',
            disableDefaultUI: false,
            gestureHandling: 'greedy',
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            styles: [
                { elementType: "geometry", stylers: [{ color: "#0f1923" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
                { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
                { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
                { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
                { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#143b55" }] },
            ],
        });

        googleMapRef.current = map;

        // 3D buildings are automatically rendered via the tilt + mapId combination

    }, [mapsLoaded]);

    // Fetch agents every 5s
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

    // Place/update markers whenever agents or map changes
    useEffect(() => {
        if (!googleMapRef.current || !mapsLoaded || !window.google?.maps?.marker) return;

        const map = googleMapRef.current;

        // Remove stale markers
        markersRef.current.forEach((marker, id) => {
            if (!agents.find(a => a.agentId === id)) {
                marker.map = null;
                markersRef.current.delete(id);
            }
        });

        agents.forEach(agent => {
            const { emoji, color } = getAgentEmoji(agent.role);
            const sentiment = agent.sentimentScore || 0;
            const ringColor = sentiment > 0.1 ? '#22c55e' : sentiment < -0.1 ? '#ef4444' : '#f59e0b';

            const content = document.createElement('div');
            content.style.cssText = `
                display: flex; flex-direction: column; align-items: center; cursor: pointer;
                filter: drop-shadow(0 0 8px ${color}88);
                transform-origin: bottom center;
                transition: transform 0.2s;
            `;
            content.innerHTML = `
                <div style="
                    background: rgba(0,0,0,0.85);
                    border: 2px solid ${ringColor};
                    border-radius: 50%;
                    width: 38px; height: 38px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 20px;
                    box-shadow: 0 0 12px ${ringColor}99, inset 0 0 8px rgba(0,0,0,0.5);
                ">${emoji}</div>
                <div style="
                    width: 2px; height: 12px;
                    background: linear-gradient(to bottom, ${ringColor}, transparent);
                "></div>
                <div style="
                    background: rgba(0,0,0,0.8);
                    color: ${color};
                    font-size: 9px;
                    font-family: monospace;
                    font-weight: bold;
                    padding: 2px 6px;
                    border-radius: 4px;
                    border: 1px solid ${color}66;
                    white-space: nowrap;
                    max-width: 100px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                ">${agent.role.split(' ').slice(0, 2).join(' ')}</div>
            `;
            content.addEventListener('mouseenter', () => { content.style.transform = 'scale(1.2)'; });
            content.addEventListener('mouseleave', () => { content.style.transform = 'scale(1)'; });
            content.addEventListener('click', () => {
                setSelectedAgent(agent);
                setChatMessages([{ role: 'npc', text: `Hey, I'm the ${agent.role}. ${agent.defaultTask || 'Just passing through...'}` }]);
                map.panTo({ lat: agent.lat, lng: agent.lng });
            });

            const existing = markersRef.current.get(agent.agentId);
            if (existing) {
                existing.position = { lat: agent.lat, lng: agent.lng };
                existing.content = content;
            } else {
                const marker = new google.maps.marker.AdvancedMarkerElement({
                    map,
                    position: { lat: agent.lat, lng: agent.lng },
                    content,
                    title: agent.role,
                });
                markersRef.current.set(agent.agentId, marker);
            }
        });
    }, [agents, mapsLoaded]);

    // Send a chat message
    const sendMessage = async () => {
        if (!inputText.trim() || !selectedAgent || isSending) return;
        const userText = inputText.trim();
        setInputText('');
        const newUserMsg: ChatMessage = { role: 'user', text: userText };
        setChatMessages(prev => [...prev, newUserMsg]);
        setIsSending(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentRole: selectedAgent.role,
                    userMessage: userText,
                    conversationHistory: [...chatMessages, newUserMsg],
                    agentSentiment: selectedAgent.sentimentScore || 0,
                    agentTask: selectedAgent.defaultTask,
                })
            });
            const data = await res.json();
            setChatMessages(prev => [...prev, { role: 'npc', text: data.reply }]);
        } catch {
            setChatMessages(prev => [...prev, { role: 'npc', text: `*${selectedAgent.role} disappears into the crowd...*` }]);
        } finally {
            setIsSending(false);
        }
    };

    const moodColor = globalMood > 0.1 ? 'text-emerald-400' : globalMood < -0.1 ? 'text-rose-400' : 'text-amber-400';
    const { emoji: selEmoji, color: selColor } = selectedAgent ? getAgentEmoji(selectedAgent.role) : { emoji: '🧍', color: '#60a5fa' };

    return (
        <div className="w-full h-screen bg-black relative overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* 3D Google Map */}
            <div ref={mapRef} className="absolute inset-0 w-full h-full" />

            {/* Loading overlay */}
            {!mapsLoaded && (
                <div className="absolute inset-0 bg-black flex items-center justify-center z-50">
                    <div className="text-center">
                        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <div className="text-gray-400 font-mono text-sm">Loading 3D City...</div>
                    </div>
                </div>
            )}

            {/* Top HUD */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 pointer-events-none">
                <div className="bg-black/80 backdrop-blur border border-gray-800 rounded-xl px-4 py-2">
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">PROJECT METROPOLIS</div>
                    <div className="text-xs text-gray-300 font-mono">3D EXPLORE MODE • TIMES SQUARE, NYC</div>
                </div>
                <div className="flex gap-3 pointer-events-auto">
                    <div className="bg-black/80 backdrop-blur border border-gray-800 rounded-xl px-4 py-2 text-center">
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest">Entities</div>
                        <div className="text-lg font-black text-white font-mono">{agents.length}</div>
                    </div>
                    <div className="bg-black/80 backdrop-blur border border-gray-800 rounded-xl px-4 py-2 text-center">
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest">Global Mood</div>
                        <div className={`text-lg font-black font-mono ${moodColor}`}>
                            {globalMood > 0 ? '+' : ''}{globalMood.toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hint */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="bg-black/80 backdrop-blur border border-gray-700 rounded-full px-6 py-2 text-[11px] text-gray-400 tracking-wider">
                    🗺 Drag to explore • Click an agent emoji to talk
                </div>
            </div>

            {/* God Mode Panel */}
            <div className="absolute right-4 top-20 z-30">
                <button
                    onClick={() => setGodMode(g => !g)}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${godMode ? 'bg-violet-600 border-violet-400 text-white' : 'bg-black/80 border-gray-700 text-gray-400 hover:border-violet-500'}`}
                >
                    ⚡ God Mode
                </button>

                {godMode && (
                    <div className="mt-2 bg-black/95 backdrop-blur border border-violet-800 rounded-xl p-4 w-56 space-y-4">
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
                                {worldTemp < 0 ? '❄️ Freezing' : worldTemp < 15 ? '🌥 Cold' : worldTemp < 28 ? '☀️ Pleasant' : '🔥 Scorching'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-400 mb-2">🎭 Force Global Vibe</div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-1 bg-emerald-900 border border-emerald-600 text-emerald-400 text-[10px] rounded hover:bg-emerald-800 transition"
                                    onClick={async () => {
                                        for (const a of agents.slice(0, 3)) {
                                            await fetch('/api/orchestrator', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ agentId: a.agentId, lat: a.lat, lng: a.lng, defaultTask: 'Spread joy and positivity!' })
                                            }).catch(() => { });
                                        }
                                    }}>✨ Positive</button>
                                <button className="flex-1 py-1 bg-rose-900 border border-rose-600 text-rose-400 text-[10px] rounded hover:bg-rose-800 transition"
                                    onClick={async () => {
                                        for (const a of agents.slice(0, 3)) {
                                            await fetch('/api/orchestrator', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ agentId: a.agentId, lat: a.lat, lng: a.lng, defaultTask: 'Something terrible just happened nearby.' })
                                            }).catch(() => { });
                                        }
                                    }}>💀 Chaos</button>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-400 mb-2">📡 Active Agents</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {agents.slice(0, 10).map(a => {
                                    const { emoji, color } = getAgentEmoji(a.role);
                                    return (
                                        <button key={a.agentId} onClick={() => {
                                            setSelectedAgent(a);
                                            setChatMessages([{ role: 'npc', text: `Hey, I'm the ${a.role}.` }]);
                                            googleMapRef.current?.panTo({ lat: a.lat, lng: a.lng });
                                        }} className="w-full flex items-center gap-2 text-[9px] hover:bg-white/5 rounded px-1 py-0.5 transition text-left">
                                            <span style={{ color }}>{emoji}</span>
                                            <span className="text-gray-400 truncate">{a.role}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Chat Panel */}
            {selectedAgent && (
                <div className="absolute left-4 bottom-16 z-30 w-80">
                    <div className="bg-gray-950/95 backdrop-blur border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-black/60">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">{selEmoji}</span>
                                <div>
                                    <div className="text-white font-bold text-xs" style={{ color: selColor }}>{selectedAgent.role}</div>
                                    <div className="text-[9px] text-gray-500">
                                        Vibe: <span className={selectedAgent.sentimentScore > 0 ? 'text-emerald-400' : selectedAgent.sentimentScore < 0 ? 'text-rose-400' : 'text-amber-400'}>
                                            {(selectedAgent.sentimentScore || 0).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAgent(null)} className="text-gray-600 hover:text-white text-lg leading-none">✕</button>
                        </div>

                        <div className="h-48 overflow-y-auto p-3 space-y-2">
                            {chatMessages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs ${msg.role === 'user' ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {isSending && (
                                <div className="flex justify-start">
                                    <div className="bg-gray-800 rounded-xl px-3 py-1.5 text-gray-400 text-[10px] font-mono animate-pulse">typing...</div>
                                </div>
                            )}
                        </div>

                        <div className="p-2 border-t border-gray-800 flex gap-2">
                            <input
                                type="text" value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder="Shift their vibe..."
                                autoFocus
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-sky-500 transition"
                            />
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
