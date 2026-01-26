// routes/usage.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { redisClient } from "../config/rt-redis";
import { getUserIdentifier } from "../utils/getUserIdentifier";

const router = Router();

// 1. GET /api/usage/summary - Overall usage summary
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdentifier(req);

    const features = [
      { name: "comment-analyzer", maxPerDay: 2 },
      { name: "idea-validator", maxPerDay: 2 },
      { name: "viral-search", maxPerDay: 2 },
    ];

    let totalUsed = 0;
    let totalRemaining = 0;

    for (const feature of features) {
      const key = `ratelimit:${feature.name}:${userId}`;
      const current = await redisClient.get(key);
      const currentCount = current ? parseInt(current) : 0;
      
      totalUsed += currentCount;
      totalRemaining += Math.max(0, feature.maxPerDay - currentCount);
    }

    res.json({
      success: true,
      summary: {
        totalUsed,
        totalRemaining,
        totalAllowed: 6,
        percentageUsed: Math.round((totalUsed / 6) * 100),
      },
    });
  } catch (error) {
    console.error("Usage summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch usage summary",
    });
  }
});

// 2. GET /api/usage/comment-analyzer - Comment Analyzer usage
router.get("/comment-analyzer", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdentifier(req);
    const featureName = "comment-analyzer";
    const maxPerDay = 2;

    const key = `ratelimit:${featureName}:${userId}`;
    const current = await redisClient.get(key);
    const currentCount = current ? parseInt(current) : 0;
    const ttl = await redisClient.ttl(key);

    res.json({
      success: true,
      feature: {
        name: featureName,
        displayName: "Comment Analyzer",
        used: currentCount,
        remaining: Math.max(0, maxPerDay - currentCount),
        limit: maxPerDay,
        resetIn: ttl > 0 ? ttl : null,
        resetInHuman: ttl > 0 ? formatTime(ttl) : "Not started",
        isExhausted: currentCount >= maxPerDay,
      },
    });
  } catch (error) {
    console.error("Comment analyzer usage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch comment analyzer usage",
    });
  }
});

// 3. GET /api/usage/idea-validator - Idea Validator usage
router.get("/idea-validator", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdentifier(req);
    const featureName = "idea-validator";
    const maxPerDay = 2;

    const key = `ratelimit:${featureName}:${userId}`;
    const current = await redisClient.get(key);
    const currentCount = current ? parseInt(current) : 0;
    const ttl = await redisClient.ttl(key);

    res.json({
      success: true,
      feature: {
        name: featureName,
        displayName: "Idea Validator",
        used: currentCount,
        remaining: Math.max(0, maxPerDay - currentCount),
        limit: maxPerDay,
        resetIn: ttl > 0 ? ttl : null,
        resetInHuman: ttl > 0 ? formatTime(ttl) : "Not started",
        isExhausted: currentCount >= maxPerDay,
      },
    });
  } catch (error) {
    console.error("Idea validator usage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch idea validator usage",
    });
  }
});

// 4. GET /api/usage/viral-search - Topic Finder usage
router.get("/viral-search", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdentifier(req);
    const featureName = "viral-search";
    const maxPerDay = 2;

    const key = `ratelimit:${featureName}:${userId}`;
    const current = await redisClient.get(key);
    const currentCount = current ? parseInt(current) : 0;
    const ttl = await redisClient.ttl(key);

    res.json({
      success: true,
      feature: {
        name: featureName,
        displayName: "Viral Search",
        used: currentCount,
        remaining: Math.max(0, maxPerDay - currentCount),
        limit: maxPerDay,
        resetIn: ttl > 0 ? ttl : null,
        resetInHuman: ttl > 0 ? formatTime(ttl) : "Not started",
        isExhausted: currentCount >= maxPerDay,
      },
    });
  } catch (error) {
    console.error("Viral search usage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch viral search usage",
    });
  }
});

// Helper function
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

export default router;