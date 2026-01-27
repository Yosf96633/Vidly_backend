import { Router } from "express";
import { ideaValidatorController } from "../controllers/validate.controller";
import type { Request, Response } from "express";
import { ideaValidatorLimiter } from "../middleware/featureLimiters";
const router = Router();

// POST /api/validate-idea
// Rate limited: 2 requests per 24 hours
router.post("/validate-idea", ideaValidatorLimiter , (req: Request, res: Response) =>
  ideaValidatorController.validateIdea(req, res),
);

export default router;
