import { Router } from "express";
import { analyzeVideo, getData, getStatus } from "../controllers/sentiment.controller.js";
import { rateLimiters } from "../middleware/rate-limiter.middleware.js";
import { validate } from "../middleware/security.middleware.js";
import { analyzeVideoSchema, jobIdSchema } from "../schemas/validation.schemas.js";

const router = Router();

// POST /api/video/analyze - Submit video for sentiment analysis
// Rate limited: 2 requests per 24 hours
router.post(
  '/analyze',
  rateLimiters.dailyLimit,
  validate(analyzeVideoSchema),
  analyzeVideo
);

// GET /api/video/status/:jobId - Get analysis status
// Higher rate limit for status checks
router.get(
  '/status/:jobId',
  rateLimiters.statusCheckLimit,
  validate(jobIdSchema),
  getStatus
);

// GET /api/video/:jobId - Get analysis data
router.get(
  '/:jobId',
  rateLimiters.statusCheckLimit,
  validate(jobIdSchema),
  getData
);

export default router;