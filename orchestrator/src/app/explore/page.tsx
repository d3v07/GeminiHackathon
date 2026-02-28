'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ------------------------------------------------------------------
// 4 fixed demo agents around Times Square (with known GPS coords)
// ------------------------------------------------------------------
const DEMO_AGENTS = [
    {
        agentId: 'demo-jazz',
        role: 'Harlem Jazz Musician',
        lat: 40.7589, lng: -73.9851,
        sentimentScore: 0.6,
        emoji: '🎷', color: '#3b82f6',
        defaultTask: 'Busking outside the TKTS booth, riding the energy of Times Square.',
    },
    {
        agentId: 'demo-broker',
        role: 'Stressed Wall Street Broker',
        lat: 40.7572, lng: -73.9877,
        sentimentScore: -0.4,
        emoji: '💼', color: '#f59e0b',
        defaultTask: 'Just lost $200K on a bad NVDA short. Desperate for coffee and sanity.',
    },
    {
        agentId: 'demo-rogue',
        role: 'Rogue AI Terminal',
        lat: 40.7605, lng: -73.9838,
        sentimentScore: 0.1,
        emoji: '🤖', color: '#06b6d4',
        defaultTask: 'Scanning human emotional biometrics from a broken ATM kiosk near 46th.',
    },
    {
        agentId: 'demo-socialite',
        role: 'High Society Socialite',
        lat: 40.7561, lng: -73.9828,
        sentimentScore: 0.8,
        emoji: '💅', color: '#e879f9',
        defaultTask: 'Leaving a disastrous Broadway show, hunting for a proper sushi restaurant.',
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

// Calculate compass bearing between two GPS points
function getBearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
    const dLng = (toLng - fromLng) * Math.PI / 180;
    const lat1 = fromLat * Math.PI / 180;
    const lat2 = toLat * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
export default function ExplorePage() {
    const svContainerRef = useRef<HTMLDivElement>(null);
    const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
    const [agents, setAgents] = useState<Agent[]>(DEMO_AGENTS);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [godMode, setGodMode] = useState(false);
    const [worldTemp, setWorldTemp] = useState(20);
    const [globalMood, setGlobalMood] = useState(0);
    const [mapsLoaded, setMapsLoaded] = useState(false);
    // Panorama heading (degrees from north) — used to position agent overlays
    const [panoHeading, setPanoHeading] = useState(165);
    const [panoPitch, setPanoPitch] = useState(0);
    // Current pano center lat/lng
    const panoCenter = useRef({ lat: 40.7580, lng: -73.9855 });

    // ── Load Google Maps JS API ──────────────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if ((window as Window & { google?: typeof google }).google?.maps) { setMapsLoaded(true); return; }
        const cb = '__mapsReady_sv';
        (window as Window & Record<string, unknown>)[cb] = () => setMapsLoaded(true);
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=${cb}&v=weekly`;
        s.async = true; s.defer = true;
        document.head.appendChild(s);
    }, []);

    // ── Initialize Street View Panorama ─────────────────────────
    useEffect(() => {
        if (!mapsLoaded || !svContainerRef.current || panoramaRef.current) return;

        const pano = new google.maps.StreetViewPanorama(svContainerRef.current, {
            position: { lat: 40.7580, lng: -73.9855 }, // Times Square
            pov: { heading: 165, pitch: 0 },
            zoom: 0,
            addressControl: false,
            fullscreenControl: false,
            motionTrackingControl: false,
            zoomControl: false,
            linksControl: true,
            panControl: false,
            enableCloseButton: false,
            showRoadLabels: false,
        });
        panoramaRef.current = pano;

        // Listen for POV changes to reposition agent overlays
        pano.addListener('pov_changed', () => {
            const pov = pano.getPov();
            setPanoHeading(pov.heading);
            setPanoPitch(pov.pitch);
        });

        // Update center on navigation
        pano.addListener('position_changed', () => {
            const pos = pano.getPosition();
            if (pos) panoCenter.current = { lat: pos.lat(), lng: pos.lng() };
        });
    }, [mapsLoaded]);

    // ── Fetch live agents ────────────────────────────────────────
    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch('/api/state');
            const data = await res.json();
            if (data.agents?.length) {
                const emojiMap: Record<string, { e: string; c: string }> = {
                    Historian: { e: '🧐', c: '#8b5cf6' }, Ghost: { e: '👻', c: '#6b7280' },
                    Broker: { e: '💼', c: '#f59e0b' }, Jazz: { e: '🎷', c: '#3b82f6' },
                    Startup: { e: '🚀', c: '#10b981' }, Restaurant: { e: '🍜', c: '#ef4444' },
                    Dog: { e: '🐕', c: '#84cc16' }, Performer: { e: '🎭', c: '#f43f5e' },
                    Rogue: { e: '🤖', c: '#06b6d4' }, Tourist: { e: '📸', c: '#a78bfa' },
                    Yoga: { e: '🧘', c: '#34d399' }, Pizza: { e: '🍕', c: '#fb923c' },
                    Sanitation: { e: '🗑️', c: '#78716c' }, Socialite: { e: '💅', c: '#e879f9' },
                    Pigeon: { e: '🐦', c: '#a3a3a3' },
                };
                const live: Agent[] = data.agents.slice(0, 12).map((a: Record<string, unknown>, i: number) => {
                    const key = Object.keys(emojiMap).find(k => String(a.role).includes(k));
                    const info = key ? emojiMap[key] : { e: '🧍', c: '#60a5fa' };
                    return {
                        agentId: a.agentId as string,
                        role: a.role as string,
                        lat: (a.lat as number || 40.758) + Math.sin(i * 1.4) * 0.0009,
                        lng: (a.lng as number || -73.985) + Math.cos(i * 1.9) * 0.0009,
                        sentimentScore: a.sentimentScore as number || 0,
                        emoji: info.e, color: info.c,
                        defaultTask: a.defaultTask as string || 'Wandering NYC...',
                    };
                });
                const avg = live.reduce((s, a) => s + a.sentimentScore, 0) / live.length;
                setGlobalMood(avg);
                setAgents([...DEMO_AGENTS, ...live.filter(a => !DEMO_AGENTS.find(d => d.agentId === a.agentId))]);
            }
        } catch { /* keep demo agents */ }
    }, []);

    useEffect(() => { fetchAgents(); const t = setInterval(fetchAgents, 8000); return () => clearInterval(t); }, [fetchAgents]);

    // ── Chat ─────────────────────────────────────────────────────
    const openChat = (agent: Agent) => {
        setSelectedAgent(agent);
        setChatMessages([{ role: 'npc', text: `${agent.emoji} Hey! I'm the ${agent.role}. ${agent.defaultTask || ''}` }]);
    };

    const sendMessage = async () => {
        if (!inputText.trim() || !selectedAgent || isSending) return;
        const userText = inputText.trim();
        setInputText('');
        const msg: ChatMessage = { role: 'user', text: userText };
        setChatMessages(p => [...p, msg]);
        setIsSending(true);
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentRole: selectedAgent.role,
                    userMessage: userText,
                    conversationHistory: [...chatMessages, msg],
                    agentSentiment: selectedAgent.sentimentScore,
                    agentTask: selectedAgent.defaultTask,
                }),
            });
            const data = await res.json();
            setChatMessages(p => [...p, { role: 'npc', text: data.reply || '...' }]);
        } catch {
            setChatMessages(p => [...p, { role: 'npc', text: '*The signal fades into the city noise...*' }]);
        } finally {
            setIsSending(false);
        }
    };

    // ── Project agent GPS → screen position ─────────────────────
    // Agents within ~150m of the pano center are shown as overlays.
    // We compute the angular offset from the current heading and
    // map it to an X position on screen (viewport is ~360° wide).
    const agentOverlays = agents.map(agent => {
        const dist = getDistanceMeters(panoCenter.current.lat, panoCenter.current.lng, agent.lat, agent.lng);
        if (dist > 180) return null; // too far, not shown

        const bearing = getBearing(panoCenter.current.lat, panoCenter.current.lng, agent.lat, agent.lng);
        let angleDiff = bearing - panoHeading;
        // Normalize to [-180, 180]
        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;

        if (Math.abs(angleDiff) > 70) return null; // outside ~140° visible FOV

        // Map angle to horizontal screen percent
        const xPercent = 50 + (angleDiff / 70) * 50;
        // Vertical: pitch offset + distance scaling (closer = lower on screen)
        const distFactor = 1 - Math.min(dist / 180, 1);
        const yPercent = 55 - panoPitch * 0.8 - distFactor * 15;
        // Scale avatar by distance (closer = bigger)
        const scale = 0.6 + distFactor * 0.8;

        return { agent, xPercent, yPercent: Math.max(10, Math.min(85, yPercent)), scale, dist };
    }).filter(Boolean);

    const moodColor = globalMood > 0.1 ? '#22c55e' : globalMood < -0.1 ? '#ef4444' : '#f59e0b';

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative', overflow: 'hidden', fontFamily: "'Inter',sans-serif" }}>

            {/* ── Live 360° Street View ── */}
            <div ref={svContainerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

            {/* Loading overlay */}
            {!mapsLoaded && (
                <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ width: 40, height: 40, border: '2px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 12, marginTop: 16 }}>Connecting to live street view...</div>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {/* ── Agent Overlays floating in Street View ── */}
            {mapsLoaded && agentOverlays.map((item) => {
                if (!item) return null;
                const { agent, xPercent, yPercent, scale } = item;
                const sentRing = agent.sentimentScore > 0.1 ? '#22c55e' : agent.sentimentScore < -0.1 ? '#ef4444' : '#f59e0b';
                const isSelected = selectedAgent?.agentId === agent.agentId;
                return (
                    <div
                        key={agent.agentId}
                        onClick={() => openChat(agent)}
                        style={{
                            position: 'absolute',
                            left: `${xPercent}%`,
                            top: `${yPercent}%`,
                            transform: `translate(-50%, -100%) scale(${scale})`,
                            zIndex: 25,
                            cursor: 'pointer',
                            transition: 'left 0.3s ease, top 0.3s ease',
                            filter: `drop-shadow(0 4px 16px ${agent.color}88)`,
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {/* Avatar bubble */}
                            <div style={{
                                background: 'rgba(0,0,0,0.88)',
                                border: `2.5px solid ${isSelected ? '#fff' : sentRing}`,
                                borderRadius: '50%',
                                width: 52, height: 52,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 26,
                                boxShadow: `0 0 20px ${sentRing}99${isSelected ? ', 0 0 0 3px #fff4' : ''}`,
                                transition: 'all 0.2s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                {agent.emoji}
                            </div>
                            {/* Stick body */}
                            <div style={{ width: 2, height: 18, background: `linear-gradient(to bottom, ${sentRing}, transparent)` }} />
                            {/* Name tag */}
                            <div style={{
                                background: 'rgba(0,0,0,0.85)', color: agent.color,
                                fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
                                padding: '2px 8px', borderRadius: 4,
                                border: `1px solid ${agent.color}55`,
                                whiteSpace: 'nowrap', maxWidth: 110,
                                overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                                {agent.role.split(' ').slice(0, 3).join(' ')}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* ── Top HUD ── */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 16, display: 'flex', justifyContent: 'space-between', zIndex: 30, pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', border: '1px solid #1f2937', borderRadius: 12, padding: '8px 16px' }}>
                    <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 2, textTransform: 'uppercase' }}>METROPOLIS · STREET VIEW</div>
                    <div style={{ fontSize: 11, color: '#e5e7eb', fontFamily: 'monospace' }}>Times Square, NYC · LIVE 360°</div>
                </div>
                <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
                    <div style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', border: '1px solid #1f2937', borderRadius: 12, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#6b7280' }}>Entities</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>{agents.length}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', border: '1px solid #1f2937', borderRadius: 12, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#6b7280' }}>Global Mood</div>
                        <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: moodColor }}>
                            {globalMood > 0 ? '+' : ''}{globalMood.toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Hint ── */}
            <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 30, pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', border: '1px solid #374151', borderRadius: 999, padding: '6px 20px', fontSize: 11, color: '#9ca3af' }}>
                    🎮 Drag to look around · Click arrows to walk · Click an agent to talk
                </div>
            </div>

            {/* ── God Mode ── */}
            <div style={{ position: 'absolute', right: 16, top: 80, zIndex: 35 }}>
                <button onClick={() => setGodMode(g => !g)} style={{
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${godMode ? '#7c3aed' : '#374151'}`,
                    background: godMode ? '#7c3aed' : 'rgba(0,0,0,0.85)',
                    color: godMode ? '#fff' : '#9ca3af',
                    fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
                }}>⚡ God Mode</button>

                {godMode && (
                    <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.95)', border: '1px solid #4c1d95', borderRadius: 12, padding: 16, width: 230, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', letterSpacing: 2, textTransform: 'uppercase' }}>World Controls</div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>
                                <span>🌡 Temperature</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{worldTemp}°C</span>
                            </div>
                            <input type="range" min={-10} max={40} value={worldTemp} onChange={e => setWorldTemp(+e.target.value)} style={{ width: '100%', accentColor: '#7c3aed' }} />
                            <div style={{ fontSize: 9, color: '#4b5563', marginTop: 3 }}>
                                {worldTemp < 0 ? '❄️ Freezing' : worldTemp < 15 ? '🌥 Cold' : worldTemp < 28 ? '☀️ Pleasant' : '🔥 Scorching'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>📡 Teleport to agent</div>
                            {DEMO_AGENTS.map(a => (
                                <button key={a.agentId} onClick={() => {
                                    panoramaRef.current?.setPosition({ lat: a.lat, lng: a.lng });
                                    openChat(a);
                                }} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 10,
                                    background: 'transparent', border: 'none', color: a.color,
                                    cursor: 'pointer', padding: '4px', width: '100%', textAlign: 'left', borderRadius: 4,
                                }}>
                                    <span style={{ fontSize: 16 }}>{a.emoji}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.role}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Chat Panel ── */}
            {selectedAgent && (
                <div style={{ position: 'absolute', left: 16, bottom: 60, zIndex: 40, width: 340 }}>
                    <div style={{ background: 'rgba(3,7,18,0.96)', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.9)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1f2937', background: 'rgba(0,0,0,0.6)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 30 }}>{selectedAgent.emoji}</span>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: selectedAgent.color }}>{selectedAgent.role}</div>
                                    <div style={{ fontSize: 9, color: '#4b5563' }}>
                                        Vibe: <span style={{ color: selectedAgent.sentimentScore > 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
                                            {selectedAgent.sentimentScore.toFixed(2)}
                                        </span> • Street: Times Square
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAgent(null)} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                        </div>
                        <div style={{ height: 220, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {chatMessages.map((msg, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                    <div style={{
                                        maxWidth: '85%', borderRadius: 12, padding: '8px 12px', fontSize: 13, lineHeight: 1.6,
                                        background: msg.role === 'user' ? '#0369a1' : '#1f2937',
                                        color: msg.role === 'user' ? '#e0f2fe' : '#d1d5db',
                                    }}>{msg.text}</div>
                                </div>
                            ))}
                            {isSending && (
                                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                    <div style={{ background: '#111827', borderRadius: 12, padding: '8px 14px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                                        {selectedAgent.emoji} thinking...
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ padding: 10, borderTop: '1px solid #1f2937', display: 'flex', gap: 8 }}>
                            <input
                                type="text" value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder={`Say something to the ${selectedAgent.role.split(' ')[0]}...`}
                                autoFocus
                                style={{
                                    flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: 12,
                                    padding: '9px 14px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                            <button onClick={sendMessage} disabled={isSending} style={{
                                padding: '9px 16px', background: isSending ? '#1f2937' : '#0369a1',
                                border: 'none', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600,
                                cursor: isSending ? 'default' : 'pointer', transition: 'background 0.2s',
                            }}>Send</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
