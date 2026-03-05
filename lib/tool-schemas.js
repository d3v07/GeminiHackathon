const { z } = require('zod');

const WeatherResult = z.object({
    weather: z.string(),
    temperature: z.string(),
    windspeed: z.number().optional(),
    status: z.string().optional(),
    error: z.string().optional(),
});

const TravelTimeResult = z.object({
    estimated_minutes: z.number().optional(),
    status: z.string().optional(),
    error: z.string().optional(),
    response: z.any().optional(),
});

const StreetViewResult = z.object({
    base64: z.string(),
});

const PlaceResult = z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    rating: z.number().optional(),
    error: z.string().optional(),
});

const AgentScanResult = z.object({
    status: z.string(),
    message: z.string(),
    agents: z.array(z.object({
        id: z.string(),
        role: z.string(),
        distanceMeters: z.number(),
        lat: z.number(),
        lng: z.number(),
        currentTask: z.string(),
    })).optional(),
});

const MoveResult = z.object({
    status: z.string(),
    lat: z.number(),
    lng: z.number(),
    destination: z.string(),
});

const MemoryRecallResult = z.object({
    memories: z.array(z.object({
        text: z.string(),
        score: z.number(),
        type: z.string().optional(),
        timestamp: z.number().optional(),
    })),
});

const toolSchemas = {
    get_weather_mcp: WeatherResult,
    calculate_travel_time_mcp: TravelTimeResult,
    describe_surroundings: StreetViewResult,
    find_nearby_place_mcp: PlaceResult,
    scan_for_nearby_agents: AgentScanResult,
    move_to_location: MoveResult,
    recall_memories: MemoryRecallResult,
};

function validateToolOutput(toolName, data) {
    const schema = toolSchemas[toolName];
    if (!schema) return { valid: true, data };

    const result = schema.safeParse(data);
    if (result.success) return { valid: true, data: result.data };

    console.warn(`[Validation] ${toolName} output invalid:`, result.error.issues.map(i => i.message).join(', '));
    return { valid: false, data, errors: result.error.issues };
}

module.exports = { validateToolOutput, toolSchemas };
