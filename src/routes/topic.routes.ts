import { Router } from "express";
import topicController from '../controllers/topic.controller.js';
import { rateLimiters } from "../middleware/rate-limiter.middleware.js";
import { validate } from "../middleware/security.middleware.js";
import { searchAdvancedSchema } from "../schemas/validation.schemas.js";

const router = Router();

// GET /api/topics/search-advanced
// Rate limited: 2 requests per 24 hours
router.get(
  '/search-advanced',
  rateLimiters.dailyLimit,
  validate(searchAdvancedSchema),
  topicController.searchVideosAdvanced
);

export default router;