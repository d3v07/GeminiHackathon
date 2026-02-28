require('dotenv').config();
const { Connection, Client } = require('@temporalio/client');

async function run() {
    // Step 2: Temporal Client triggering the NPC cognitive loop Workflow
    const connection = await Connection.connect({ address: 'localhost:7233' });
    const client = new Client({ connection });

    const historianState = {
        lat: 40.7580, lng: -73.9855, // Times Square
        role: "Underground Historian",
        history: []
    };

    console.log("=== STARTING TEMPORAL WORKFLOW FOR NPC ===");
    const handle = await client.workflow.start('npcLoop', {
        args: ['npc_hero_1', historianState],
        taskQueue: 'npc-simulation',
        workflowId: 'npc-loop-workflow-npc_hero_1',
    });

    console.log(`Started NPC Workflow: ${handle.workflowId} on Temporal server.`);
}

// ==============================================
// TEST EXECUTION
// ==============================================
if (require.main === module) {
    run().catch((err) => {
        console.error("Failed to start workflow:", err);
        process.exit(1);
    });
}

module.exports = { run };
