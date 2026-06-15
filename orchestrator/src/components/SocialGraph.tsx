'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods, GraphData, LinkObject, NodeObject } from 'react-force-graph-2d';
import { useSimulation } from '@/lib/SimulationContext';

type RelationshipType = 'friend' | 'rival' | 'acquaintance';

interface SocialNode {
    id: string;
    group: number;
    val: number;
    color: string;
    name?: string;
    role?: string;
}

interface SocialLink {
    type: RelationshipType;
    weight: number;
}

type GraphNode = NodeObject<SocialNode>;
type GraphLink = LinkObject<SocialNode, SocialLink> & {
    source: string;
    target: string;
};
type RenderNode = NodeObject<GraphNode>;
type RenderLink = LinkObject<GraphNode, LinkObject<SocialNode, SocialLink>>;
type GraphMethods = ForceGraphMethods<GraphNode, LinkObject<SocialNode, SocialLink>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isRelationshipType = (value: unknown): value is RelationshipType =>
    value === 'friend' || value === 'rival' || value === 'acquaintance';

const toGraphLink = (edge: unknown): GraphLink | null => {
    if (!isRecord(edge)) return null;

    const { source, target, type, weight } = edge;
    if (typeof source !== 'string' || typeof target !== 'string') return null;

    return {
        source,
        target,
        type: isRelationshipType(type) ? type : 'acquaintance',
        weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : 1
    };
};

export default function SocialGraph({ onNodeClick }: { onNodeClick?: (agentId: string) => void }) {
    const { agents, isLoading } = useSimulation();
    const publicDemo = process.env.NEXT_PUBLIC_METROPOLIS_PUBLIC_DEMO === 'true' || process.env.METROPOLIS_PUBLIC_DEMO === 'true';
    const [graphData, setGraphData] = useState<GraphData<SocialNode, SocialLink>>({ nodes: [], links: [] });
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<GraphMethods | undefined>(undefined);

    const buildNodes = useCallback((): GraphNode[] => agents.map(a => ({
        id: a.id,
        name: a.id.split('_').pop(),
        group: a.sentimentScore ? (a.sentimentScore > 0 ? 1 : a.sentimentScore < 0 ? 2 : 3) : 3,
        val: a.isInteracting ? 8 : 5,
        color: a.isInteracting ? '#10b981' : '#60a5fa',
        role: a.role
    })), [agents]);

    const buildFallbackLinks = useCallback((): GraphLink[] => {
        if (agents.length < 2) return [];
        return agents.slice(1).map((agent, index) => ({
            source: agents[index].id,
            target: agent.id,
            type: index % 3 === 0 ? 'friend' : index % 3 === 1 ? 'rival' : 'acquaintance',
            weight: 2 + index
        }));
    }, [agents]);

    // Resize observer to keep graph responsive
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
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
            const nodes = buildNodes();
            const fallbackLinks = buildFallbackLinks();
            if (publicDemo) {
                setGraphData({ nodes, links: fallbackLinks });
                return;
            }

            try {
                const res = await fetch('/api/social-graph');
                if (res.ok) {
                    const data: unknown = await res.json();

                    const links = isRecord(data) && Array.isArray(data.edges)
                        ? data.edges.map(toGraphLink).filter((link): link is GraphLink => link !== null)
                        : [];

                    setGraphData({ nodes, links: links.length > 0 ? links : fallbackLinks });
                } else {
                    setGraphData({ nodes, links: fallbackLinks });
                }
            } catch (err) {
                console.error("Failed to load social graph data:", err);
                setGraphData({ nodes, links: fallbackLinks });
            }
        };

        if (agents.length > 0) {
            fetchGraph();
        }
    }, [agents.length, buildFallbackLinks, buildNodes, publicDemo]);

    const handleNodeClick = useCallback(
        (node: RenderNode) => {
            if (onNodeClick) onNodeClick(node.id);
            // Center camera on node
            if (graphRef.current && typeof node.x === 'number' && typeof node.y === 'number') {
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
                nodeLabel={(node: RenderNode) => `<div class="bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs font-mono">${node.name || node.id}<br/><span class="text-gray-400 text-[10px]">${node.role || ''}</span></div>`}
                nodeColor={(node: RenderNode) => node.color}
                nodeRelSize={6}
                linkColor={(link: RenderLink) =>
                    link.type === 'friend' ? 'rgba(16, 185, 129, 0.4)' : // emerald
                    link.type === 'rival' ? 'rgba(244, 63, 94, 0.4)' :   // rose
                    'rgba(156, 163, 175, 0.2)'                           // gray
                }
                linkWidth={(link: RenderLink) => (link.weight || 1) * 2}
                linkDirectionalParticles={(link: RenderLink) => link.weight > 3 ? 2 : 0}
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
