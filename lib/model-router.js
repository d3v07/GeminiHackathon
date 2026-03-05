const MODELS = {
    flash: 'gemini-2.5-flash-preview-05-20',
    pro: 'gemini-2.5-pro-preview-05-06',
};

const PLANNING_KEYWORDS = [
    'plan', 'decide', 'strategy', 'evaluate', 'choose',
    'analyze', 'reason', 'compare', 'prioritize', 'goal',
];

function selectModel(context) {
    if (context?.forceModel) return MODELS[context.forceModel] || context.forceModel;

    // Route to Pro for complex reasoning tasks
    if (context?.taskType === 'planning') return MODELS.pro;
    if (context?.taskType === 'encounter') return MODELS.pro;

    // Check message content for planning signals
    if (context?.lastMessage) {
        const lower = context.lastMessage.toLowerCase();
        const planningScore = PLANNING_KEYWORDS.filter(k => lower.includes(k)).length;
        if (planningScore >= 2) return MODELS.pro;
    }

    // Default: Flash for dialogue, observation, tool calling
    return MODELS.flash;
}

module.exports = { selectModel, MODELS };
