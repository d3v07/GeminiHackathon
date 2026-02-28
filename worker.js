const { Worker } = require('@temporalio/worker');
const activities = require('./activities');

async function run() {
    // Step 2: Temporal Workflow Worker Wrapper
    const worker = await Worker.create({
        workflowsPath: require.resolve('./workflows'),
        activities,
        taskQueue: 'npc-simulation',
    });

    console.log('Worker listening on task queue: npc-simulation');
    await worker.run();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
