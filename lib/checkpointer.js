require('dotenv').config();
const { BaseCheckpointSaver } = require('@langchain/langgraph');
const { Redis } = require('@upstash/redis');

const TTL_SECONDS = 86400; // 24h auto-cleanup

function redisKey(threadId, ns, checkpointId) {
    return `cp:${threadId}:${ns}:${checkpointId}`;
}

function writesKey(threadId, ns, checkpointId) {
    return `wr:${threadId}:${ns}:${checkpointId}`;
}

class UpstashCheckpointer extends BaseCheckpointSaver {
    constructor(config) {
        super();
        this.redis = new Redis({
            url: config?.url || process.env.UPSTASH_REDIS_REST_URL,
            token: config?.token || process.env.UPSTASH_REDIS_REST_TOKEN,
        });
    }

    async getTuple(config) {
        const threadId = config.configurable?.thread_id;
        const ns = config.configurable?.checkpoint_ns ?? '';
        const checkpointId = config.configurable?.checkpoint_id;

        if (!threadId) return undefined;

        let data;
        if (checkpointId) {
            data = await this.redis.get(redisKey(threadId, ns, checkpointId));
        } else {
            // Find latest checkpoint by scanning keys sorted desc
            const keys = await this.redis.keys(`cp:${threadId}:${ns}:*`);
            if (!keys.length) return undefined;
            keys.sort().reverse();
            data = await this.redis.get(keys[0]);
        }

        if (!data) return undefined;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;

        // Load pending writes
        const wKey = writesKey(threadId, ns, parsed.checkpoint.id);
        const rawWrites = await this.redis.get(wKey);
        const pendingWrites = rawWrites
            ? (typeof rawWrites === 'string' ? JSON.parse(rawWrites) : rawWrites)
            : [];

        const tuple = {
            config: {
                configurable: {
                    thread_id: threadId,
                    checkpoint_ns: ns,
                    checkpoint_id: parsed.checkpoint.id,
                },
            },
            checkpoint: parsed.checkpoint,
            metadata: parsed.metadata,
            pendingWrites,
        };

        if (parsed.parentCheckpointId) {
            tuple.parentConfig = {
                configurable: {
                    thread_id: threadId,
                    checkpoint_ns: ns,
                    checkpoint_id: parsed.parentCheckpointId,
                },
            };
        }

        return tuple;
    }

    async put(config, checkpoint, metadata) {
        const threadId = config.configurable?.thread_id;
        const ns = config.configurable?.checkpoint_ns ?? '';
        if (!threadId) throw new Error('thread_id required');

        const parentCheckpointId = config.configurable?.checkpoint_id;
        const key = redisKey(threadId, ns, checkpoint.id);

        await this.redis.set(key, JSON.stringify({
            checkpoint,
            metadata,
            parentCheckpointId,
        }));
        await this.redis.expire(key, TTL_SECONDS);

        return {
            configurable: {
                thread_id: threadId,
                checkpoint_ns: ns,
                checkpoint_id: checkpoint.id,
            },
        };
    }

    async putWrites(config, writes, taskId) {
        const threadId = config.configurable?.thread_id;
        const ns = config.configurable?.checkpoint_ns ?? '';
        const checkpointId = config.configurable?.checkpoint_id;
        if (!threadId || !checkpointId) return;

        const wKey = writesKey(threadId, ns, checkpointId);
        const existing = await this.redis.get(wKey);
        const arr = existing
            ? (typeof existing === 'string' ? JSON.parse(existing) : existing)
            : [];

        for (const [channel, value] of writes) {
            arr.push([taskId, channel, value]);
        }

        await this.redis.set(wKey, JSON.stringify(arr));
        await this.redis.expire(wKey, TTL_SECONDS);
    }

    async *list(config, options) {
        const threadId = config.configurable?.thread_id;
        const ns = config.configurable?.checkpoint_ns ?? '';
        const keys = await this.redis.keys(`cp:${threadId}:${ns}:*`);
        keys.sort().reverse();

        const limit = options?.limit ?? keys.length;
        for (let i = 0; i < Math.min(keys.length, limit); i++) {
            const data = await this.redis.get(keys[i]);
            if (!data) continue;
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            yield {
                config: {
                    configurable: {
                        thread_id: threadId,
                        checkpoint_ns: ns,
                        checkpoint_id: parsed.checkpoint.id,
                    },
                },
                checkpoint: parsed.checkpoint,
                metadata: parsed.metadata,
            };
        }
    }

    async deleteThread(threadId) {
        const cpKeys = await this.redis.keys(`cp:${threadId}:*`);
        const wrKeys = await this.redis.keys(`wr:${threadId}:*`);
        const allKeys = [...cpKeys, ...wrKeys];
        if (allKeys.length > 0) {
            await this.redis.del(...allKeys);
        }
    }
}

function createCheckpointer(config) {
    return new UpstashCheckpointer(config);
}

module.exports = { UpstashCheckpointer, createCheckpointer };
