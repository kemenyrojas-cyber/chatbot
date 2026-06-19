function createRateLimiter(options = {}) {
  const enabled = options.enabled !== false;
  const windowMs = Math.max(1000, Number(options.windowMs || 60000));
  const maxRequests = Math.max(1, Number(options.maxRequests || 30));
  const bucketLimit = Math.max(100, Number(options.bucketLimit || 10000));
  const buckets = new Map();

  function getClientKey(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
    const email = String(req.body?.email || req.query?.email || '').trim().toLowerCase();
    return email ? `${ip}:${email}` : ip;
  }

  function cleanup(now) {
    if (buckets.size <= bucketLimit) return;
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
      if (buckets.size <= bucketLimit) break;
    }
  }

  return function rateLimiter(req, res, next) {
    if (!enabled) return next();

    const now = Date.now();
    cleanup(now);
    const key = getClientKey(req);
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, maxRequests - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Demasiadas consultas en poco tiempo. Intenta nuevamente en unos segundos.',
        retryAfter
      });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter
};
