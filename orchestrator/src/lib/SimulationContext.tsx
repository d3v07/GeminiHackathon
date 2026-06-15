'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

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
    [key: string]: unknown;
}

interface Encounter {
    id: string;
    participants: string[];
    transcript: string;
    timestamp: unknown;
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
    const eventSourceRef = useRef<EventSource | null>(null);
    const encountersIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!enabled) {
            queueMicrotask(() => setConnectionStatus('disconnected'));
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (encountersIntervalRef.current) clearInterval(encountersIntervalRef.current);
            return;
        }

        queueMicrotask(() => setConnectionStatus('connecting'));

        const connectSSE = () => {
            const es = new EventSource('/api/agents/stream');
            eventSourceRef.current = es;

            es.onopen = () => {
                setConnectionStatus('connected');
                setError(null);
            };

            es.onmessage = (event) => {
                try {
                    const data: unknown = JSON.parse(event.data);
                    if (data && Array.isArray(data)) {
                        setAgents(data);
                        setIsLoading(false);
                    }
                } catch (e) {
                    console.error("Failed to parse SSE data", e);
                }
            };

            es.onerror = (e) => {
                console.error('SSE Error:', e);
                setConnectionStatus('disconnected');
                setError('Live stream connection lost. Attempting reconnect...');
                es.close();
                
                // Fallback reconnect after 5s
                setTimeout(() => {
                    if (enabled) connectSSE();
                }, 5000);
            };
        };

        connectSSE();

        // Encounters polling fallback since SSE is specifically for agents
        const fetchEncounters = async () => {
            try {
                const res = await fetch('/api/encounters/history?limit=50');
                if (res.ok) {
                    const data: unknown = await res.json();
                    if (!Array.isArray(data)) return;
                    setEncounters(data);
                }
            } catch (err) {
                console.error("Failed fetching encounters history:", err);
            }
        };

        fetchEncounters();
        encountersIntervalRef.current = setInterval(fetchEncounters, 5000);

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
            if (encountersIntervalRef.current) clearInterval(encountersIntervalRef.current);
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
