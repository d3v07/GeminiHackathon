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

const demoAgents: Agent[] = [
    {
        id: 'agent_wall_st_historian',
        lat: 40.7064,
        lng: -74.0094,
        isInteracting: true,
        sentimentScore: 0.62,
        role: 'Wall Street Historian',
        defaultTask: 'Compare trading-floor folklore with today\'s rush-hour crowd patterns.',
        lastEncounterDialogue: 'The exchange bell used to organize a whole neighborhood. Now the neighborhood organizes itself around notifications.',
        lastUpdated: new Date().toISOString()
    },
    {
        id: 'agent_jazz_busker',
        lat: 40.7308,
        lng: -73.9973,
        isInteracting: false,
        sentimentScore: 0.38,
        role: 'Village Jazz Musician',
        defaultTask: 'Track evening foot traffic and decide where the next set should happen.',
        lastEncounterDialogue: 'A subway grate has better rhythm than half the clubs after midnight.',
        lastUpdated: new Date().toISOString()
    },
    {
        id: 'agent_dumpling_owner',
        lat: 40.7158,
        lng: -73.9970,
        isInteracting: true,
        sentimentScore: -0.18,
        role: 'Chinatown Dumpling Owner',
        defaultTask: 'Restock sesame oil while weighing the lunch rush against supplier delays.',
        lastEncounterDialogue: 'If the line is long, the soup is honest. If the line is short, I worry.',
        lastUpdated: new Date().toISOString()
    },
    {
        id: 'agent_startup_founder',
        lat: 40.7411,
        lng: -73.9897,
        isInteracting: false,
        sentimentScore: 0.12,
        role: 'Flatiron Founder',
        defaultTask: 'Walk between investor meetings and search for a quieter product insight.',
        lastUpdated: new Date().toISOString()
    },
    {
        id: 'agent_brooklyn_ghost',
        lat: 40.7049,
        lng: -73.9867,
        isInteracting: false,
        sentimentScore: -0.44,
        role: 'Brooklyn Bridge Ghost',
        defaultTask: 'Drift along the bridge path and remember names from old ferry manifests.',
        lastEncounterDialogue: 'Some crossings are engineering. Some are apology.',
        lastUpdated: new Date().toISOString()
    }
];

const demoEncounters: Encounter[] = [
    {
        id: 'encounter_001',
        participants: ['agent_wall_st_historian', 'agent_dumpling_owner'],
        transcript: 'Historian: "Markets remember panic." Owner: "Kitchens do too. You can taste it when the broth gets rushed."',
        timestamp: new Date().toISOString(),
        sentimentScore: 0.44
    },
    {
        id: 'encounter_002',
        participants: ['agent_jazz_busker', 'agent_startup_founder'],
        transcript: 'Busker: "You keep pitching velocity." Founder: "You keep proving timing matters more."',
        timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        sentimentScore: 0.27
    },
    {
        id: 'encounter_003',
        participants: ['agent_brooklyn_ghost', 'agent_wall_st_historian'],
        transcript: 'Ghost: "The bridge hums differently when people stop looking at the water." Historian: "That is the city changing its evidence."',
        timestamp: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
        sentimentScore: -0.16
    }
];

export function SimulationProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [encounters, setEncounters] = useState<Encounter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
    const eventSourceRef = useRef<EventSource | null>(null);
    const encountersIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const publicDemo = process.env.NEXT_PUBLIC_METROPOLIS_PUBLIC_DEMO === 'true' || process.env.METROPOLIS_PUBLIC_DEMO === 'true';

    useEffect(() => {
        if (publicDemo) {
            setAgents(demoAgents);
            setEncounters(demoEncounters);
            setIsLoading(false);
            setError(null);
            setConnectionStatus('connected');
            return;
        }

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
