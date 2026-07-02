const startAt = Date.now();
const counters = {
  totalRequests: 0,
  chatRequests: 0,
  chatSuccess: 0,
  chatFallbacks: 0,
  errors: 0,
  providerCalls: {}
};

function increment(key, n = 1) {
  if (!Object.prototype.hasOwnProperty.call(counters, key)) counters[key] = 0;
  counters[key] = Number(counters[key] || 0) + Number(n || 1);
}

function incProvider(name) {
  const key = String(name || 'local').toLowerCase();
  if (!counters.providerCalls[key]) counters.providerCalls[key] = 0;
  counters.providerCalls[key] += 1;
}

function snapshot() {
  return {
    uptimeMs: Date.now() - startAt,
    startedAt: new Date(startAt).toISOString(),
    counters: JSON.parse(JSON.stringify(counters)),
    memory: process && process.memoryUsage ? process.memoryUsage() : {}
  };
}

module.exports = {
  increment,
  incProvider,
  snapshot
};
