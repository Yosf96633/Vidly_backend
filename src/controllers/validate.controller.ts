// src/controllers/validate.controller.ts
import type { Request, Response } from "express";
import { validateIdeaService } from "../services/validate.service";
import { z } from "zod";
import { StreamWriter } from "../utils/streamWriter";

// ========================================
// REQUEST VALIDATION SCHEMA
// ========================================

const ValidateIdeaRequestSchema = z.object({
  idea: z
    .string()
    .min(10, "Idea must be at least 10 characters")
    .max(500, "Idea must be less than 500 characters"),
  targetAudience: z
    .string()
    .min(2, "Target audience is required")
    .max(100, "Target audience too long"),
  goal: z.string(),
});

type ValidateIdeaRequest = z.infer<typeof ValidateIdeaRequestSchema>;

export class IdeaValidatorController {
  async validateIdea(req: Request, res: Response): Promise<void> {
    try {
      // 1. Validate request body
      const validation = ValidateIdeaRequestSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: "Invalid request",
          details: validation.error.issues.map((err) => ({
            field: err.path?.join(".") || "unknown",
            message: err.message || "Validation error",
          })) || ["Unknown validation error"],
        });
        return;
      }

      const input: ValidateIdeaRequest = validation.data;

      console.log(`📝 Received validation request for: "${input.idea}"`);

      // 2. Create stream writer
      const streamWriter = new StreamWriter(res);
      console.log("✅ StreamWriter created");

      // 3. Send initial message
      streamWriter.log(`Starting validation for: "${input.idea}"`, "info");
      console.log("✅ Initial message sent");

      try {
        // 4. Call service with stream writer
        console.log("🚀 Calling validateIdeaService...");
        const result = await validateIdeaService(input, streamWriter);
        console.log("✅ Service completed");

        // 5. Send final result
        streamWriter.final({
          success: true,
          data: result,
        });
      } catch (serviceError: any) {
        console.error("❌ Service error:", serviceError);
        streamWriter.log(`Error: ${serviceError.message}`, "error");
        streamWriter.final({
          success: false,
          error: serviceError.message,
        });
      } finally {
        // 6. End stream
        streamWriter.end();
      }
    } catch (error: any) {
      console.error("❌ Error in validateIdea controller:", error);

      // If headers not sent yet, send error response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Validation failed",
          message: error.message || "An unexpected error occurred",
        });
      } else {
        // Headers already sent, just end the response
        res.end();
      }
    }
  }
}

export const ideaValidatorController = new IdeaValidatorController();
