import { env, isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Rate limiter with a Redis-backed production path and an in-memory fallback.
 *
 * Redis is Upstash's REST API, so no client dependency is needed: two env vars
 * (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) turn it on. In development,
 * or when Redis is unavailable, the in-memory sliding window is used. The
 * in-memory limiter is per-instance and is not a production guarantee.
 */

type RateLimitResult = { ok: boolean; retryAfterSec?: number };

type RateLimitRecord = {
  timestamps: number[];
  windowMs: number;
};

const store = new Map<string, RateLimitRecord>();

const REDIS_URL = env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

let hasWarnedAboutFallback = false;

function hasRedisConfig(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

// Clean up expired entries every 5 minutes. Each record carries the window it
// was created with — filtering on a hardcoded window would delete timestamps
// that are still inside a longer window and silently reset that limiter.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < record.windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

async function runRedisCommand(command: (string | number)[]): Promise<unknown> {
  const response = await fetch(REDIS_URL as string, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | { result?: unknown; error?: string }
    | null;

  if (!response.ok || payload?.error) {
    throw new Error(`Redis command failed: ${payload?.error ?? response.status}`);
  }

  return payload?.result;
}

/**
 * Fixed-window counter. INCR + PEXPIRE on the first hit is atomic enough for
 * rate limiting and works on Upstash's free tier.
 */
async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redisKey = `sellsnap:ratelimit:${key}`;
  const count = Number(await runRedisCommand(['INCR', redisKey]));

  if (count === 1) {
    await runRedisCommand(['PEXPIRE', redisKey, windowMs]);
  }

  if (count > limit) {
    const pttl = Number(await runRedisCommand(['PTTL', redisKey]));
    const retryAfterSec =
      Number.isFinite(pttl) && pttl > 0
        ? Math.ceil(pttl / 1000)
        : Math.ceil(windowMs / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  return { ok: true };
}

function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const record = store.get(key) ?? { timestamps: [], windowMs };

  // Filter timestamps within the current window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= limit) {
    const oldest = validTimestamps[0];
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  validTimestamps.push(now);
  store.set(key, { timestamps: validTimestamps, windowMs });

  return { ok: true };
}

export async function checkRateLimit(
  key: string,
  limit: number = 20,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  if (hasRedisConfig()) {
    try {
      return await checkRateLimitRedis(key, limit, windowMs);
    } catch (error) {
      if (!hasWarnedAboutFallback) {
        hasWarnedAboutFallback = true;
        logger.warn('rate_limit.redis_unavailable', { error });
      }
    }
  } else if (isProduction && !hasWarnedAboutFallback) {
    hasWarnedAboutFallback = true;
    logger.warn('rate_limit.memory_fallback', {
      reason: 'UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not configured',
    });
  }

  return checkRateLimitMemory(key, limit, windowMs);
}
