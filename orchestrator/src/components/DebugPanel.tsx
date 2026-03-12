'use client';

import { useState, useEffect } from 'react';
import { useSimulation } from '@/lib/SimulationContext';

export default function DebugPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const simulation = useSimulation();
  
  // Track metrics to show in debug
  const [lastMetrics, setLastMetrics] = useState<any>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => setLastMetrics(data))
      .catch(() => setLastMetrics({ error: 'Failed to fetch metrics' }));
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="absolute top-0 right-0 w-full md:w-[600px] h-full z-[100] bg-black/95 border-l border-indigo-500/30 text-emerald-400 font-mono text-xs overflow-y-auto p-6 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-200">
      <div className="flex justify-between items-center border-b border-indigo-500/30 pb-4 mb-4">
        <h2 className="text-lg font-black text-indigo-400 tracking-widest">
          SYS_DEBUG_TERMINAL
        </h2>
        <button 
          onClick={() => setIsVisible(false)} 
          className="px-2 border border-gray-600 rounded hover:bg-gray-800 text-gray-400"
        >
          ESC
        </button>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-white mb-2 bg-gray-900 px-2 py-1 inline-block">[1] Connection State</h3>
          <pre className="bg-[#050505] p-3 rounded border border-gray-800 overflow-x-auto">
            {JSON.stringify({
              status: simulation.connectionStatus,
              isError: !!simulation.error,
              errorStr: simulation.error
            }, null, 2)}
          </pre>
        </section>

        <section>
          <h3 className="text-white mb-2 bg-gray-900 px-2 py-1 inline-block">[2] Memory Index ({simulation.agents.length} nodes)</h3>
          <pre className="bg-[#050505] p-3 rounded border border-gray-800 overflow-x-auto max-h-60">
            {JSON.stringify(simulation.agents.slice(0, 2), null, 2)}
            {simulation.agents.length > 2 && '\n\n... (TRUNCATED)'}
          </pre>
        </section>
        
        <section>
          <h3 className="text-white mb-2 bg-gray-900 px-2 py-1 inline-block">[3] API Metrics (last fetch)</h3>
          <pre className="bg-[#050505] p-3 rounded border border-gray-800 overflow-x-auto">
            {lastMetrics ? JSON.stringify(lastMetrics, null, 2) : 'Loading...'}
          </pre>
        </section>
      </div>
    </div>
  );
}
