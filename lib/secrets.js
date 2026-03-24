const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const PRODUCTION_SECRET_NAMES = [
    'GEMINI_API_KEY',
    'FIREBASE_PRIVATE_KEY',
    'PINECONE_API_KEY',
    'UPSTASH_REDIS_REST_TOKEN',
    'CLERK_SECRET_KEY',
];

let secretManagerClient = null;

function isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.ENV === 'prod';
}

function getProjectId() {
    return process.env.GCP_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
}

function getSecretManagerClient() {
    if (!secretManagerClient) {
        secretManagerClient = new SecretManagerServiceClient();
    }

    return secretManagerClient;
}

async function readSecretFromManager(name) {
    const projectId = getProjectId();
    if (!projectId) {
        throw new Error(`Missing project id for secret ${name}`);
    }

    const client = getSecretManagerClient();
    const secretPath = `projects/${projectId}/secrets/${name}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name: secretPath });
    const payload = version.payload?.data?.toString();

    if (!payload) {
        throw new Error(`Secret ${name} resolved without payload`);
    }

    return payload;
}

async function getRuntimeSecret(name, options = {}) {
    const { required = true } = options;
    const envValue = process.env[name];
    if (envValue) {
        return envValue;
    }

    if (!isProduction()) {
        if (required) {
            throw new Error(`Missing local secret env var: ${name}`);
        }
        return undefined;
    }

    const secretValue = await readSecretFromManager(name);
    if (!secretValue && required) {
        throw new Error(`Missing production secret: ${name}`);
    }

    return secretValue;
}

async function loadRuntimeSecrets(names = PRODUCTION_SECRET_NAMES) {
    const entries = await Promise.all(
        names.map(async (name) => [name, await getRuntimeSecret(name)]),
    );

    return Object.fromEntries(entries);
}

module.exports = {
    PRODUCTION_SECRET_NAMES,
    getRuntimeSecret,
    loadRuntimeSecrets,
};
