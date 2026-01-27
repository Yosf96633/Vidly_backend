// src/middlewares/rate-limiter.middleware.ts
import express from "express";
import { Redis } from "ioredis";
import { redisConnection } from "../config/redis";
import crypto from "crypto";

type Request = express.Request;
type Response = express.Response;
type NextFunction = (err?: any) => void;

// Initialize Redis client
const redis = new Redis(redisConnection);

redis.on('connect', () => {
  console.log('✅ Rate Limiter Redis Connected');
});

redis.on('error', (err) => {
  console.error('❌ Rate Limiter Redis Error:', err);
});

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number; // in milliseconds
  message?: string;
  skipSuccessfulRequests?: boolean;
}

/**
 * Generate a unique fingerprint for the user
 * Combines IP address and User-Agent for better uniqueness
 */
function generateUserFingerprint(req: Request): string {
  // Get real IP (considering proxies like Render)
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded 
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]?.trim() || 'unknown')
    : req.socket.remoteAddress || 'unknown';
  
  // Get user agent
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Create a hash of IP + User-Agent for privacy
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${ip}-${userAgent}`)
    .digest('hex');
  
  return fingerprint;
}

/**
 * Rate limiter middleware factory
 * Limits users to X requests per time window
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    maxRequests,
    windowMs,
    message = `Rate limit exceeded. You can only make ${maxRequests} requests per ${windowMs / (1000 * 60 * 60)} hours.`,
    skipSuccessfulRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate user fingerprint
      const userFingerprint = generateUserFingerprint(req);
      const key = `rate-limit:${userFingerprint}:${req.path}`;

      // Get current count
      const current = await redis.get(key);
      const count = current ? parseInt(current, 10) : 0;

      // Check if limit exceeded
      if (count >= maxRequests) {
        const ttl = await redis.ttl(key);
        const resetTime = new Date(Date.now() + ttl * 1000);
        
        res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message,
          retryAfter: ttl,
          resetAt: resetTime.toISOString(),
          limit: maxRequests,
          remaining: 0,
        });
        return;
      }

      // Increment counter
      if (!skipSuccessfulRequests) {
        // Increment immediately
        await incrementCounter(key, windowMs);
      } else {
        // Store reference to increment after successful response
        res.on('finish', async () => {
          if (res.statusCode < 400) {
            await incrementCounter(key, windowMs);
          }
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count - 1).toString());
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // On error, allow the request to proceed (fail-open)
      next();
    }
  };
}

/**
 * Helper function to increment counter with expiry
 */
async function incrementCounter(key: string, windowMs: number): Promise<void> {
  const multi = redis.multi();
  multi.incr(key);
  multi.pexpire(key, windowMs);
  await multi.exec();
}

/**
 * Preset rate limiters for common use cases
 */
export const rateLimiters = {
  // 2 requests per 24 hours (for your MVP features)
  dailyLimit: createRateLimiter({
    maxRequests: 2,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    message: 'Daily limit reached. You can use this feature 2 times per day. Please try again tomorrow.',
  }),

  // 10 requests per hour (for less critical endpoints)
  hourlyLimit: createRateLimiter({
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  }),

  // 100 requests per hour (for status checks, etc.)
  statusCheckLimit: createRateLimiter({
    maxRequests: 100,
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: true,
  }),
};

/**
 * Reset rate limit for a specific user (admin function)
 */
export async function resetUserLimit(req: Request, path: string): Promise<boolean> {
  try {
    const userFingerprint = generateUserFingerprint(req);
    const key = `rate-limit:${userFingerprint}:${path}`;
    const result = await redis.del(key);
    return result > 0;
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    return false;
  }
}

/**
 * Get remaining requests for a user
 */
export async function getRemainingRequests(
  req: Request,
  path: string,
  maxRequests: number
): Promise<{ remaining: number; resetAt: Date | null }> {
  try {
    const userFingerprint = generateUserFingerprint(req);
    const key = `rate-limit:${userFingerprint}:${path}`;
    
    const current = await redis.get(key);
    const count = current ? parseInt(current, 10) : 0;
    const remaining = Math.max(0, maxRequests - count);
    
    const ttl = await redis.ttl(key);
    const resetAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : null;
    
    return { remaining, resetAt };
  } catch (error) {
    console.error('Error getting remaining requests:', error);
    return { remaining: maxRequests, resetAt: null };
  }
}