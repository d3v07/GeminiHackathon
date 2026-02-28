'use client';

import React, { useEffect, useState } from 'react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
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
        <div className="w-full h-full relative border-r border-gray-700">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
                <Map
                    defaultZoom={13}
                    defaultCenter={NYC_CENTER}
                    mapId="nyc-hackathon-map"
                    disableDefaultUI={true}
                >
                    {agents.map((agent) => (
                        <Marker
                            key={agent.id}
                            position={{ lat: agent.lat, lng: agent.lng }}
                            title={`Agent: ${agent.id}\nTask: ${agent.defaultTask}`}
                            icon={agent.isInteracting ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png" : "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"}
                        />
                    ))}
                </Map>
            </APIProvider>
        </div>
    );
}
