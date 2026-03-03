'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSimulation } from '@/lib/SimulationContext';

interface Encounter {
    id: string;
    participants: string[];
    transcript: string;
    timestamp: any;
    sentimentScore?: number;
}

export default function ControlPanel({
    onSimulateKill,
    onRestart
}: {
    onSimulateKill: () => void;
    onRestart: () => void;
}) {
    const { agents, encounters } = useSimulation();
    const [logs, setLogs] = useState<string[]>([]);
    const [isServerDead, setIsServerDead] = useState(false);

    // Stats calculations
    const activeAgents = agents.length;
    const totalEncounters = encounters.length;
    const avgSentiment = agents.length > 0
        ? agents.reduce((acc, curr) => acc + (curr.sentimentScore || 0), 0) / agents.length
        : 0;

    const audioQueue = useRef<string[]>([]);
    const isPlayingAudio = useRef(false);
    const lastProcessedEncounter = useRef("");

    const processAudioQueue = async () => {
        if (isPlayingAudio.current || audioQueue.current.length === 0) return;

        isPlayingAudio.current = true;
        const currentAudioUrl = audioQueue.current.shift();

        if (currentAudioUrl) {
            const audio = new Audio(currentAudioUrl);
            audio.onended = () => {
                isPlayingAudio.current = false;
                processAudioQueue();
            };
            audio.play().catch(e => {
                console.error("Audio playback failed:", e);
                isPlayingAudio.current = false;
                processAudioQueue();
            });
        }
    };

    const fetchAndQueueTTS = async (text: string, role: string) => {
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, role })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                audioQueue.current.push(url);
                processAudioQueue();
            }
        } catch (e) {
            console.error("TTS Fetch Error:", e);
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            if (!isServerDead) {
                setLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] System healthy. Monitoring Firestore streams...`]);
            }
        }, 8000);
        return () => clearInterval(interval);
    }, [isServerDead]);

    const prevAgentsRef = useRef<Record<string, any>>({});

    // Derive diffs from SimulationContext instead of separate polling
    useEffect(() => {
        if (isServerDead || agents.length === 0) return;

        {
            const newAgentsData = agents;
            const newEncounters = encounters;

                // Compute differences for logs
                newAgentsData.forEach((agent: any) => {
                    const agentId = agent.id;
                    const oldAgent = prevAgentsRef.current[agentId];
                    const newAgent = agent;

                    if (!oldAgent) {
                        setLogs(prev => [...prev.slice(-15), `[CLOUD] Agent ${agentId} online. Role: ${newAgent.role || 'GCP Entity'}`]);
                    } else if (JSON.stringify(oldAgent) !== JSON.stringify(newAgent)) {
                        // Modified
                        if (newAgent.isInteracting && newAgent.lastEncounterDialogue && newAgent.lastEncounterDialogue !== lastProcessedEncounter.current) {
                            setLogs(prev => [...prev.slice(-15), `[SENTIMENT] Analyzing: "${newAgent.lastEncounterDialogue.substring(0, 30)}..."`, `[DIALOGUE] ${agentId}: ${newAgent.lastEncounterDialogue}`]);
                            lastProcessedEncounter.current = newAgent.lastEncounterDialogue;
                            fetchAndQueueTTS(newAgent.lastEncounterDialogue, newAgent.role || "Unknown");
                        } else if (!newAgent.isInteracting && oldAgent.defaultTask !== newAgent.defaultTask) {
                            setLogs(prev => [...prev.slice(-15), `[LOG] ${agentId} Action: ${newAgent.defaultTask?.substring(0, 40) || 'Moving...'}`]);
                        }
                    }

                    prevAgentsRef.current[agentId] = { ...newAgent };
                });
        }
    }, [agents, encounters, isServerDead]);

    const handleKill = () => {
        setIsServerDead(true);
        setLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ❌ CRITICAL: LOCAL PROCESS TERMINATED.`]);
        onSimulateKill();
    };

    const handleRestart = () => {
        setIsServerDead(false);
        setLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] 🔄 REBOOTING. Restoring state from Firestore...`]);
        onRestart();
    };

    return (
        <div className="w-full h-full bg-[#030406] text-white flex flex-col p-8 overflow-hidden relative">
            {/* Background Ambience */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-sky-500/5 blur-[100px] rounded-full pointer-events-none"></div>

            {/* Header */}
            <div className="flex items-end justify-between mb-8 relative z-10">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
                        METROPOLIS <span className="text-emerald-500 text-[10px] bg-emerald-500/10 px-2 py-1 rounded ml-2 border border-emerald-500/20 align-middle">CORE v4.0</span>
                    </h1>
                    <p className="text-[11px] text-gray-500 font-mono tracking-widest mt-2 uppercase flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                        Durable Agentic Workflow Repository
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleKill} disabled={isServerDead} className="group relative px-4 py-2 bg-rose-500/5 text-rose-500 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30 rounded-lg overflow-hidden border border-rose-500/20 hover:border-rose-500/50">
                        <div className="absolute inset-0 w-full h-full bg-rose-500/10 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300"></div>
                        <span className="relative z-10">Kill Process</span>
                    </button>
                    <button onClick={handleRestart} disabled={!isServerDead} className="group relative px-4 py-2 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30 rounded-lg overflow-hidden border border-emerald-500/20 hover:border-emerald-500/50">
                        <div className="absolute inset-0 w-full h-full bg-emerald-500/10 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300"></div>
                        <span className="relative z-10">Restore Engine</span>
                    </button>
                </div>
            </div>

            {/* LIVE GLOBAL STATS */}
            <div className="grid grid-cols-3 gap-5 mb-8 relative z-10">
                <div className="bg-gradient-to-br from-gray-900/60 to-black/60 border border-emerald-500/20 rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden group shadow-lg">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-xl group-hover:bg-emerald-500/20 transition-colors"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                        Active Entities
                    </span>
                    <span className="text-4xl font-black text-emerald-400 font-mono tracking-tighter">{activeAgents.toString().padStart(2, '0')}</span>
                </div>
                <div className="bg-gradient-to-br from-gray-900/60 to-black/60 border border-sky-500/20 rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden group shadow-lg">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/10 blur-xl group-hover:bg-sky-500/20 transition-colors"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-sky-500 rounded-full"></div>
                        Cognitive Collisions
                    </span>
                    <span className="text-4xl font-black text-sky-400 font-mono tracking-tighter">{totalEncounters.toString().padStart(3, '0')}</span>
                </div>
                <div className="bg-gradient-to-br from-gray-900/60 to-black/60 border border-amber-500/20 rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden group shadow-lg">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 blur-xl group-hover:bg-amber-500/20 transition-colors"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                        Global Mood Index
                    </span>
                    <span className={`text-4xl font-black font-mono tracking-tighter ${avgSentiment > 0.1 ? 'text-emerald-400' : avgSentiment < -0.1 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {avgSentiment > 0 ? '+' : ''}{avgSentiment.toFixed(2)}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-1 gap-6 relative z-10">
                {/* Sentiment & Telemetry Analytics */}
                <div className="bg-black/40 backdrop-blur-md border border-gray-800/80 rounded-xl flex flex-col overflow-hidden shadow-2xl">
                    <div className="px-5 py-3 border-b border-gray-800/80 flex justify-between items-center bg-gradient-to-r from-gray-900 to-black">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">NLP Sentiment Stream</span>
                        </div>
                        <span className="text-[9px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono flex items-center gap-1.5">
                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
                            BIGQUERY_LINK_ACTIVE
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                        <div className="space-y-4">
                            {encounters.length === 0 && <div className="text-gray-600/80 text-[11px] font-mono italic flex items-center justify-center h-full pt-10">Awaiting multi-agent cognitive interactions...</div>}
                            {encounters.slice(0, 10).map((enc) => (
                                <div key={enc.id} className="flex flex-col border border-gray-800/50 bg-gray-900/30 rounded-lg p-4 hover:border-gray-700 transition-colors">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[9px] font-bold uppercase rounded border border-sky-500/20 tracking-wider">
                                                {enc.participants[0]} <span className="opacity-50 mx-1">↔</span> {enc.participants[1]}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-gray-600 font-mono">{new Date(enc.timestamp).toLocaleTimeString()}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${(enc.sentimentScore || 0) > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                                {(enc.sentimentScore || 0) > 0 ? '+' : ''}{(enc.sentimentScore || 0).toFixed(2)} Volts
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-gray-300 font-serif italic border-l-2 border-gray-700 pl-3 leading-relaxed opacity-90">"{enc.transcript}"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* System Activity Stream */}
                <div className="bg-black/60 backdrop-blur-md border border-gray-800/80 rounded-xl flex flex-col overflow-hidden h-72 shadow-2xl">
                    <div className="px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r from-gray-900 to-black flex items-center gap-3">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Durable System Logs</span>
                        <div className="px-1.5 py-0.5 bg-gray-800 rounded text-[8px] font-mono text-gray-500 border border-gray-700">STDOUT</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 font-mono text-[11px] leading-snug scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                        <div className="space-y-1.5 max-w-full">
                            {logs.map((log, i) => {
                                let colorClass = 'text-emerald-500/70 border-l border-emerald-500/20';
                                if (log.includes('CRITICAL')) colorClass = 'text-rose-500 border-l-2 border-rose-500 bg-rose-500/5';
                                if (log.includes('REBOOTING')) colorClass = 'text-sky-400 border-l border-sky-400 bg-sky-500/5';
                                if (log.includes('DIALOGUE')) colorClass = 'text-sky-200 indent-4 opacity-80';

                                return (
                                    <div key={i} className={`flex gap-3 px-3 py-1 ${colorClass}`}>
                                        <span className="opacity-30 flex-shrink-0 select-none">[{i.toString().padStart(4, '0')}]</span>
                                        <span className="break-words whitespace-pre-wrap">{log}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-5 border-t border-gray-800 flex justify-between items-center relative z-10">
                <div className="flex gap-6">
                    <div className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
                        Next.js + GCP + Temporal
                    </div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-[0.2em] font-mono">WORKSPACE:{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</div>
                </div>
                <div className="text-[9px] text-gray-600 font-mono italic animate-pulse">SYSTEM NOMINAL. ANTIGRAVITY ENGINE RUNNING.</div>
            </div>
        </div>
    );
}
