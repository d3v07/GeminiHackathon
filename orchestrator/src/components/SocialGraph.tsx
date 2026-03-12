'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useSimulation } from '@/lib/SimulationContext';

interface Node {
    id: string;
    group: number;
    val: number;
    color?: string;
    name?: string;
    role?: string;
}

interface Link {
    source: string;
    target: string;
    type: 'friend' | 'rival' | 'acquaintance';
    weight: number;
}

export default function SocialGraph({ onNodeClick }: { onNodeClick?: (agentId: string) => void }) {
    const { agents, isLoading } = useSimulation();
    const [graphData, setGraphData] = useState<{ nodes: Node[], links: Link[] }>({ nodes: [], links: [] });
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);

    // Resize observer to keep graph responsive
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Fetch Relationships via S6 API and map to d3 nodes/links
    useEffect(() => {
        const fetchGraph = async () => {
            try {
                const res = await fetch('/api/social-graph');
                if (res.ok) {
                    const data = await res.json();
                    
                    // The backend API should return { nodes: [...], edges: [...] } 
                    // or we derive it from agents list directly if edges aren't strictly returned
                    const nodes: Node[] = agents.map(a => ({
                        id: a.id,
                        name: a.id.split('_').pop(), // e.g. "Agent_Alice" -> "Alice"
                        group: a.sentimentScore ? (a.sentimentScore > 0 ? 1 : a.sentimentScore < 0 ? 2 : 3) : 3,
                        val: 5,
                        color: a.isInteracting ? '#10b981' : '#60a5fa',
                        role: a.role
                    }));

                    const links: Link[] = data.edges ? data.edges.map((e: any) => ({
                        source: e.source,
                        target: e.target,
                        type: e.type || 'acquaintance',
                        weight: e.weight || 1
                    })) : [];

                    setGraphData({ nodes, links });
                }
            } catch (err) {
                console.error("Failed to load social graph data:", err);
            }
        };

        if (agents.length > 0) {
            fetchGraph();
        }
    }, [agents]);

    const handleNodeClick = useCallback(
        (node: any) => {
            if (onNodeClick) onNodeClick(node.id);
            // Center camera on node
            if (graphRef.current) {
                graphRef.current.centerAt(node.x, node.y, 1000);
                graphRef.current.zoom(8, 2000);
            }
        },
        [onNodeClick]
    );

    if (isLoading && agents.length === 0) {
        return <div className="w-full h-full flex items-center justify-center text-emerald-400 font-mono animate-pulse">Initializing Social Matrix...</div>;
    }

    return (
        <div ref={containerRef} className="w-full h-full bg-black relative">
            <ForceGraph2D
                ref={graphRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                nodeLabel={(node: any) => `<div class="bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs font-mono">${node.name || node.id}<br/><span class="text-gray-400 text-[10px]">${node.role || ''}</span></div>`}
                nodeColor={node => node.color as string}
                nodeRelSize={6}
                linkColor={(link: any) => 
                    link.type === 'friend' ? 'rgba(16, 185, 129, 0.4)' : // emerald
                    link.type === 'rival' ? 'rgba(244, 63, 94, 0.4)' :   // rose
                    'rgba(156, 163, 175, 0.2)'                           // gray
                }
                linkWidth={(link: any) => (link.weight || 1) * 2}
                linkDirectionalParticles={(link: any) => link.weight > 3 ? 2 : 0}
                linkDirectionalParticleSpeed={0.01}
                onNodeClick={handleNodeClick}
                backgroundColor="#000000"
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
            />
            {/* Overlay Info */}
            <div className="absolute top-4 left-4 pointer-events-none">
                <h2 className="text-xl font-black text-white mix-blend-difference">Global Social Matrix</h2>
                <div className="flex gap-4 mt-2 font-mono text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Friends</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Rivals</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full hidden md:block bg-gray-500"></div> Acquaintances</span>
                </div>
            </div>
        </div>
    );
}
