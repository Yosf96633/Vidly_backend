// middleware/featureRateLimiter.ts
import type { Request, Response, NextFunction } from "express";
import { redisClient } from "../config/rt-redis";
import { getUserIdentifier } from "../utils/getUserIdentifier";

interface RateLimitConfig {
  featureName: string;
  maxRequests: number;
  windowMs: number; // in milliseconds
}

export const featureRateLimiter = (config: RateLimitConfig) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdentifier(req);
      const key = `ratelimit:${config.featureName}:${userId}`;
      
      // Get current count
      const current = await redisClient.get(key);
      const currentCount = current ? parseInt(current) : 0;

      // Check if limit exceeded
      if (currentCount >= config.maxRequests) {
        const ttl = await redisClient.ttl(key);
        
        return res.status(429).json({
          success: false,
          message: `Rate limit exceeded for ${config.featureName}`,
          limit: config.maxRequests,
          remaining: 0,
          resetIn: ttl > 0 ? ttl : Math.floor(config.windowMs / 1000),
          resetInHuman: formatTime(ttl > 0 ? ttl : Math.floor(config.windowMs / 1000)),
        });
      }

      // Increment counter
      const newCount = await redisClient.incr(key);
      
      // Set expiry only on first request
      if (newCount === 1) {
        await redisClient.expire(key, Math.floor(config.windowMs / 1000));
      }

      // Get TTL for response
      const ttl = await redisClient.ttl(key);
      const remaining = config.maxRequests - newCount;

      // Attach info to response headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", ttl);

      // Attach to locals for use in route handlers
      res.locals.rateLimit = {
        limit: config.maxRequests,
        remaining,
        resetIn: ttl,
      };

      next();
    } catch (error) {
      console.error("Rate limiter error:", error);
      // Fail open - allow request on error
      next();
    }
  };
};

// Helper function to format time
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}