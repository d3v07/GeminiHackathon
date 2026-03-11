'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

interface Agent {
    id: string;
    lat: number;
    lng: number;
    role?: string;
}

interface ExploreModeProps {
    initialLat: number;
    initialLng: number;
    agents: Agent[];
    onAgentNear: (agent: Agent) => void;
}

// Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

export default function ExploreMode({ initialLat, initialLng, agents, onAgentNear }: ExploreModeProps) {
    const apiIsLoaded = useApiIsLoaded();
    const ref = useRef<HTMLDivElement>(null);
    const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const agentsRef = useRef(agents);

    // Keep ref up to date
    useEffect(() => {
        agentsRef.current = agents;
    }, [agents]);
    
    // Focus the div on mount so WASD keys work for the panorama
    useEffect(() => {
        if (ref.current) ref.current.focus();
    }, []);

    useEffect(() => {
        if (!apiIsLoaded || !ref.current || !window.google?.maps) return;

        panoRef.current = new window.google.maps.StreetViewPanorama(ref.current, {
            position: { lat: initialLat, lng: initialLng },
            pov: { heading: 100, pitch: 0 },
            zoom: 1,
            showRoadLabels: true,
            disableDefaultUI: false,
            panControl: true,
            zoomControl: true,
            linksControl: true,
            clickToGo: true,
            addressControl: true,
        });

        // Listen for position changes to calculate proximity to agents
        panoRef.current.addListener('position_changed', () => {
            const pos = panoRef.current?.getPosition();
            if (!pos) return;
            
            const currentLat = pos.lat();
            const currentLng = pos.lng();

            // Find nearest agent using the latest ref
            for (const agent of agentsRef.current) {
                const dist = getDistance(currentLat, currentLng, agent.lat, agent.lng);
                // If within 25 meters, trigger encounter interaction
                if (dist < 25) {
                    onAgentNear(agent);
                }
            }
        });

        return () => {
            if (panoRef.current) {
                panoRef.current.setVisible(false);
                panoRef.current = null;
            }
        };
    }, [apiIsLoaded]); // Run once on load

    // Update markers when agents change
    useEffect(() => {
        if (!panoRef.current || !window.google?.maps) return;

        // Clear old markers
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];

        // Note: AdvancedMarkerElement isn't fully supported in StreetView yet in standard library without a Map
        // Using legacy google.maps.Marker for StreetView overlays for reliable rendering.
        agents.forEach(agent => {
            const marker = new window.google.maps.Marker({
                position: { lat: agent.lat, lng: agent.lng },
                map: panoRef.current as any, // Attach directly to panorama
                title: agent.role || agent.id,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 14,
                    fillColor: '#10b981', // emerald
                    fillOpacity: 0.8,
                    strokeWeight: 2,
                    strokeColor: '#fff'
                }
            });
            
            marker.addListener('click', () => {
                onAgentNear(agent);
            });

            markersRef.current.push(marker);
        });
    }, [agents, apiIsLoaded]);

    return (
        <div className="w-full h-full relative">
            <div 
                ref={ref} 
                tabIndex={0}
                className="w-full h-full focus:outline-none" 
            />
            {/* Crosshair Overlay */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-white font-mono text-2xl">
                +
            </div>
            {/* Top Info Bar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur border border-sky-500/30 text-sky-400 px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(14,165,233,0.2)] pointer-events-none flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                Street Level Nav: Active
            </div>
        </div>
    );
}
