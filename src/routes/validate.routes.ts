import { Router } from "express";
import { ideaValidatorController } from "../controllers/validate.controller.js";
import { rateLimiters } from "../middleware/rate-limiter.middleware.js";
import { validate } from "../middleware/security.middleware.js";
import { validateIdeaSchema } from "../schemas/validation.schemas.js";

const router = Router();

// POST /api/validate-idea
// Rate limited: 2 requests per 24 hours
router.post(
  "/validate-idea",
  rateLimiters.dailyLimit,
  validate(validateIdeaSchema),
  (req, res) => ideaValidatorController.validateIdea(req, res)
);

export default router;