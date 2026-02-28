'use client';

import React, { useEffect, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const NYC_CENTER = { lat: 40.7128, lng: -74.0060 };

interface Agent {
    id: string;
    lat: number;
    lng: number;
    isInteracting: boolean;
    defaultTask: string;
}

export default function MapUI() {
    const [agents, setAgents] = useState<Agent[]>([]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'agents'), (snapshot) => {
            const agentsData: Agent[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                agentsData.push({
                    id: doc.id,
                    lat: data.lat,
                    lng: data.lng,
                    isInteracting: data.isInteracting || false,
                    defaultTask: data.defaultTask || '',
                });
            });
            setAgents(agentsData);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="w-full h-full relative border-r border-gray-800 bg-gray-900">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
                <Map
                    defaultZoom={13}
                    defaultCenter={NYC_CENTER}
                    mapId="e8c5dcfe877a5b6d" // A custom dark mode Map ID usually generated in GCP, using a generic known format for aesthetics
                    disableDefaultUI={true}
                    style={{ width: '100%', height: '100%', filter: 'contrast(1.2) brightness(0.9) saturate(1.2)' }}
                >
                    {agents.map((agent) => (
                        <AdvancedMarker
                            key={agent.id}
                            position={{ lat: agent.lat, lng: agent.lng }}
                            title={`Agent: ${agent.id}\nTask: ${agent.defaultTask}`}
                        >
                            <div className={`relative w-6 h-6 rounded-full flex items-center justify-center ${agent.isInteracting ? 'bg-red-500' : 'bg-blue-500'}`}>
                                <div className={`absolute w-full h-full rounded-full ${agent.isInteracting ? 'bg-red-500' : 'bg-blue-500'} opacity-75 animate-ping`}></div>
                                <div className={`relative w-3 h-3 rounded-full ${agent.isInteracting ? 'bg-red-300' : 'bg-blue-300'}`}></div>
                            </div>
                        </AdvancedMarker>
                    ))}
                </Map>
            </APIProvider>
        </div>
    );
}
