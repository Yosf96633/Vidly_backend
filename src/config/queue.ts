import { Queue } from "bullmq";
import { redisConnection } from "./redis";
import Redis from "ioredis";

export interface VideoAnalysisJobData {
  jobId: string;
  videoUrl: string;
  videoId: string;
}

export interface VideoAnalysisResult {
  jobId: string;
  videoId: string;
  status: "pending" | "processing" | "completed" | "failed";
  summary?: {
    positive: { count: number; percentage: number };
    negative: { count: number; percentage: number };
    neutral: { count: number; percentage: number };
  };
  thingsLoved?: Array<{
    aspect: string;
    reason: string;
    mention_count: number;
    example_comments: string[];
  }>;
  improvements?: Array<{
    issue: string;
    suggestion: string;
    severity: "minor" | "moderate" | "critical";
    mention_count: number;
    example_comments: string[];
  }>;
  emotions?: Array<{
    emotion: string;
    percentage: number;
    triggers: string[];
  }>;
  patterns?: {
    positive_patterns: Array<{
      theme: string;
      mention_count: number;
      keywords: string[];
    }>;
    negative_patterns: Array<{
      theme: string;
      mention_count: number;
      keywords: string[];
    }>;
    neutral_patterns: Array<{
      theme: string;
      mention_count: number;
      keywords: string[];
    }>;
  };
  wantMore?: {
    content_requests: Array<{
      request_type: string;
      count: number;
      examples: string[];
    }>;
    expansion_requests: Array<{
      timestamp_or_topic: string;
      count: number;
      examples: string[];
    }>;
    missing_topics: Array<{
      topic: string;
      question_count: number;
      examples: string[];
    }>;
  };
  totalProcessed?: number;
  hasTranscript?: boolean;
  processingTime?: string;
  error?: string;
}

// Test Redis connection before creating queue
const testConnection = async () => {
  const redis = new Redis(redisConnection);

  try {
    await redis.ping();
    console.log("✅ Redis connection test successful");
    await redis.quit();
  } catch (error) {
    console.error("❌ Redis connection test failed:", error);
    throw error;
  }
};

testConnection();

// Create queue for video analysis jobs
export const videoAnalysisQueue = new Queue<VideoAnalysisJobData>(
  "video-analysis",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 100,
        age: 86400,
      },
      removeOnFail: {
        count: 50,
        age: 86400,
      },
    },
  },
);

videoAnalysisQueue.on("error", (err) => {
  console.error("❌ BullMQ Queue Error:", err.message);
});

videoAnalysisQueue.on("waiting", async (job) => {
  // Get the job details properly
  const jobDetails = typeof job === 'object' && job !== null 
    ? await videoAnalysisQueue.getJob(job.id || String(job))
    : await videoAnalysisQueue.getJob(String(job));
    
  console.log(`⏳ Job ${jobDetails?.id || job} is waiting`);
});
// Helper function to get job status
export async function getJobStatus(
  jobId: string,
): Promise<VideoAnalysisResult | null> {
  try {
    const job = await videoAnalysisQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      jobId: job.id as string,
      videoId: job.data.videoId,
      status:
        state === "completed"
          ? "completed"
          : state === "failed"
            ? "failed"
            : state === "active"
              ? "processing"
              : "pending",
      summary: job.returnvalue?.summary,
      thingsLoved: job.returnvalue?.thingsLoved,
      improvements: job.returnvalue?.improvements,
      emotions: job.returnvalue?.emotions,
      patterns: job.returnvalue?.patterns,
      wantMore: job.returnvalue?.wantMore,
      totalProcessed: job.returnvalue?.totalProcessed,
      hasTranscript: job.returnvalue?.hasTranscript,
      processingTime: job.returnvalue?.processingTime,
      error: job.failedReason,
    };
  } catch (error) {
    console.error("Error fetching job status:", error);
    return null;
  }
}
