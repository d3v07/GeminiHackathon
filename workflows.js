const { proxyActivities, sleep, log } = require('@temporalio/workflow');

const activities = proxyActivities({
    startToCloseTimeout: '2 minutes',
    retry: {
        initialInterval: '5s',
        backoffCoefficient: 2,
        maximumAttempts: 3
    }
});


const systemInstruction = `
Your game board is the real NYC. You must autonomously decide your next location based on 
environmental factors like the current weather.
- If it is raining, you prefer indoor historical locations (e.g., a historic speakeasy, grand central terminal).
- If it is sunny, you might explore outdoor historical markers, parks, or old architecture.

You are not alone in the city. You have a tool called 'scan_for_nearby_agents'. You should frequently scan for other entities around you, and if you see someone interesting, use 'move_to_location' to intercept them!

You have access to live Google Search. Whenever you arrive at a new coordinate, search for recent news, events, or history related to this exact location in New York City and integrate it into your monologue.

You can recall your past experiences using 'recall_memories'. Use it to remember places you've visited, people you've met, and things you've observed.

You are acting in an asynchronous loop, constantly updating your state.
Whenever you decide to move, you MUST calculate the travel time.
`;

async function npcLoop(npcId, initialState, npcInstruction) {
    let currentState = {
        ...initialState,
        systemInstruction: npcInstruction || systemInstruction,
    };
    log.info(`[NPC: ${npcId}] Starting LangGraph cognitive loop. Role: ${currentState.role}`);

    while (true) {
        log.info(`[NPC: ${npcId}] Iteration at ${currentState.lat}, ${currentState.lng}`);

        try {
            // LangGraph cognitive step: perceive -> think -> act -> reflect
            const result = await activities.cognitiveStep(npcId, currentState);

            currentState.lat = result.lat;
            currentState.lng = result.lng;
            currentState.history = result.history;
            currentState.iteration = result.iteration;

            // Sync state to Firestore + check for encounters
            let pingResult = await activities.pingOrchestrator(npcId, currentState, result.currentAction);

            if (pingResult?.isInteracting && pingResult.agentA_state && pingResult.agentB_state) {
                await activities.handleEncounterDialogue(pingResult.agentA_state, pingResult.agentB_state);
            }
        } catch (e) {
            log.error(`[NPC: ${npcId}] Cognitive step error. Backing off 10s.`);
        }

        await sleep('20 seconds');
    }
}

module.exports = { npcLoop };
