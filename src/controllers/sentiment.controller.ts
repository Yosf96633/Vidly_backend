import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { videoAnalysisQueue, getJobStatus } from "../config/queue";
import youtubeService from "../services/youtube.service";

// POST /api/video/analyze - Submit video for analysis
export async function analyzeVideo(req: Request, res: Response) {
  try {
    const { videoUrl } = req.body;

    // Validation
    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        message: "Video URL is required",
      });
    }

    // Extract video ID from URL using the service instance method
    const videoId = youtubeService.extractVideoId(videoUrl); // ✅ Changed: Use service instance
    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "Invalid YouTube URL",
      });
    }

    // Generate unique job ID
    const jobId = uuidv4();

    // Add job to queue
    await videoAnalysisQueue.add(
      "analyze-video",
      {
        jobId,
        videoUrl,
        videoId,
      },
      {
        jobId,
        attempts: 1, // ✅ Only try once - don't retry user errors
        removeOnComplete: {
          age: 3600, // Remove after 1 hour
        },
        removeOnFail: {
          age: 86400, // Keep failed for 24 hours for debugging
        },
      },
    );

    // Return job ID immediately
    return res.status(202).json({
      success: true,
      message: "Video analysis started",
      data: {
        jobId,
        videoId,
        status: "pending",
      },
    });
  } catch (error: any) {
    console.error("Error creating analysis job:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to start video analysis",
      error: error.message,
    });
  }
}

// GET /api/video/status/:jobId - Get job Status
export async function getStatus(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    const status = await getJobStatus(jobId as string);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Job status not found!",
      });
    }

    return res.status(200).json({
      success: true,
      status: status.status,
    });
  } catch (error: any) {
    console.error("Error fetching job status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job status",
      error: error.message,
    });
  }
}

// GET /api/video/:jobId - Get job data
export async function getData(req: Request, res: Response) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    const status = await getJobStatus(jobId as string);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error("Error fetching job status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job data",
      error: error.message,
    });
  }
}
