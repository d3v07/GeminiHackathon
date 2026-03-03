'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

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

interface SimulationState {
    agents: Agent[];
    encounters: Encounter[];
    isLoading: boolean;
    error: string | null;
}

const SimulationContext = createContext<SimulationState>({
    agents: [],
    encounters: [],
    isLoading: true,
    error: null,
});

export function SimulationProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [encounters, setEncounters] = useState<Encounter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);

    const fetchState = useCallback(async () => {
        if (!enabled) return;
        try {
            const res = await fetch('/api/state');
            if (!res.ok) throw new Error(`State API returned ${res.status}`);
            const data = await res.json();
            if (!isMounted.current) return;
            setAgents(data.agents ?? []);
            setEncounters(data.encounters ?? []);
            setError(null);
            setIsLoading(false);
        } catch (e: any) {
            if (!isMounted.current) return;
            console.error('SimulationContext poll error:', e);
            setError(e.message ?? 'Failed to fetch simulation state');
            setIsLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        isMounted.current = true;
        fetchState();
        const interval = setInterval(fetchState, 1500);
        return () => {
            isMounted.current = false;
            clearInterval(interval);
        };
    }, [fetchState]);

    return (
        <SimulationContext.Provider value={{ agents, encounters, isLoading, error }}>
            {children}
        </SimulationContext.Provider>
    );
}

export function useSimulation() {
    return useContext(SimulationContext);
}
