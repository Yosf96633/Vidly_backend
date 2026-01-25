import { resend, emailConfig } from "../config/resend";
import { generateFeedbackEmailTemplate } from "../templates/feedbackEmailTemplate.ts";
import Feedback from "../models/Feedback";
import type { IFeedback } from "../models/Feedback";
import mongoose from "mongoose";
import type { FeedbackEmailData } from "../templates/feedbackEmailTemplate.ts";
interface FeedbackData {
  rating: number;
  tool: string;
  feedback: string;
  email?: string;
  userAgent?: string;
  ipAddress?: string;
}

interface FeedbackServiceResponse {
  success: boolean;
  feedbackId?: string;
  error?: string;
  savedToDB?: boolean;
  emailSent?: boolean;
}

interface FeedbackStats {
  totalSubmissions: number;
  averageRating: number;
  toolBreakdown: Record<string, number>;
  recentSubmissions: Array<{
    rating: number;
    tool: string;
    feedback: string;
    createdAt: Date;
  }>;
}

export class FeedbackService {
  /**
   * Process and save feedback to database, then send email notification
   */
  async processFeedback(data: FeedbackData): Promise<FeedbackServiceResponse> {
    let savedFeedback: IFeedback | null = null;
    let emailSent = false;

    try {
      const { rating, tool, feedback, email, userAgent, ipAddress } = data;

      const emailData: FeedbackEmailData = {
        rating,
        tool,
        feedback,
        email: email!,
      };

      console.log("📥 Processing feedback for tool:", tool);
      console.log(
        "📊 MongoDB connection state:",
        mongoose.connection.readyState,
      );
      // Connection states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

      // Verify MongoDB connection before attempting to save
      if (mongoose.connection.readyState !== 1) {
        throw new Error(
          "Database connection not established. Please ensure MongoDB is connected.",
        );
      }

      // 1. Save to MongoDB Atlas
      console.log("💾 Attempting to save feedback to database...");

      savedFeedback = await Feedback.create({
        rating,
        tool,
        feedback,
        email: email || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
      });
      if (!savedFeedback) {
        return {
          success: false,
        };
      }

      // 2. Try to send email notification (don't fail the whole process if email fails)
      try {
        console.log("📧 Attempting to send email notification...");

        const emailHtml = generateFeedbackEmailTemplate(emailData);

        const response = await resend.emails.send({
          from: emailConfig.from,
          to: emailConfig.to,
          subject: `New Feedback: ${tool} (${rating}★)`,
          html: emailHtml,
          replyTo: email || emailConfig.from,
        });
        emailSent = true;
      } catch (emailError) {
        console.warn(
          "⚠️ Email sending failed, but feedback was saved to database:",
          emailError,
        );
        // Don't throw - we still want to return success since DB save worked
      }

      return {
        success: true,
        feedbackId: savedFeedback._id.toString(),
        savedToDB: true,
        emailSent,
      };
    } catch (error) {
      console.error("❌ Error in processFeedback:", error);

      // Handle MongoDB validation errors
      if (error instanceof Error && error.name === "ValidationError") {
        const validationError = error as mongoose.Error.ValidationError;
        const errorMessages = Object.values(validationError.errors).map(
          (err) => err.message,
        );

        return {
          success: false,
          error: `Validation failed: ${errorMessages.join(", ")}`,
          savedToDB: false,
          emailSent: false,
        };
      }

      // Handle MongoDB duplicate key errors
      if (
        error instanceof Error &&
        "code" in error &&
        (error as any).code === 11000
      ) {
        return {
          success: false,
          error: "Duplicate feedback entry detected",
          savedToDB: false,
          emailSent: false,
        };
      }

      // Handle MongoDB connection errors
      if (error instanceof Error && error.message.includes("connection")) {
        return {
          success: false,
          error: "Database connection error. Please try again later.",
          savedToDB: false,
          emailSent: false,
        };
      }

      // Generic error handler
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown database error occurred",
        savedToDB: false,
        emailSent: false,
      };
    }
  }

  /**
   * Validate feedback data before processing
   */
  validateFeedbackData(data: FeedbackData): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    console.log("Data in validateFeedbackData : ", data);
    // Validate rating
    if (!data.rating || typeof data.rating !== "number") {
      errors.push("Rating is required and must be a number");
    } else if (data.rating < 1 || data.rating > 5) {
      errors.push("Rating must be between 1 and 5");
    }

    // Validate tool
    if (!data.tool || typeof data.tool !== "string") {
      errors.push("Tool selection is required");
    } else if (data.tool.trim().length === 0) {
      errors.push("Tool selection cannot be empty");
    }

    // Validate feedback text
    if (!data.feedback || typeof data.feedback !== "string") {
      errors.push("Feedback text is required");
    } else if (data.feedback.trim().length === 0) {
      errors.push("Feedback text cannot be empty");
    } else if (data.feedback.trim().length < 10) {
      errors.push("Feedback must be at least 10 characters long");
    } else if (data.feedback.trim().length > 2000) {
      errors.push("Feedback must not exceed 2000 characters");
    }

    // Validate email (optional field)
    if (data.email && data.email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email.trim())) {
        errors.push("Invalid email format");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get comprehensive feedback statistics from the database
   */
  async getFeedbackStatistics(): Promise<FeedbackStats> {
    try {
      console.log("📊 Fetching feedback statistics...");

      // Check database connection
      if (mongoose.connection.readyState !== 1) {
        throw new Error("Database connection not established");
      }

      // Get total number of feedback submissions
      const totalSubmissions = await Feedback.countDocuments();
      console.log(`Total submissions: ${totalSubmissions}`);

      // Calculate average rating across all feedback
      const averageRatingResult = await Feedback.aggregate([
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
          },
        },
      ]);
      const averageRating = averageRatingResult[0]?.averageRating || 0;

      // Get breakdown of feedback count by tool
      const toolBreakdownResult = await Feedback.aggregate([
        {
          $group: {
            _id: "$tool",
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 }, // Sort by count descending
        },
      ]);

      const toolBreakdown: Record<string, number> = {};
      toolBreakdownResult.forEach((item) => {
        toolBreakdown[item._id] = item.count;
      });

      // Get 10 most recent feedback submissions
      const recentSubmissions = await Feedback.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("rating tool feedback createdAt")
        .lean();

      console.log("✅ Successfully retrieved feedback statistics");

      return {
        totalSubmissions,
        averageRating: parseFloat(averageRating.toFixed(2)),
        toolBreakdown,
        recentSubmissions: recentSubmissions.map((sub) => ({
          rating: sub.rating,
          tool: sub.tool,
          feedback: sub.feedback,
          createdAt: sub.createdAt,
        })),
      };
    } catch (error) {
      console.error("❌ Error getting feedback statistics:", error);
      throw new Error(
        error instanceof Error
          ? `Failed to retrieve statistics: ${error.message}`
          : "Failed to retrieve feedback statistics",
      );
    }
  }

  /**
   * Get feedback by ID
   */
  async getFeedbackById(feedbackId: string): Promise<IFeedback | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
        throw new Error("Invalid feedback ID format");
      }

      const feedback = await Feedback.findById(feedbackId);
      return feedback;
    } catch (error) {
      console.error("❌ Error getting feedback by ID:", error);
      throw error;
    }
  }

  /**
   * Get all feedback with optional filtering and pagination
   */
  async getAllFeedback(options?: {
    tool?: string;
    rating?: number;
    limit?: number;
    skip?: number;
  }): Promise<IFeedback[]> {
    try {
      const query: any = {};

      if (options?.tool) {
        query.tool = options.tool;
      }

      if (options?.rating) {
        query.rating = options.rating;
      }

      const feedback = await Feedback.find(query)
        .sort({ createdAt: -1 })
        .limit(options?.limit || 50)
        .skip(options?.skip || 0)
        .lean();

      return feedback;
    } catch (error) {
      console.error("❌ Error getting all feedback:", error);
      throw error;
    }
  }

  /**
   * Delete feedback by ID (for admin purposes)
   */
  async deleteFeedback(feedbackId: string): Promise<boolean> {
    try {
      if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
        throw new Error("Invalid feedback ID format");
      }

      const result = await Feedback.findByIdAndDelete(feedbackId);
      return result !== null;
    } catch (error) {
      console.error("❌ Error deleting feedback:", error);
      throw error;
    }
  }

  /**
   * Check database connection status
   */
  getDatabaseStatus(): {
    isConnected: boolean;
    state: string;
    dbName: string;
    host: string;
  } {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const readyState = mongoose.connection.readyState;

    return {
      isConnected: readyState === 1,
      state: states[readyState] ?? "",
      dbName: mongoose.connection.name || "N/A",
      host: mongoose.connection.host || "N/A",
    };
  }
}

// Export singleton instance
export const feedbackService = new FeedbackService();
