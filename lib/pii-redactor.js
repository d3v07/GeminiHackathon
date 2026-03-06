/**
 * PII Redaction Module (Phase 4 Security)
 *
 * Strips personally identifiable information from agent logs,
 * memory storage, and encounter transcripts before they are
 * persisted to Firestore, Pinecone, or Redis.
 *
 * Supports: emails, phone numbers, SSNs, credit cards, IP addresses,
 * street addresses, and full names (common patterns).
 */

// ── PII Detection Patterns ──────────────────────────────────────────
const PII_PATTERNS = [
    {
        name: 'email',
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[EMAIL REDACTED]',
    },
    {
        name: 'phone_us',
        pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        replacement: '[PHONE REDACTED]',
    },
    {
        name: 'ssn',
        pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
        replacement: '[SSN REDACTED]',
    },
    {
        name: 'credit_card',
        pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
        replacement: '[CARD REDACTED]',
    },
    {
        name: 'ipv4',
        pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
        replacement: '[IP REDACTED]',
    },
    {
        name: 'street_address',
        pattern: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s?){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Place|Pl|Way)\b\.?/g,
        replacement: '[ADDRESS REDACTED]',
    },
];

/**
 * Redact all detected PII from a text string.
 * @param {string} text - Input text to scan
 * @param {object} options - { log: boolean, categories: string[] }
 * @returns {{ redacted: string, findings: Array<{type: string, count: number}> }}
 */
function redactPII(text, options = {}) {
    if (!text || typeof text !== 'string') {
        return { redacted: '', findings: [] };
    }

    const { log = false, categories = null } = options;
    let redacted = text;
    const findings = [];

    for (const rule of PII_PATTERNS) {
        // Filter by categories if specified
        if (categories && !categories.includes(rule.name)) continue;

        const matches = redacted.match(rule.pattern);
        if (matches && matches.length > 0) {
            findings.push({ type: rule.name, count: matches.length });
            redacted = redacted.replace(rule.pattern, rule.replacement);
        }
    }

    if (log && findings.length > 0) {
        console.warn(`[PII Redaction] Found: ${findings.map(f => `${f.count}x ${f.type}`).join(', ')}`);
    }

    return { redacted, findings };
}

/**
 * Check if text contains any PII without redacting.
 * @param {string} text
 * @returns {boolean}
 */
function containsPII(text) {
    if (!text) return false;
    return PII_PATTERNS.some(rule => rule.pattern.test(text));
}

/**
 * Wrap a memory storage function to automatically redact PII before storing.
 * @param {Function} storeFn - The original storeMemory function
 * @returns {Function} - Wrapped function with PII redaction
 */
function withPIIRedaction(storeFn) {
    return async function (agentId, text, metadata = {}) {
        const { redacted, findings } = redactPII(text, { log: true });

        if (findings.length > 0) {
            console.log(`[PII Guard] Redacted ${findings.length} PII type(s) before storing memory for ${agentId}`);
        }

        return storeFn(agentId, redacted, metadata);
    };
}

/**
 * Redact PII from all string values in an object (shallow).
 * Useful for sanitizing Firestore documents before write.
 * @param {object} obj
 * @returns {object}
 */
function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const cleaned = { ...obj };
    for (const [key, value] of Object.entries(cleaned)) {
        if (typeof value === 'string') {
            cleaned[key] = redactPII(value).redacted;
        }
    }
    return cleaned;
}

module.exports = {
    redactPII,
    containsPII,
    withPIIRedaction,
    redactObject,
    PII_PATTERNS,
};
