const { Worker } = require('@temporalio/worker');
const http = require('http');
const activities = require('./activities');

async function run() {
    const worker = await Worker.create({
        workflowsPath: require.resolve('./workflows'),
        activities,
        taskQueue: 'npc-simulation',
    });

    // Healthcheck HTTP server for Docker/K8s liveness probes
    const health = http.createServer((_, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
    });
    health.listen(8080, '0.0.0.0');

    console.log('Worker listening on task queue: npc-simulation');
    await worker.run();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
