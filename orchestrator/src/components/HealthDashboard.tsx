'use client';

import { useState, useEffect } from 'react';

interface MetricsData {
  status: string;
  uptime: number;
  activeAgents: number;
  encountersToday: number;
  tokensUsed: number;
  projectedCostUsd: number;
}

export default function HealthDashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (err) {
        console.error('Failed to fetch metrics', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    interval = setInterval(fetchMetrics, 10000);

    return () => clearInterval(interval);
  }, []);

  if (isLoading && !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 animate-pulse">
            <div className="h-3 bg-gray-800 w-20 mb-2 rounded"></div>
            <div className="h-6 bg-gray-700 w-16 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-gray-800 pt-6">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        Enterprise Telemetry
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="System Uptime"
          value={metrics ? `${Math.floor(metrics.uptime / 60)}m` : '--'}
          color="text-emerald-400"
          borderColor="border-emerald-500/20"
        />
        <MetricCard
          label="Active Agents"
          value={metrics?.activeAgents ?? '--'}
          color="text-sky-400"
          borderColor="border-sky-500/20"
        />
        <MetricCard
          label="Tokens Used"
          value={metrics ? metrics.tokensUsed.toLocaleString() : '--'}
          subtext="Gemini 2.5 Flash"
          color="text-amber-400"
          borderColor="border-amber-500/20"
        />
        <MetricCard
          label="Op Cost"
          value={metrics ? `$${metrics.projectedCostUsd.toFixed(4)}` : '--'}
          color="text-rose-400"
          borderColor="border-rose-500/20"
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtext, color, borderColor }: { label: string, value: string | number, subtext?: string, color: string, borderColor: string }) {
  return (
    <div className={`bg-gray-900/60 border ${borderColor} rounded-lg p-3 flex flex-col justify-center`}>
      <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{label}</span>
      <span className={`text-xl font-mono font-black ${color} tracking-tighter shadow-sm`}>{value}</span>
      {subtext && <span className="text-[9px] text-gray-500 mt-0.5">{subtext}</span>}
    </div>
  );
}
