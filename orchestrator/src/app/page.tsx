'use client';

import { useState } from 'react';
import MapUI from '@/components/MapUI';
import ControlPanel from '@/components/ControlPanel';

export default function Home() {
  const [isServerActive, setIsServerActive] = useState(true);

  const testTrigger = async () => {
    // A quick way for the judges to drop a test agent into Firestore from the UI
    const res = await fetch('/api/orchestrator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'Judge_Test_Agent_' + Math.floor(Math.random() * 1000),
        lat: 40.7128 + (Math.random() - 0.5) * 0.05,
        lng: -74.0060 + (Math.random() - 0.5) * 0.05,
        defaultTask: 'Exploring NYC',
      }),
    });
    console.log(await res.json());
  };

  return (
    <main className="flex h-screen w-screen bg-black overflow-hidden flex-col md:flex-row">

      {/* 
        By pausing the UI connection when the server is "killed", 
        we simulate the agent's logic pausing until restoration, perfectly demoing durability. 
      */}
      <div className={`flex-grow h-1/2 md:h-full transition-opacity duration-1000 ${isServerActive ? 'opacity-100' : 'opacity-20 pointer-events-none blur-sm'}`}>
        <MapUI />
      </div>

      <div className="w-full md:w-[450px] h-1/2 md:h-full border-t md:border-t-0 md:border-l border-gray-700 bg-gray-900 shadow-xl flex flex-col">
        <ControlPanel
          onSimulateKill={() => setIsServerActive(false)}
          onRestart={() => setIsServerActive(true)}
        />

        <div className="p-6 bg-gray-800 border-t border-gray-700 font-mono text-sm text-gray-400 flex justify-between items-center">
          <div>Status: <span className={isServerActive ? "text-green-400 font-bold" : "text-red-500 font-bold mb-4"}>{isServerActive ? "ONLINE" : "OFFLINE"}</span></div>
          <button onClick={testTrigger} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs transition-colors">
            Spawn Test NPC
          </button>
        </div>
      </div>
    </main>
  );
}
