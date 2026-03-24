'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useToast } from '@/components/ToastContainer';
import { APIProvider, Map, AdvancedMarker, Pin, useApiIsLoaded } from '@vis.gl/react-google-maps';
import { useSimulation } from '@/lib/SimulationContext';
import dynamic from 'next/dynamic';
import ExploreMode from './ExploreMode';
import ShortcutModal from './ShortcutModal';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useAudioTTS } from '@/hooks/useAudioTTS';

const SocialGraph = dynamic(() => import('./SocialGraph'), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center text-indigo-500 font-mono animate-pulse bg-black">Initializing WebGL Surface...</div>
});

const NYC_CENTER = { lat: 40.7128, lng: -74.0060 };

interface Agent {
    id: string;
    lat: number;
    lng: number;
    isInteracting: boolean;
    sentimentScore?: number;
    role?: string;
}

const getAgentIcon = (role: string = '') => {
    const r = role.toLowerCase();
    if (r.includes('historian')) return '🏛️';
    if (r.includes('ghost')) return '👻';
    if (r.includes('broker')) return '📉';
    if (r.includes('musician')) return '🎷';
    if (r.includes('founder')) return '💻';
    if (r.includes('owner')) return '🍜';
    if (r.includes('walker')) return '🐕';
    if (r.includes('performer')) return '⭐';
    return '🤖';
};

const InteractiveStreetView = ({ lat, lng }: { lat: number, lng: number }) => {
    const apiIsLoaded = useApiIsLoaded();
    const ref = useRef<HTMLDivElement>(null);
    const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);

    useEffect(() => {
        if (!apiIsLoaded || !ref.current || !window.google?.maps?.StreetViewPanorama) return;

        panoRef.current = new window.google.maps.StreetViewPanorama(ref.current, {
            position: { lat, lng },
            pov: { heading: 100, pitch: 0 },
            zoom: 1,
            showRoadLabels: false,
            disableDefaultUI: true,
            panControl: true,
            zoomControl: true,
            linksControl: true,
            clickToGo: true,
            addressControl: false,
        });

        return () => {
            if (panoRef.current) {
                panoRef.current.setVisible(false);
                panoRef.current = null;
            }
        };
    }, [apiIsLoaded, lat, lng]);

    return <div ref={ref} className="w-full h-full transition-all duration-1000" />;
};

export default function MapUI() {
    const { agents, isLoading, error, connectionStatus } = useSimulation();
    const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
    const [detailedAgent, setDetailedAgent] = useState<any | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [commMessage, setCommMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [minSentiment, setMinSentiment] = useState(-1);
    const [maxSentiment, setMaxSentiment] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    
    // View Modes
    const [showSocialGraph, setShowSocialGraph] = useState(false);
    const [showExploreMode, setShowExploreMode] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Audio TTS config
    const [audioVolume, setAudioVolume] = useState(0.8);
    const { speak, currentSpeakerId } = useAudioTTS({ volume: audioVolume });

    // Controlled Map State
    const [mapCenter, setMapCenter] = useState(NYC_CENTER);

    useEffect(() => {
        const handleJump = (e: any) => {
            if (e.detail?.lat && e.detail?.lng) {
                setMapCenter({ lat: e.detail.lat, lng: e.detail.lng });
                // If in social graph, switch back to map view
                setShowSocialGraph(false);
                setShowExploreMode(false);
            }
        };
        window.addEventListener('map-jump', handleJump as EventListener);
        return () => window.removeEventListener('map-jump', handleJump as EventListener);
    }, []);

    // Global Actions
    const handleTogglePlay = async () => {
        try {
            const res = await fetch('/api/simulation/status');
            const data = await res.json();
            await fetch('/api/simulation/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: data.status === 'paused' ? 'resume' : 'pause' })
            });
        } catch (e) {
            console.error("Failed to toggle simulation status", e);
        }
    };

    useShortcuts({
        'Escape': () => setSelectedAgent(null),
        'e': () => { setShowExploreMode(prev => !prev); setShowSocialGraph(false); },
        'g': () => { setShowSocialGraph(prev => !prev); setShowExploreMode(false); },
        ' ': handleTogglePlay,
        'f': () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen();
            }
        },
        '?': () => setShowShortcuts(prev => !prev)
    });

    // Keep selectedAgent position in sync with latest data from context
    useEffect(() => {
        if (!selectedAgent) {
            setDetailedAgent(null);
            return;
        }
        const updated = agents.find((a: any) => a.id === selectedAgent.id);
        if (updated) setSelectedAgent(updated);
    }, [agents, selectedAgent?.id]);

    useEffect(() => {
        if (!selectedAgent) return;
        
        // Fetch deep details
        const fetchDetails = async () => {
            setIsDetailLoading(true);
            try {
                const res = await fetch(`/api/agents/${selectedAgent.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setDetailedAgent(data);
                }
            } catch (err) {
                console.error("Failed to fetch agent details:", err);
            } finally {
                setIsDetailLoading(false);
            }
        };

        fetchDetails();
    }, [selectedAgent?.id]);

    // TTS Auto-play logic
    const prevDialogRef = useRef<string | null>(null);
    useEffect(() => {
        if (selectedAgent && selectedAgent.lastEncounterDialogue !== prevDialogRef.current) {
            prevDialogRef.current = selectedAgent.lastEncounterDialogue;
            if (selectedAgent.lastEncounterDialogue && prevDialogRef.current) {
                // Pass agent role as voice mapping hint the backend might use
                speak(selectedAgent.lastEncounterDialogue, selectedAgent.id, selectedAgent.role);
            }
        }
    }, [selectedAgent?.lastEncounterDialogue, selectedAgent?.id, selectedAgent?.role, speak]);

    const getMoodColor = (score: number = 0) => {
        if (score > 0.3) return 'bg-emerald-500'; // Happy
        if (score < -0.3) return 'bg-rose-500';    // Stressed/Sad
        return 'bg-sky-500';                      // Neutral
    };

    const getMoodPing = (score: number = 0) => {
        if (score > 0.3) return 'bg-emerald-400';
        if (score < -0.3) return 'bg-rose-400';
        return 'bg-sky-400';
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!commMessage.trim() || !selectedAgent || isSending) return;

        setIsSending(true);
        const text = commMessage;
        setCommMessage('');

        try {
            const res = await fetch('/api/interact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: selectedAgent.id,
                    message: text,
                    role: selectedAgent.role
                })
            });
            if (!res.ok) throw new Error(`API returned ${res.status}`);
            const data = await res.json();
            success('Message transmitted to target proxy.');
        } catch (e: any) {
            console.error('Error sending message:', e);
            toastError(e.message || 'Transmission failed. Signal lost.');
        } finally {
            setIsSending(false);
        }
    };

    const filteredAgents = agents.filter(a => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!a.role?.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) return false;
        }
        const sentiment = a.sentimentScore || 0;
        if (sentiment < minSentiment || sentiment > maxSentiment) return false;
        return true;
    });

    return (
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
            <div className="w-full h-full relative border-r border-gray-800 bg-[#05070a] overflow-hidden flex">
                {/* Loading Overlay */}
                {isLoading && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05070a]/90 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest animate-pulse">Connecting to Firestore...</span>
                        </div>
                    </div>
                )}

                {/* Error Overlay */}
                {error && !isLoading && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05070a]/90 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-4 max-w-xs text-center">
                            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                                <span className="text-xl">⚡</span>
                            </div>
                            <p className="text-[12px] font-mono text-rose-400">{error}</p>
                            <span className="text-[10px] text-gray-600">Attempting to reconnect...</span>
                        </div>
                    </div>
                )}

                {/* Live Connection Status Indicators */}
                <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10 flex flex-col gap-2 md:gap-3 pointer-events-none">
                    <div className={`flex items-center gap-2 md:gap-3 bg-black/80 backdrop-blur-xl px-3 py-1.5 md:px-4 md:py-2 rounded border shadow-lg text-[10px] md:text-[11px] font-mono transition-colors duration-500 ${connectionStatus === 'connected'
                        ? 'border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)] text-emerald-400'
                        : connectionStatus === 'connecting'
                            ? 'border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)] text-amber-400'
                            : 'border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.2)] text-rose-400'
                        }`}>
                        <div className="relative flex h-2.5 w-2.5">
                            {connectionStatus !== 'disconnected' && (
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                                    }`}></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connectionStatus === 'connected' ? 'bg-emerald-500'
                                : connectionStatus === 'connecting' ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}></span>
                        </div>
                        <span>FIRESTORE: {connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}</span>
                    </div>
                    <div className={`flex items-center gap-2 md:gap-3 bg-black/80 backdrop-blur-xl px-3 py-1.5 md:px-4 md:py-2 rounded border shadow-lg text-[10px] md:text-[11px] font-mono transition-colors duration-500 ${connectionStatus === 'connected'
                        ? 'border-sky-500/40 shadow-[0_0_15px_rgba(14,165,233,0.2)] text-sky-400'
                        : 'border-gray-700 text-gray-600'
                        }`}>
                        <div className="relative flex h-2.5 w-2.5">
                            {connectionStatus === 'connected' && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connectionStatus === 'connected' ? 'bg-sky-500' : 'bg-gray-600'
                                }`}></span>
                        </div>
                        <span>NLP SENTIMENT: {connectionStatus === 'connected' ? 'ACTIVE' : 'STANDBY'}</span>
                    </div>
                </div>

                {/* Filter & View Controls Bar */}
                <div className="absolute top-4 right-4 md:top-6 md:right-6 z-10 flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setShowExploreMode(!showExploreMode); setShowSocialGraph(false); }}
                            className={`bg-black/80 backdrop-blur border px-3 py-1.5 rounded transition-colors font-mono text-xs shadow-lg flex items-center gap-2 ${showExploreMode ? 'border-amber-500 text-amber-400 font-bold' : 'border-gray-700 hover:border-amber-500/50 text-gray-400 hover:text-amber-400'}`}
                        >
                            {showExploreMode ? '👁 EXIT EXPLORE' : '🚶 EXPLORE'}
                        </button>
                        <button 
                            onClick={() => { setShowSocialGraph(!showSocialGraph); setShowExploreMode(false); }}
                            className={`bg-black/80 backdrop-blur border px-3 py-1.5 rounded transition-colors font-mono text-xs shadow-lg flex items-center gap-2 ${showSocialGraph ? 'border-indigo-500 text-indigo-400 font-bold' : 'border-gray-700 hover:border-indigo-500/50 text-gray-400 hover:text-indigo-400'}`}
                        >
                            {showSocialGraph ? '🌐 MAP VIEW' : '🕸 SOCIAL GRAPH'}
                        </button>
                        <button 
                            onClick={() => setShowShortcuts(true)}
                            className="bg-black/80 backdrop-blur border border-gray-700 hover:border-white/50 text-gray-400 hover:text-white px-2 py-1.5 rounded transition-colors font-mono text-xs shadow-lg"
                            title="Keyboard Shortcuts (?)"
                        >
                            ?
                        </button>
                        <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className="bg-black/80 backdrop-blur border border-gray-700 hover:border-sky-500/50 text-gray-400 hover:text-sky-400 px-3 py-1.5 rounded transition-colors font-mono text-xs shadow-lg flex items-center gap-2"
                        >
                            {showFilters ? '✕ CLOSE FILTERS' : '⚡ FILTERS'}
                            {(searchQuery || minSentiment !== -1 || maxSentiment !== 1) && <div className="w-2 h-2 rounded-full bg-sky-500"></div>}
                        </button>
                    </div>
                    
                    {showFilters && (
                        <div className="bg-black/90 backdrop-blur-xl border border-gray-700/80 rounded-lg p-4 shadow-2xl w-64 text-xs font-mono text-gray-300 flex flex-col gap-4 animate-in slide-in-from-top-2">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] uppercase tracking-widest text-sky-500 font-bold">Search Agents</label>
                                <input 
                                    type="text" 
                                    placeholder="Role or ID..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded px-2 py-1 focus:border-sky-500 outline-none w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold">Min Sentiment ({minSentiment})</label>
                                <input 
                                    type="range" min="-1" max="1" step="0.1" 
                                    value={minSentiment} 
                                    onChange={e => setMinSentiment(parseFloat(e.target.value))}
                                    className="accent-emerald-500"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] uppercase tracking-widest text-rose-500 font-bold">Max Sentiment ({maxSentiment})</label>
                                <input 
                                    type="range" min="-1" max="1" step="0.1" 
                                    value={maxSentiment} 
                                    onChange={e => setMaxSentiment(parseFloat(e.target.value))}
                                    className="accent-rose-500"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 mt-2 pt-3 border-t border-gray-800">
                                <label className="text-[9px] uppercase tracking-widest text-indigo-400 font-bold flex justify-between">
                                    <span>TTS Volume</span>
                                    <span>{Math.round(audioVolume * 100)}%</span>
                                </label>
                                <input 
                                    type="range" min="0" max="1" step="0.1" 
                                    value={audioVolume} 
                                    onChange={e => setAudioVolume(parseFloat(e.target.value))}
                                    className="accent-indigo-500"
                                />
                            </div>
                            <button 
                                onClick={() => { setSearchQuery(''); setMinSentiment(-1); setMaxSentiment(1); }}
                                className="mt-2 text-[9px] uppercase tracking-widest text-gray-500 hover:text-white border border-gray-800 rounded py-1 transition-colors"
                            >
                                Reset Filters
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 relative">
                    {showExploreMode ? (
                        <div className="w-full h-full bg-black">
                            <ExploreMode 
                                initialLat={selectedAgent ? Number(selectedAgent.lat) : NYC_CENTER.lat}
                                initialLng={selectedAgent ? Number(selectedAgent.lng) : NYC_CENTER.lng}
                                agents={filteredAgents}
                                onAgentNear={(agent) => setSelectedAgent(agent)}
                            />
                        </div>
                    ) : showSocialGraph ? (
                        <div className="w-full h-full bg-black">
                            <SocialGraph onNodeClick={(id) => {
                                const agent = agents.find(a => a.id === id);
                                if (agent) setSelectedAgent(agent);
                            }} />
                        </div>
                    ) : (
                        <Map
                            defaultZoom={14}
                            center={mapCenter}
                            onCenterChanged={(e) => setMapCenter(e.detail.center)}
                            mapId="e8c5dcfe877a5b6d"
                            disableDefaultUI={true}
                            style={{ width: '100%', height: '100%', filter: 'contrast(1.25) brightness(0.8) saturate(1.4)' }}
                        >
                            {filteredAgents.map((agent) => (
                                <AdvancedMarker
                                    key={agent.id}
                                    position={{ lat: Number(agent.lat), lng: Number(agent.lng) }}
                                    onClick={() => setSelectedAgent(agent)}
                                    zIndex={agent.isInteracting ? 100 : 1}
                                >
                                    <div className={`group relative w-12 h-12 flex items-center justify-center transition-all duration-[800ms] cursor-pointer ${agent.isInteracting ? 'scale-150' : 'hover:scale-125'}`}>
                                        {/* Outer Pulse glow */}
                                        <div className={`absolute -inset-4 rounded-full blur-xl opacity-50 mix-blend-screen transition-colors duration-1000 ${getMoodColor(agent.sentimentScore)}`}></div>

                                        {/* Radar Ripple */}
                                        <div className={`absolute w-full h-full rounded-full border border-white/20 scale-150 animate-ping opacity-30 ${getMoodColor(agent.sentimentScore)}`}></div>

                                        {/* Central Node */}
                                        <div className={`relative w-8 h-8 rounded-full border-2 ${agent.isInteracting ? 'border-white bg-white/20' : 'border-white/80'} shadow-[0_0_20px_rgba(255,255,255,0.4)] ${!agent.isInteracting && getMoodColor(agent.sentimentScore)} flex items-center justify-center text-lg`}>
                                            {agent.isInteracting && <div className="absolute -inset-2 border-2 tracking-wider animate-spin border-rose-500 rounded-full border-t-transparent"></div>}
                                            {getAgentIcon(agent.role)}
                                            {currentSpeakerId === agent.id && (
                                                <div className="absolute -top-3 -right-3 text-[14px] animate-bounce filter drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] z-50">
                                                    🔊
                                                </div>
                                            )}
                                        </div>

                                        {/* Hover info tooltip */}
                                        <div className="absolute top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 backdrop-blur px-3 py-1.5 rounded border border-gray-800 text-[9px] font-mono text-white whitespace-nowrap shadow-xl pointer-events-none z-50">
                                            ID: {agent.id.substring(0, 8)}<br />
                                            STATE: {agent.isInteracting ? 'INTERACTING' : 'IDLE'}
                                        </div>
                                    </div>
                                </AdvancedMarker>
                            ))}
                        </Map>
                    )}
                </div>

                {/* NPC DETAIL PANEL */}
                {selectedAgent && (
                    <div className="fixed md:relative inset-x-0 bottom-0 md:inset-auto w-full md:w-96 h-[85vh] md:h-full bg-gradient-to-b from-[#0a0a0f] to-[#040406] md:border-l border-t md:border-t-0 border-gray-800 p-4 md:p-8 flex flex-col overflow-y-auto z-[60] shadow-[0_-20px_50px_rgba(0,0,0,0.8)] md:shadow-2xl animate-in slide-in-from-bottom md:slide-in-from-right duration-500 ease-out rounded-t-2xl md:rounded-none">
                        {/* Mobile Swipe Handle */}
                        <div className="w-full flex justify-center pb-4 md:hidden" onClick={() => setSelectedAgent(null)}>
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full"></div>
                        </div>

                        <button onClick={() => setSelectedAgent(null)} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-all hidden md:flex">✕</button>

                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-[0.3em]">Autonomous Node</span>
                            </div>
                            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500 mt-1 uppercase tracking-tighter">{selectedAgent.role || 'Ghost Entity'}</h2>
                            <div className="px-2 py-0.5 mt-2 inline-block rounded bg-gray-900 border border-gray-800">
                                <p className="text-[10px] font-mono text-gray-400">UUID: {selectedAgent.id}</p>
                            </div>
                        </div>

                        {/* Live Street View Panorama Preview */}
                        <div className="mb-8 rounded-xl overflow-hidden border border-gray-800/80 aspect-[16/10] bg-[#050505] group relative shadow-inner">
                            <InteractiveStreetView lat={Number(selectedAgent.lat)} lng={Number(selectedAgent.lng)} />

                            <div className="absolute inset-0 border border-white/5 rounded-xl pointer-events-none"></div>
                            <div className="absolute top-3 left-3 bg-black/80 backdrop-blur px-2.5 py-1.5 rounded border border-rose-500/30 text-[9px] font-mono text-white flex items-center gap-2 shadow-lg pointer-events-none">
                                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
                                LIVE_360_PANORAMA
                            </div>
                            <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur px-2 py-1 rounded border border-gray-700/50 text-[8px] font-mono text-gray-400 pointer-events-none">
                                {Number(selectedAgent.lat).toFixed(4)}, {Number(selectedAgent.lng).toFixed(4)}
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div>
                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                    Current Cognitive Goal
                                </span>
                                <div className="bg-gradient-to-br from-gray-900 to-black rounded-lg p-5 border border-gray-800 shadow-inner">
                                    <p className="text-[13px] text-gray-300 italic leading-relaxed font-serif">"{selectedAgent.defaultTask || 'Awaiting instruction from orchestrator...'}"</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-gray-900/40 rounded-lg p-4 border border-gray-800/60 transition-colors duration-500">
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] block mb-3">NLP Sentiment</span>
                                    <div className="h-1.5 bg-gray-950 rounded-full overflow-hidden relative shadow-inner">
                                        <div
                                            className={`absolute left-0 top-0 h-full transition-all duration-1000 ${getMoodColor(selectedAgent.sentimentScore)}`}
                                            style={{ width: `${Math.max(0, Math.min(100, (selectedAgent.sentimentScore + 1) * 50))}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between mt-2 font-mono text-[9px] text-gray-600">
                                        <span>-1.0</span>
                                        <span>{(selectedAgent.sentimentScore || 0).toFixed(2)}</span>
                                        <span>+1.0</span>
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] block mb-3">Engine Status</span>
                                    <div className={`flex-1 flex items-center justify-center font-bold px-3 py-2 rounded-lg border text-center transition-all duration-500 shadow-lg
                                    ${selectedAgent.isInteracting
                                            ? 'border-rose-500/30 text-rose-400 bg-gradient-to-br from-rose-500/10 to-transparent'
                                            : 'border-emerald-500/30 text-emerald-400 bg-gradient-to-br from-emerald-500/10 to-transparent'}`}>
                                        {selectedAgent.isInteracting ? (
                                            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></div>COLLISION</div>
                                        ) : (
                                            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>ROAMING</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedAgent.lastEncounterDialogue && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <span className="text-[9px] font-bold text-sky-500/80 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        Last Interaction
                                    </span>
                                    <div className="bg-gradient-to-br from-sky-500/10 to-transparent border border-sky-500/20 rounded-lg p-5">
                                        <p className="text-[12px] text-sky-100/90 font-mono italic leading-relaxed">"{selectedAgent.lastEncounterDialogue}"</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Deep Details from `/api/agents/:id` */}
                        {isDetailLoading && (
                            <div className="mt-6 flex justify-center py-4">
                                <span className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span>
                            </div>
                        )}

                        {!isDetailLoading && detailedAgent && detailedAgent.memorySnippets && (
                            <div className="mt-6 space-y-6 animate-in fade-in duration-500">
                                {/* Relationships */}
                                {detailedAgent.relationships && detailedAgent.relationships.length > 0 && (
                                    <div>
                                        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                            Social Graph Matrix
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {detailedAgent.relationships.map((rel: any, i: number) => (
                                                <div key={i} className={`border px-2 py-1 rounded text-[9px] font-mono shadow-sm ${rel.type === 'friend' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : rel.type === 'rival' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-gray-800/50 border-gray-700 text-gray-400'}`}>
                                                    {rel.target.substring(0, 12)}...
                                                    <span className="ml-1 uppercase opacity-60">[{rel.type}]</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Memory Snippets */}
                                {detailedAgent.memorySnippets.length > 0 && (
                                    <div>
                                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                            Fragmented Memories
                                        </span>
                                        <div className="flex flex-col gap-2">
                                            {detailedAgent.memorySnippets.map((mem: string, i: number) => (
                                                <div key={i} className="bg-gray-900/40 rounded p-3 border border-gray-800 border-l-2 border-l-indigo-500 text-[10px] text-gray-300 font-mono tracking-tight leading-relaxed shadow-inner truncate hover:whitespace-normal transition-all" title={mem}>
                                                    &gt; {mem}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Recent Encounters Preview */}
                                {detailedAgent.recentEncounters && detailedAgent.recentEncounters.length > 0 && (
                                    <div>
                                        <span className="text-[9px] font-bold text-cyan-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                            Comm-Link Archives
                                        </span>
                                        <div className="flex flex-col gap-2 relative">
                                            <div className="absolute left-1 top-2 bottom-2 w-px bg-cyan-500/20"></div>
                                            {detailedAgent.recentEncounters.map((enc: any, i: number) => (
                                                <div key={i} className="pl-6 relative">
                                                    <div className="absolute left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                                                    <p className="text-[10px] text-gray-400 font-mono truncate hover:whitespace-normal cursor-pointer bg-black/40 hover:bg-black/60 rounded px-2 py-1 border border-transparent hover:border-cyan-500/30 transition-colors">
                                                        "{enc.transcript?.substring(0, 50)}..."
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer Stats block */}
                        <div className="mt-8">
                            <div className="bg-black/40 rounded border border-gray-900 p-3 grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[8px] text-gray-600 uppercase tracking-widest">Last State Sync</span>
                                    <span className="text-[10px] font-mono text-gray-400">{new Date(selectedAgent.lastUpdated).toLocaleTimeString()}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[8px] text-gray-600 uppercase tracking-widest">Temporal Link</span>
                                    <span className="text-[10px] font-mono text-emerald-500">CONNECTED</span>
                                </div>
                            </div>
                        </div>

                        {/* Comm-Link Chat Feature */}
                        <div className="mt-auto pt-6">
                            <span className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                User Comm-Link
                            </span>
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <input
                                    type="text"
                                    value={commMessage}
                                    onChange={(e) => setCommMessage(e.target.value)}
                                    disabled={isSending}
                                    placeholder="Type a message to influence sentiment..."
                                    className="flex-1 bg-gray-900/50 border border-gray-800 rounded px-3 py-2 text-[11px] font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={isSending || !commMessage.trim()}
                                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold tracking-wider uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[60px]"
                                >
                                    {isSending ? <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span> : 'Send'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
                
                <ShortcutModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
            </div>
        </APIProvider>
    );
}
