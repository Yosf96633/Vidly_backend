// src/routes/usage.routes.ts (OPTIONAL - Add if you want users to check their usage)
import { Router, type Request, type Response } from "express";
import { getRemainingRequests } from "../middleware/rate-limiter.middleware";

const router = Router();

/**
 * GET /api/usage/status
 * Check remaining requests for all features
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const features = [
      { name: 'Sentiment Analysis', path: '/api/sentiment/analyze' },
      { name: 'Idea Validation', path: '/api/validate-idea' },
      { name: 'Topic Search', path: '/api/topics/search-advanced' },
    ];

    const maxDailyRequests = 2;
    const usageStatus = await Promise.all(
      features.map(async (feature) => {
        const { remaining, resetAt } = await getRemainingRequests(
          req,
          feature.path,
          maxDailyRequests
        );
        
        return {
          feature: feature.name,
          limit: maxDailyRequests,
          remaining,
          used: maxDailyRequests - remaining,
          resetAt: resetAt?.toISOString() || null,
        };
      })
    );

    res.json({
      success: true,
      data: usageStatus,
      message: 'Each feature can be used 2 times per day',
    });
  } catch (error) {
    console.error('Error fetching usage status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage status',
    });
  }
});

export default router;

// Add to app.ts:
// import usageRoutes from "./routes/usage.routes";
// app.use('/api/usage', usageRoutes);