'use client';

import React, { useState, useEffect } from 'react';

export default function ControlPanel({
    onSimulateKill,
    onRestart
}: {
    onSimulateKill: () => void;
    onRestart: () => void;
}) {
    const [logs, setLogs] = useState<string[]>([]);
    const [isServerDead, setIsServerDead] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!isServerDead) {
                setLogs(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] System healthy. Orchestrator listening for NPC signals...`]);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [isServerDead]);

    const handleKill = () => {
        setIsServerDead(true);
        setLogs(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] ❌ CRITICAL: LOCAL SERVER PROCESS TERMINATED BY USER.`]);
        onSimulateKill();
    };

    const handleRestart = () => {
        setIsServerDead(false);
        setLogs(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] 🔄 SERVER RESTARTED. Fetching state from Temporal/Firestore...`, `[${new Date().toLocaleTimeString()}] ✅ State fully restored. No amnesia detected.`]);
        onRestart();
    };

    return (
        <div className="w-full h-full bg-[#0a0f0d] text-[#00ff41] p-6 font-mono overflow-y-auto selection:bg-[#00ff41] selection:text-black">
            <div className="flex items-center gap-3 mb-6 border-b border-[#00ff41]/20 pb-4">
                <div className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse"></div>
                <h2 className="text-xl font-bold text-[#00ff41] tracking-[0.2em] uppercase">World Orchestrator</h2>
            </div>

            <div className="flex flex-col gap-3 mb-8">
                <button
                    onClick={handleKill}
                    disabled={isServerDead}
                    className="w-full py-3 bg-transparent border border-red-500 text-red-500 hover:bg-red-500/10 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] rounded-sm font-bold uppercase tracking-widest disabled:opacity-30 disabled:hover:shadow-none transition-all duration-300"
                >
                    [ Simulate Process Kill ]
                </button>
                <button
                    onClick={handleRestart}
                    disabled={!isServerDead}
                    className="w-full py-3 bg-transparent border border-blue-400 text-blue-400 hover:bg-blue-400/10 hover:shadow-[0_0_15px_rgba(96,165,250,0.5)] rounded-sm font-bold uppercase tracking-widest disabled:opacity-30 disabled:hover:shadow-none transition-all duration-300"
                >
                    [ Reboot Temporal Engine ]
                </button>
            </div>

            <div className="bg-black/50 p-5 rounded-sm border border-[#00ff41]/30 shadow-[inset_0_0_20px_rgba(0,255,65,0.05)] h-96 overflow-y-auto backdrop-blur-sm relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00ff41]/50 to-transparent opacity-50"></div>
                <h3 className="text-[#00ff41]/60 text-xs mb-4 uppercase tracking-[0.3em]">System Output Stream</h3>
                {logs.length === 0 && <span className="text-[#00ff41]/40 animate-pulse">Awaiting connection...</span>}
                {logs.map((log, i) => (
                    <div key={i} className={`mb-2 text-sm ${log.includes('CRITICAL') ? 'text-red-500 font-bold' : log.includes('RESTORED') ? 'text-blue-400 shadow-blue-400' : 'text-[#00ff41] opacity-90'}`}>
                        <span className="opacity-50 mr-2">{'>'}</span>{log}
                    </div>
                ))}
            </div>

            <div className="mt-8 text-xs text-[#00ff41]/50 leading-relaxed">
                <p className="uppercase tracking-widest text-[#00ff41]/70 mb-2">// Demonstration Protocol</p>
                <p>1. Observe autonomous Entity routing.</p>
                <p>2. Execute Kill. Entities suspend cognitive loop.</p>
                <p>3. Execute Reboot. Entities instantly recover state perfectly.</p>
            </div>
        </div>
    );
}
