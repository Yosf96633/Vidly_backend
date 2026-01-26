import { Router } from "express";
import { ideaValidatorController } from "../controllers/validate.controller.js";

const router = Router();

// POST /api/validate-idea
// Rate limited: 2 requests per 24 hours
router.post(
  "/validate-idea",
  (req, res) => ideaValidatorController.validateIdea(req, res)
);

export default router;