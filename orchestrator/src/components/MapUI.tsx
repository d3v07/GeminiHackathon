'use client';

import React, { useEffect, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useApiIsLoaded } from '@vis.gl/react-google-maps';
import { useSimulation } from '@/lib/SimulationContext';

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
    const ref = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!apiIsLoaded || !ref.current || !window.google?.maps?.StreetViewPanorama) return;

        new window.google.maps.StreetViewPanorama(ref.current, {
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
    }, [apiIsLoaded, lat, lng]);

    return <div ref={ref} className="w-full h-full opacity-0 animate-in fade-in duration-1000" style={{ animationFillMode: 'forwards' }} />;
};

export default function MapUI() {
    const { agents } = useSimulation();
    const [selectedAgent, setSelectedAgent] = useState<any | null>(null);

    // Keep selectedAgent in sync with latest data from context
    useEffect(() => {
        if (!selectedAgent) return;
        const updated = agents.find((a: any) => a.id === selectedAgent.id);
        if (updated) setSelectedAgent(updated);
    }, [agents]);

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

    return (
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
            <div className="w-full h-full relative border-r border-gray-800 bg-[#05070a] overflow-hidden flex">
                {/* Enterprise GCP Status Indicators */}
                <div className="absolute top-6 left-6 z-10 flex flex-col gap-3 pointer-events-none">
                    <div className="flex items-center gap-3 bg-black/80 backdrop-blur-xl px-4 py-2 rounded border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)] text-[11px] font-mono text-emerald-400">
                        <div className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <span>BIGQUERY STREAM: ACTIVE</span>
                    </div>
                    <div className="flex items-center gap-3 bg-black/80 backdrop-blur-xl px-4 py-2 rounded border border-sky-500/40 shadow-[0_0_15px_rgba(14,165,233,0.2)] text-[11px] font-mono text-sky-400">
                        <div className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
                        </div>
                        <span>NLP SENTIMENT: LIVE</span>
                    </div>
                </div>

                <div className="flex-1 relative">
                    <Map
                        defaultZoom={14}
                        defaultCenter={NYC_CENTER}
                        mapId="e8c5dcfe877a5b6d"
                        disableDefaultUI={true}
                        style={{ width: '100%', height: '100%', filter: 'contrast(1.25) brightness(0.8) saturate(1.4)' }}
                    >
                        {agents.map((agent) => (
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
                                    </div>

                                    {/* Hover info tooltip */}
                                    <div className="absolute top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 backdrop-blur px-3 py-1.5 rounded border border-gray-800 text-[9px] font-mono text-white whitespace-nowrap shadow-xl pointer-events-none">
                                        ID: {agent.id.substring(0, 8)}<br />
                                        STATE: {agent.isInteracting ? 'INTERACTING' : 'IDLE'}
                                    </div>
                                </div>
                            </AdvancedMarker>
                        ))}
                    </Map>
                </div>

                {/* NPC DETAIL PANEL */}
                {selectedAgent && (
                    <div className="w-96 h-full bg-gradient-to-b from-[#0a0a0f] to-[#040406] border-l border-gray-800 p-8 flex flex-col overflow-y-auto z-20 shadow-2xl animate-in slide-in-from-right duration-500 ease-out relative">
                        <button onClick={() => setSelectedAgent(null)} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-all">✕</button>

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

                        {/* Footer Stats block */}
                        <div className="mt-auto pt-8">
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
                    </div>
                )}
            </div>
        </APIProvider>
    );
}
