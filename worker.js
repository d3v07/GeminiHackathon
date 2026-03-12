const { Worker } = require('@temporalio/worker');
const http = require('http');
const activities = require('./activities');
const logger = require('./lib/logger').child({ service: 'worker' });
const { register } = require('./lib/metrics');

function closeServer(server, name) {
    return new Promise((resolve) => {
        server.close((err) => {
            if (err) {
                logger.warn({ err, name }, 'Server close encountered an error');
            }
            resolve();
        });
    });
}

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
        } else if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    metricsServer.listen(9090, '0.0.0.0');

    let shutdownPromise = null;
    const shutdown = (signal) => {
        if (shutdownPromise) {
            return shutdownPromise;
        }

        logger.info({ signal }, 'Graceful shutdown requested');
        worker.shutdown();
        shutdownPromise = Promise.all([
            closeServer(health, 'health'),
            closeServer(metricsServer, 'metrics'),
        ]).then(() => {
            logger.info({ signal }, 'Worker infrastructure shutdown complete');
        });

        return shutdownPromise;
    };

    process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
        void shutdown('SIGINT');
    });

    logger.info({ taskQueue: 'npc-simulation', healthPort: 8080, metricsPort: 9090 }, 'Worker started');
    try {
        await worker.run();
    } finally {
        await (shutdownPromise || Promise.all([
            closeServer(health, 'health'),
            closeServer(metricsServer, 'metrics'),
        ]));
        logger.info('Worker shutdown complete');
    }
}

run().catch((err) => {
    logger.error({ err }, 'Worker fatal error');
    process.exit(1);
});
