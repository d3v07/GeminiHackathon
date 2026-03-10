const { Worker } = require('@temporalio/worker');
const http = require('http');
const activities = require('./activities');
const logger = require('./lib/logger').child({ service: 'worker' });
const { register } = require('./lib/metrics');

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

    // Prometheus metrics endpoint
    const metricsServer = http.createServer(async (req, res) => {
        if (req.url === '/metrics') {
            res.writeHead(200, { 'Content-Type': register.contentType });
            res.end(await register.metrics());
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    metricsServer.listen(9090, '0.0.0.0');

    logger.info({ taskQueue: 'npc-simulation', healthPort: 8080, metricsPort: 9090 }, 'Worker started');
    await worker.run();
}

run().catch((err) => {
    logger.error({ err }, 'Worker fatal error');
    process.exit(1);
});
