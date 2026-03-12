const { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } = require('prom-client');

const register = new Registry();
collectDefaultMetrics({ register });

// Cognitive graph
const cognitiveSteps = new Counter({ name: 'cognitive_steps_total', help: 'Total cognitive steps executed', labelNames: ['agent_id'], registers: [register] });
const cognitiveStepDuration = new Histogram({ name: 'cognitive_step_duration_seconds', help: 'Cognitive step duration', labelNames: ['agent_id'], buckets: [0.5, 1, 2, 5, 10, 30], registers: [register] });
const activeWorkflows = new Gauge({ name: 'active_workflows', help: 'Currently running workflows', registers: [register] });

// Tool calls
const toolCalls = new Counter({ name: 'tool_calls_total', help: 'Total tool calls', labelNames: ['tool'], registers: [register] });
const toolErrors = new Counter({ name: 'tool_call_errors_total', help: 'Tool call errors', labelNames: ['tool'], registers: [register] });

// Gemini tokens
const geminiTokens = new Counter({ name: 'gemini_tokens_total', help: 'Gemini tokens used', labelNames: ['agent_id', 'model', 'direction'], registers: [register] });
const geminiCalls = new Counter({ name: 'gemini_calls_total', help: 'Total Gemini API calls', labelNames: ['agent_id', 'model'], registers: [register] });

// API routes (orchestrator)
const apiRequests = new Counter({ name: 'api_requests_total', help: 'API requests', labelNames: ['route', 'method', 'status'], registers: [register] });
const apiDuration = new Histogram({ name: 'api_request_duration_seconds', help: 'API request duration', labelNames: ['route'], buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [register] });

// Encounters
const encounterCount = new Counter({ name: 'encounters_total', help: 'Total encounters triggered', registers: [register] });

module.exports = {
    register,
    cognitiveSteps,
    cognitiveStepDuration,
    activeWorkflows,
    toolCalls,
    toolErrors,
    geminiTokens,
    geminiCalls,
    apiRequests,
    apiDuration,
    encounterCount,
};
