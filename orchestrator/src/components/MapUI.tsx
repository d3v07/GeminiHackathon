'use client';

import React, { useEffect, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const NYC_CENTER = { lat: 40.7128, lng: -74.0060 };

interface Agent {
    id: string;
    lat: number;
    lng: number;
    isInteracting: boolean;
    defaultTask: string;
    sentimentScore?: number;
}

export default function MapUI() {
    const [agents, setAgents] = useState<any[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<any | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchState = async () => {
            try {
                const res = await fetch('/api/state');
                const data = await res.json();
                if (isMounted && data.agents) {
                    setAgents(data.agents);
                    if (selectedAgent) {
                        const updated = data.agents.find((a: any) => a.id === selectedAgent.id);
                        if (updated) setSelectedAgent(updated);
                    }
                }
            } catch (e) {
                console.error("Poll error:", e);
            }
        };

        fetchState();
        const interval = setInterval(fetchState, 1500);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [selectedAgent]);

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
        <div className="w-full h-full relative border-r border-gray-800 bg-[#0a0a0e] overflow-hidden flex">
            {/* Enterprise GCP Status Indicators */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-500/30 text-[10px] font-mono text-emerald-400 shadow-lg">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    BIGQUERY STREAM: ACTIVE
                </div>
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-sky-500/30 text-[10px] font-mono text-sky-400 shadow-lg">
                    <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></div>
                    NLP SENTIMENT: LIVE
                </div>
            </div>

            <div className="flex-1 relative">
                <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
                    <Map
                        defaultZoom={13}
                        defaultCenter={NYC_CENTER}
                        mapId="e8c5dcfe877a5b6d"
                        disableDefaultUI={true}
                        style={{ width: '100%', height: '100%', filter: 'contrast(1.2) brightness(0.9) saturate(1.2)' }}
                    >
                        {agents.map((agent) => (
                            <AdvancedMarker
                                key={agent.id}
                                position={{ lat: agent.lat, lng: agent.lng }}
                                onClick={() => setSelectedAgent(agent)}
                            >
                                <div className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer ${agent.isInteracting ? 'scale-125 border-2 border-white' : ''}`}>
                                    <div className={`absolute -inset-2 rounded-full blur-md opacity-40 ${getMoodColor(agent.sentimentScore)}`}></div>
                                    <div className={`absolute w-full h-full rounded-full ${getMoodPing(agent.sentimentScore)} opacity-75 animate-ping`}></div>
                                    <div className={`relative w-4 h-4 rounded-full border-2 border-white/50 shadow-xl ${getMoodColor(agent.sentimentScore)}`}></div>
                                </div>
                            </AdvancedMarker>
                        ))}
                    </Map>
                </APIProvider>
            </div>

            {/* NPC DETAIL PANEL (TASK-D3) */}
            {selectedAgent && (
                <div className="w-80 h-full bg-[#0d0f14] border-l border-gray-800 p-6 flex flex-col overflow-y-auto z-20 shadow-2xl animate-in slide-in-from-right duration-300">
                    <button onClick={() => setSelectedAgent(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>

                    <div className="mb-6">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active Agentic Entity</span>
                        <h2 className="text-xl font-black text-white mt-1 uppercase tracking-tighter">{selectedAgent.role || 'GCP Entity'}</h2>
                        <p className="text-[10px] font-mono text-emerald-500/80 mt-1">{selectedAgent.id}</p>
                    </div>

                    {/* Street View Preview */}
                    <div className="mb-6 rounded-lg overflow-hidden border border-gray-800 aspect-video bg-gray-900 group relative">
                        <img
                            src={`https://maps.googleapis.com/maps/api/streetview?size=400x250&location=${selectedAgent.lat},${selectedAgent.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                            alt="Street View"
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                        />
                        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[8px] font-mono text-white flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
                            LIVE_SCENE_CAPTURE
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Cognitive Goal</span>
                            <div className="bg-gray-900/50 rounded p-3 border border-gray-800">
                                <p className="text-xs text-gray-300 italic leading-relaxed font-mono">"{selectedAgent.defaultTask || 'Synthesizing next move...'}"</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Sentiment Score</span>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                                    <div
                                        className={`absolute left-0 top-0 h-full transition-all duration-1000 ${getMoodColor(selectedAgent.sentimentScore)}`}
                                        style={{ width: `${Math.max(0, Math.min(100, (selectedAgent.sentimentScore + 1) * 50))}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between mt-1 font-mono text-[9px] text-gray-500 italic">
                                    <span>STRESSED</span>
                                    <span>ZEN</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Condition</span>
                                <div className={`text-[10px] font-bold px-2 py-1 rounded border text-center ${selectedAgent.isInteracting ? 'border-rose-500/40 text-rose-400 bg-rose-500/5' : 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5'}`}>
                                    {selectedAgent.isInteracting ? '🔴 INTERACTING' : '🟢 AUTONOMOUS'}
                                </div>
                            </div>
                        </div>

                        {selectedAgent.lastEncounterDialogue && (
                            <div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Last Cognitive Encounter</span>
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-3">
                                    <p className="text-[11px] text-emerald-400 font-mono italic leading-relaxed">"{selectedAgent.lastEncounterDialogue}"</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto pt-6">
                        <div className="text-[9px] text-gray-600 font-mono flex flex-col gap-1">
                            <span>LAT: {selectedAgent.lat.toFixed(6)}</span>
                            <span>LNG: {selectedAgent.lng.toFixed(6)}</span>
                            <span>LAST_PING: {new Date(selectedAgent.lastUpdated).toLocaleTimeString()}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
