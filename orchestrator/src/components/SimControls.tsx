'use client';

import React, { useState } from 'react';
import { useToast } from './ToastContainer';

export default function SimControls() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<'0.5x' | '1x' | '2x'>('1x');
  const [showSpawnForm, setShowSpawnForm] = useState(false);
  const [spawnData, setSpawnData] = useState({ role: 'Tourist', lat: 40.7580, lng: -73.9855 });
  const [isSpawning, setIsSpawning] = useState(false);
  const { toast } = useToast();

  const handlePlayPause = async () => {
    const nextState = !isPlaying;
    try {
      const res = await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextState ? 'resume' : 'pause' })
      });
      if (res.ok) {
        setIsPlaying(nextState);
        toast.success(`Simulation ${nextState ? 'resumed' : 'paused'}`);
      } else throw new Error();
    } catch {
      toast.error('Failed to change simulation state');
    }
  };

  const handleSpeed = async (newSpeed: '0.5x' | '1x' | '2x') => {
    try {
      const res = await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'speed', value: newSpeed })
      });
      if (res.ok) {
        setSpeed(newSpeed);
        toast.success(`Speed set to ${newSpeed}`);
      } else throw new Error();
    } catch {
      toast.error('Failed to change simulation speed');
    }
  };

  const handleSpawn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSpawning(true);
    try {
      const res = await fetch('/api/agents/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spawnData)
      });
      if (!res.ok) throw new Error();
      toast.success(`Successfully minted new ${spawnData.role}`);
      setShowSpawnForm(false);
    } catch {
      toast.error('Failed to spawn agent');
    } finally {
      setIsSpawning(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-md border border-gray-800 rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl">
      <button 
        onClick={handlePlayPause}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/40'}`}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="h-6 w-px bg-gray-700"></div>

      <div className="flex bg-gray-900 rounded-full border border-gray-700 overflow-hidden">
        {['0.5x', '1x', '2x'].map((s) => (
          <button
            key={s}
            onClick={() => handleSpeed(s as any)}
            className={`px-3 py-1.5 text-xs font-mono transition-colors ${speed === s ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-gray-700"></div>

      <div className="relative">
        <button 
          onClick={() => setShowSpawnForm(!showSpawnForm)}
          className="px-4 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-full text-xs font-bold hover:bg-indigo-500/40 transition-colors uppercase tracking-widest"
        >
          Spawn
        </button>

        {showSpawnForm && (
          <form onSubmit={handleSpawn} className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-xl flex flex-col gap-3 font-mono text-xs">
            <h3 className="text-gray-400 font-bold uppercase tracking-widest mb-1 border-b border-gray-800 pb-2">Mint Agent</h3>
            <label className="flex flex-col gap-1 text-gray-500">
              Role
              <input value={spawnData.role} onChange={e => setSpawnData({...spawnData, role: e.target.value})} className="bg-black border border-gray-700 rounded p-1.5 text-white" />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-gray-500 flex-1">
                Lat
                <input type="number" step="0.0001" value={spawnData.lat} onChange={e => setSpawnData({...spawnData, lat: parseFloat(e.target.value)})} className="bg-black border border-gray-700 rounded p-1.5 text-white w-full" />
              </label>
              <label className="flex flex-col gap-1 text-gray-500 flex-1">
                Lng
                <input type="number" step="0.0001" value={spawnData.lng} onChange={e => setSpawnData({...spawnData, lng: parseFloat(e.target.value)})} className="bg-black border border-gray-700 rounded p-1.5 text-white w-full" />
              </label>
            </div>
            <button type="submit" disabled={isSpawning} className="mt-2 w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded transition-colors disabled:opacity-50">
              {isSpawning ? 'Minting...' : 'Initialize'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
