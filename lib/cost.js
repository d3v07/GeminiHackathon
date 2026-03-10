// Gemini pricing per 1M tokens (USD)
const PRICING = {
    'gemini-2.5-flash-preview-05-20': { input: 0.15, output: 0.60 },
    'gemini-2.5-pro-preview-05-06':   { input: 1.25, output: 10.00 },
};

function calculateCost(model, inputTokens, outputTokens) {
    const prices = PRICING[model] || PRICING['gemini-2.5-flash-preview-05-20'];
    const inputCost  = (inputTokens / 1_000_000)  * prices.input;
    const outputCost = (outputTokens / 1_000_000) * prices.output;
    return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

module.exports = { calculateCost, PRICING };
