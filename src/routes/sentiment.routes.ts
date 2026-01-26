import { Router } from "express";
import {
  analyzeVideo,
  getData,
  getStatus,
} from "../controllers/sentiment.controller.js";
import { commentAnalyzerLimiter } from "../middleware/featureLimiters.js";

const router = Router();
// POST /api/video/analyze - Submit video for sentiment analysis
// Rate limited: 2 requests per 24 hours
router.post("/analyze" , commentAnalyzerLimiter ,analyzeVideo);
// GET /api/video/status/:jobId - Get analysis status
// Higher rate limit for status checks
router.get("/status/:jobId", getStatus);
// GET /api/video/:jobId - Get analysis data
router.get("/:jobId", getData);

export default router;
