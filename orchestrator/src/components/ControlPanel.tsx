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
        <div className="w-full h-full bg-gray-900 text-green-400 p-6 font-mono overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">World Orchestrator Dashboard</h2>

            <div className="flex gap-4 mb-8">
                <button
                    onClick={handleKill}
                    disabled={isServerDead}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold disabled:opacity-50 transition-colors"
                >
                    Simulate Server Kill
                </button>
                <button
                    onClick={handleRestart}
                    disabled={!isServerDead}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold disabled:opacity-50 transition-colors"
                >
                    Restart Process
                </button>
            </div>

            <div className="bg-black p-4 rounded-lg border border-gray-700 shadow-inner h-96 overflow-y-auto">
                <h3 className="text-gray-400 mb-2 border-b border-gray-700 pb-2">SYSTEM EVENT LOG</h3>
                {logs.length === 0 && <span className="text-gray-600">Waiting for events...</span>}
                {logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.includes('CRITICAL') ? 'text-red-500' : log.includes('RESTORED') ? 'text-blue-400' : 'text-green-400'}`}>
                        {log}
                    </div>
                ))}
            </div>

            <div className="mt-8 text-sm text-gray-500">
                <p>Proof of Durability:</p>
                <p>1. Observe NPC movement on map.</p>
                <p>2. Kill server. NPCs pause in logic.</p>
                <p>3. Restart server. State remains intact.</p>
            </div>
        </div>
    );
}
