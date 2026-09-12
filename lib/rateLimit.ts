import prisma from "@/lib/prisma";

interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * DB-backed sliding-window rate limiter. `key` should identify the action +
 * actor, e.g. `checkin:${userId}` or `createProject:${userId}`.
 *
 * Not perfectly atomic under heavy concurrency, but that's an acceptable
 * tradeoff here — this guards against accidental spam/double-taps and buggy
 * loops, not a determined attacker.
 */
export async function checkRateLimit(
  key: string,
  { maxAttempts, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
  const now = new Date();
  const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (!existing) {
    await prisma.rateLimitBucket.create({ data: { key, count: 1, windowStart: now } });
    return { allowed: true };
  }

  const windowElapsedMs = now.getTime() - existing.windowStart.getTime();

  if (windowElapsedMs > windowMs) {
    await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: 1, windowStart: now },
    });
    return { allowed: true };
  }

  if (existing.count >= maxAttempts) {
    return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - windowElapsedMs) / 1000) };
  }

  await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return { allowed: true };
}
