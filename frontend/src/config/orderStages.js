export const CLIENT_ORDER_STAGES = [
    { key: 'new', labelKey: 'stageNew', icon: '🕐' },
    { key: 'awaiting_signature', labelKey: 'stageAwaitingSignature', icon: '✍️' },
    { key: 'awaiting_quotes', labelKey: 'stageAwaitingQuotes', icon: '₽' },
    { key: 'quotes_ready', labelKey: 'stageQuotesReady', icon: '₽' },
    { key: 'processing', labelKey: 'stageProcessing', icon: '⚙️' },
    { key: 'production', labelKey: 'stageProduction', icon: '🏭' },
    { key: 'in_delivery', labelKey: 'stageDelivery', icon: '🚚' },
    { key: 'done', labelKey: 'stageDone', icon: '✅' },
];

export const ORDER_STAGES = [
    { key: 'new', textKey: 'statusNew', color: 'bg-white/10 text-gray-400 border-white/10', icon: '🕐' },
    { key: 'awaiting_signature', textKey: 'statusAwaitingSignature', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: '✎' },
    { key: 'awaiting_quotes', textKey: 'statusAwaitingQuotes', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: '₽' },
    { key: 'quotes_ready', textKey: 'statusQuotesReady', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '₽' },
    { key: 'processing', textKey: 'statusProcessing', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '⚙️' },
    { key: 'production', textKey: 'statusProduction', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: '🏭' },
    { key: 'in_delivery', textKey: 'statusDelivery', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '🚚' },
    { key: 'done', textKey: 'statusDone', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✅' },
];

export const PRODUCTION_STAGES = ORDER_STAGES.filter(stage => (
    ['awaiting_quotes', 'quotes_ready', 'processing', 'production', 'in_delivery', 'done'].includes(stage.key)
));

export const ORDER_STAGE_INDEX = Object.fromEntries(ORDER_STAGES.map((stage, index) => [stage.key, index]));
export const CLIENT_ORDER_STAGE_INDEX = Object.fromEntries(CLIENT_ORDER_STAGES.map((stage, index) => [stage.key, index]));
export const PRODUCTION_STAGE_INDEX = Object.fromEntries(PRODUCTION_STAGES.map((stage, index) => [stage.key, index]));
