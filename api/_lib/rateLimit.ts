import {Ratelimit} from '@upstash/ratelimit';
import {Redis} from '@upstash/redis';

const DEFAULT_LIMIT = 10;
const WINDOW = '1 m';

let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    limiter = null;
    return limiter;
  }
  const parsed = Number.parseInt(process.env.GEMINI_TIP_RATE_LIMIT ?? '', 10);
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
  limiter = new Ratelimit({
    redis: new Redis({url, token}),
    limiter: Ratelimit.slidingWindow(limit, WINDOW),
    prefix: 'arcane-alignment:gemini-tip',
    analytics: false,
  });
  return limiter;
}

export function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');
}

export type RateLimitResult =
  | {ok: true; limit?: number; remaining?: number; reset?: number}
  | {ok: false; status: 429 | 503; reset?: number};

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const rl = getLimiter();
  if (!rl) {
    // Fail closed in production; allow unlimited in local/preview dev.
    return isProduction() ? {ok: false, status: 503} : {ok: true};
  }
  try {
    const {success, limit, remaining, reset} = await rl.limit(ip);
    return success ? {ok: true, limit, remaining, reset} : {ok: false, status: 429, reset};
  } catch (error) {
    console.error('Rate limiter unavailable:', error);
    return isProduction() ? {ok: false, status: 503} : {ok: true};
  }
}

export function getClientIp(headers: Record<string, string | string[] | undefined> | undefined): string {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const forwarded = pick(headers?.['x-forwarded-for']);
  const ip = forwarded?.split(',')[0]?.trim() || pick(headers?.['x-real-ip'])?.trim();
  return ip || 'unknown';
}
