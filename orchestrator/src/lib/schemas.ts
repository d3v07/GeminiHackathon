import { z } from 'zod';

export const OrchestratorSchema = z.object({
    agentId: z.string().min(1).max(100),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    defaultTask: z.string().max(500).optional(),
    memoryContext: z.string().max(5000).optional(),
});

export const InteractSchema = z.object({
    agentId: z.string().min(1).max(100),
    message: z.string().min(1).max(1000),
    role: z.string().max(100).optional(),
});

export const TtsSchema = z.object({
    text: z.string().min(1).max(2000),
    role: z.string().max(100).optional(),
});

export const StreetviewSchema = z.object({
    lat: z.string().trim().min(1, 'Invalid latitude').refine((v) => {
        const n = Number(v);
        return !Number.isNaN(n) && n >= -90 && n <= 90;
    }, 'Invalid latitude'),
    lng: z.string().trim().min(1, 'Invalid longitude').refine((v) => {
        const n = Number(v);
        return !Number.isNaN(n) && n >= -180 && n <= 180;
    }, 'Invalid longitude'),
});
