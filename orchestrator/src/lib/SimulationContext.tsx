'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Agent {
    id: string;
    lat: number;
    lng: number;
    isInteracting: boolean;
    sentimentScore?: number;
    role?: string;
    defaultTask?: string;
    lastEncounterDialogue?: string;
    lastUpdated?: string;
    [key: string]: any;
}

interface Encounter {
    id: string;
    participants: string[];
    transcript: string;
    timestamp: any;
    sentimentScore?: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface SimulationState {
    agents: Agent[];
    encounters: Encounter[];
    isLoading: boolean;
    error: string | null;
    connectionStatus: ConnectionStatus;
}

const SimulationContext = createContext<SimulationState>({
    agents: [],
    encounters: [],
    isLoading: true,
    error: null,
    connectionStatus: 'connecting',
});

export function SimulationProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [encounters, setEncounters] = useState<Encounter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;

        if (!enabled) {
            setConnectionStatus('disconnected');
            return;
        }

        setConnectionStatus('connecting');

        // Real-time listener for agents collection
        const agentsRef = collection(db, 'agents');
        const unsubAgents = onSnapshot(
            agentsRef,
            (snapshot) => {
                if (!isMounted.current) return;
                const agentData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                } as Agent));
                setAgents(agentData);
                setConnectionStatus('connected');
                setError(null);
                setIsLoading(false);
            },
            (err) => {
                if (!isMounted.current) return;
                console.error('Firestore agents listener error:', err);
                setConnectionStatus('disconnected');
                setError(err.message ?? 'Lost connection to Firestore');
                setIsLoading(false);
            }
        );

        // Real-time listener for encounters collection (latest 50)
        const encountersRef = collection(db, 'encounters');
        const encountersQuery = query(encountersRef, orderBy('timestamp', 'desc'), limit(50));
        const unsubEncounters = onSnapshot(
            encountersQuery,
            (snapshot) => {
                if (!isMounted.current) return;
                const encounterData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                } as Encounter));
                setEncounters(encounterData);
            },
            (err) => {
                if (!isMounted.current) return;
                console.error('Firestore encounters listener error:', err);
                // Don't override agent connection status if encounters fail separately
            }
        );

        return () => {
            isMounted.current = false;
            unsubAgents();
            unsubEncounters();
        };
    }, [enabled]);

    return (
        <SimulationContext.Provider value={{ agents, encounters, isLoading, error, connectionStatus }}>
            {children}
        </SimulationContext.Provider>
    );
}

export function useSimulation() {
    return useContext(SimulationContext);
}
