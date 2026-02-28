'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
    const [agents, setAgents] = useState<any[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [encounters, setEncounters] = useState<Encounter[]>([]);
    const [isServerDead, setIsServerDead] = useState(false);

    // Stats calculations
    const activeAgents = agents.length;
    const totalEncounters = encounters.length;
    const avgSentiment = encounters.length > 0
        ? encounters.reduce((acc, curr) => acc + (curr.sentimentScore || 0), 0) / encounters.length
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
                setLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] System healthy. Monitoring GCP Pub/Sub stream...`]);
            }
        }, 8000);
        return () => clearInterval(interval);
    }, [isServerDead]);

    // Firestore listeners
    useEffect(() => {
        // 1. Agent Updates Listener
        const unsubscribeAgents = onSnapshot(collection(db, 'agents'), (snapshot) => {
            const agentsData: any[] = [];
            snapshot.forEach((doc) => {
                agentsData.push({ id: doc.id, ...doc.data() });
            });
            setAgents(agentsData);

            snapshot.docChanges().forEach((change) => {
                const agentId = change.doc.id;
                const data = change.doc.data();

                if (change.type === 'added') {
                    setLogs(prev => [...prev.slice(-15), `[CLOUD] Agent ${agentId} online. Role: ${data.role || 'GCP Entity'}`]);
                }
                if (change.type === 'modified') {
                    if (data.isInteracting && data.lastEncounterDialogue && data.lastEncounterDialogue !== lastProcessedEncounter.current) {
                        setLogs(prev => [...prev.slice(-15), `[SENTIMENT] Analyzing: "${data.lastEncounterDialogue.substring(0, 30)}..."`, `[DIALOGUE] ${agentId}: ${data.lastEncounterDialogue}`]);
                        lastProcessedEncounter.current = data.lastEncounterDialogue;
                        fetchAndQueueTTS(data.lastEncounterDialogue, data.role || "Unknown");
                    } else if (!data.isInteracting) {
                        setLogs(prev => [...prev.slice(-15), `[LOG] ${agentId} Action: ${data.defaultTask?.substring(0, 40) || 'Moving...'}`]);
                    }
                }
            });
        });

        // 2. Encounters History Listener
        const encountersQuery = query(collection(db, 'encounters'), orderBy('timestamp', 'desc'));
        const unsubscribeEncounters = onSnapshot(encountersQuery, (snapshot) => {
            const newEncounters: Encounter[] = [];
            snapshot.forEach((doc) => {
                newEncounters.push({ id: doc.id, ...doc.data() } as Encounter);
            });
            setEncounters(newEncounters);
        });

        return () => {
            unsubscribeAgents();
            unsubscribeEncounters();
        };
    }, []);

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
        <div className="w-full h-full bg-[#05070a] text-white flex flex-col p-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-xl font-black tracking-tighter">METROPOLIS <span className="text-emerald-500 text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded ml-2">CORE v4.0</span></h1>
                    <p className="text-[10px] text-gray-500 font-mono tracking-widest mt-1 uppercase">Durable Agentic Workflow Repository</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleKill} disabled={isServerDead} className="px-3 py-1.5 border border-rose-500/30 bg-rose-500/5 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all disabled:opacity-20 rounded">Kill Process</button>
                    <button onClick={handleRestart} disabled={!isServerDead} className="px-3 py-1.5 border border-emerald-500/30 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-20 rounded">Restore Engine</button>
                </div>
            </div>

            {/* LIVE GLOBAL STATS (TASK-D6) */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-900/40 border border-emerald-500/20 rounded p-3 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-1">Active Agents</span>
                    <span className="text-xl font-black text-emerald-400 font-mono">{activeAgents.toString().padStart(2, '0')}</span>
                </div>
                <div className="bg-gray-900/40 border border-sky-500/20 rounded p-3 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-1">Cognitive Collisions</span>
                    <span className="text-xl font-black text-sky-400 font-mono">{totalEncounters.toString().padStart(3, '0')}</span>
                </div>
                <div className="bg-gray-900/40 border border-amber-500/20 rounded p-3 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-1">Avg Global Mood</span>
                    <span className={`text-xl font-black font-mono ${avgSentiment > 0.1 ? 'text-emerald-400' : avgSentiment < -0.1 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {avgSentiment > 0 ? '+' : ''}{avgSentiment.toFixed(2)}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-1 gap-6">
                {/* Sentiment & Telemetry Analytics */}
                <div className="bg-gray-900/40 border border-gray-800 rounded flex flex-col overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center bg-gray-900/60">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">NLP Sentiment Stream</span>
                        <span className="text-[9px] text-emerald-500 font-mono animate-pulse">● BIGQUERY_LINK_ACTIVE</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {encounters.length === 0 && <div className="text-gray-600 text-[11px] italic">Awaiting cognitive interactions...</div>}
                        {encounters.slice(0, 10).map((enc) => (
                            <div key={enc.id} className="flex flex-col border-b border-gray-800 pb-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-sky-400">{enc.participants.join(' ↔ ')}</span>
                                    <span className={`text-[10px] font-mono ${(enc.sentimentScore || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {(enc.sentimentScore || 0).toFixed(2)}
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-400 font-mono italic truncate">"{enc.transcript}"</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* System Activity Stream */}
                <div className="bg-gray-900/40 border border-gray-800 rounded flex flex-col overflow-hidden h-64">
                    <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/60">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Durable state Log</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1">
                        {logs.map((log, i) => (
                            <div key={i} className={`flex gap-2 ${log.includes('CRITICAL') ? 'text-rose-500' : log.includes('REBOOTING') ? 'text-sky-400' : 'text-emerald-500/80'}`}>
                                <span className="opacity-30">[{i}]</span>
                                <span>{log}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center">
                <div className="flex gap-4">
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest">Stack: Next.js + GCP + Temporal</div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest">ID: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</div>
                </div>
                <div className="text-[9px] text-gray-600 italic">Antigravity Cognitive Engine Active</div>
            </div>
        </div>
    );
}
