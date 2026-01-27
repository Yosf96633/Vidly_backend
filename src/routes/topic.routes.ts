import { Router } from "express";
import topicController from "../controllers/topic.controller";
import { viralSearchLimiter } from "../middleware/featureLimiters";

const router = Router();

// GET /api/topics/search-advanced
// Rate limited: 2 requests per 24 hours
router.get(
  "/search-advanced",
  viralSearchLimiter,
  topicController.searchVideosAdvanced,
);

export default router;
