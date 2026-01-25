// src/services/langgraph.service.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END } from "@langchain/langgraph";
import { z } from "zod";
import { socketService } from "./socket.service";
import type { YouTubeComment } from "./youtube.service";
import { config } from "dotenv";
config();

// ========================================
// API KEY ROTATION & LOAD BALANCING
// ========================================

const API_KEYS = [
  process.env.GEMINI_API_KEY1!,
  process.env.GEMINI_API_KEY2!,
  process.env.GEMINI_API_KEY3!,
  process.env.GEMINI_API_KEY4!,
  process.env.GEMINI_API_KEY5!,
  process.env.GEMINI_API_KEY6!,
  process.env.GEMINI_API_KEY7!,
  process.env.GEMINI_API_KEY8!,
].filter(Boolean);

// Validate API keys on startup
if (API_KEYS.length === 0) {
  throw new Error(
    "❌ No API keys found! Please configure GEMINI_API_KEY environment variables.",
  );
}

console.log(`🔑 Loaded ${API_KEYS.length} API keys for load balancing`);

// Thread-safe key rotation
class APIKeyRotator {
  private currentIndex = 0;

  getNextKey(): string {
    const key = API_KEYS[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % API_KEYS.length;
    return key!;
  }

  getKeyForWorker(workerIndex: number): string {
    return API_KEYS[workerIndex % API_KEYS.length]!;
  }
}

const keyRotator = new APIKeyRotator();

// Create model with specific API key
function createModel(
  schema: any,
  apiKey: string,
  modelName: string = "gemini-2.5-flash",
) {
  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: apiKey,
  }).withStructuredOutput(schema);
}

// Helper to emit when parallel tasks start
function emitParallelTasksStart(
  jobId: string,
  videoId: string,
  tasks: string[],
) {
  if (jobId) {
    socketService.emitProgress({
      jobId,
      videoId,
      stage: "analyzing_parallel",
      message: `Running parallel analysis: ${tasks.join(", ")}`,
      percentage: 65,
      data: { parallelTasks: tasks },
      timestamp: Date.now(),
    });
  }
}

// ========================================
// SCHEMAS
// ========================================

const CommentSentimentSchema = z.object({
  comment: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
});

const BatchSentimentSchema = z.object({
  results: z.array(CommentSentimentSchema),
});

const ThingsLovedSchema = z.object({
  loved_aspects: z.array(
    z.object({
      aspect: z.string().describe("What viewers loved"),
      reason: z.string().describe("Why it resonated"),
      mention_count: z.number().describe("Approximate number of mentions"),
      example_comments: z
        .array(z.string())
        .describe("2-3 representative quotes"),
    }),
  ),
});

const ImprovementSchema = z.object({
  improvements: z.array(
    z.object({
      issue: z.string().describe("Problem identified"),
      suggestion: z.string().describe("How to fix it"),
      severity: z.enum(["minor", "moderate", "critical"]),
      mention_count: z.number().describe("How many mentioned this"),
      example_comments: z.array(z.string()).describe("2-3 example quotes"),
    }),
  ),
});

const EmotionsSchema = z.object({
  emotions: z.array(
    z.object({
      emotion: z
        .string()
        .describe("Emotion name (e.g., Entertained, Inspired)"),
      percentage: z
        .number()
        .describe("Percentage of comments showing this emotion"),
      triggers: z.array(z.string()).describe("What caused this emotion"),
    }),
  ),
});

const PatternsSchema = z.object({
  positive_patterns: z.array(
    z.object({
      theme: z.string(),
      mention_count: z.number(),
      keywords: z.array(z.string()),
    }),
  ),
  negative_patterns: z.array(
    z.object({
      theme: z.string(),
      mention_count: z.number(),
      keywords: z.array(z.string()),
    }),
  ),
  neutral_patterns: z.array(
    z.object({
      theme: z.string(),
      mention_count: z.number(),
      keywords: z.array(z.string()),
    }),
  ),
});

const WantMoreSchema = z.object({
  content_requests: z.array(
    z.object({
      request_type: z
        .string()
        .describe("What they want (e.g., Part 2, Tutorial)"),
      count: z.number().describe("Number of requests"),
      examples: z.array(z.string()).describe("Example comments"),
    }),
  ),
  expansion_requests: z.array(
    z.object({
      timestamp_or_topic: z.string().describe("What part to expand"),
      count: z.number(),
      examples: z.array(z.string()),
    }),
  ),
  missing_topics: z.array(
    z.object({
      topic: z.string().describe("What wasn't covered but asked about"),
      question_count: z.number(),
      examples: z.array(z.string()),
    }),
  ),
});

type CommentSentiment = z.infer<typeof CommentSentimentSchema>;

// ========================================
// STATE INTERFACE
// ========================================

interface AnalysisState {
  videoId: string;
  comments: YouTubeComment[];
  transcript: string;
  hasTranscript: boolean;
  classifiedComments: CommentSentiment[];
  positiveComments: CommentSentiment[];
  negativeComments: CommentSentiment[];
  neutralComments: CommentSentiment[];
  thingsLoved?: any;
  improvements?: any;
  emotions?: any;
  patterns?: any;
  wantMore?: any;
  summary?: {
    positive: { count: number; percentage: number };
    negative: { count: number; percentage: number };
    neutral: { count: number; percentage: number };
  };
  totalProcessed?: number;
}

// ========================================
// HELPER: SMART TEXT TRUNCATION
// ========================================

function smartTruncate(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// ========================================
// BATCH PROCESSING WITH WORKER POOL
// ========================================

interface BatchJob {
  batch: YouTubeComment[];
  batchNumber: number;
  totalBatches: number;
  transcript: string;
  hasTranscript: boolean;
  retryCount: number;
}

async function processSingleBatch(
  job: BatchJob,
  apiKey: string,
): Promise<CommentSentiment[]> {
  const {
    batch,
    batchNumber,
    totalBatches,
    transcript,
    hasTranscript,
    retryCount,
  } = job;

  console.log(
    `📊 Processing batch ${batchNumber}/${totalBatches} (${
      batch.length
    } comments, retry: ${retryCount}) with key ${apiKey.slice(-8)}`,
  );

  try {
    const model = createModel(BatchSentimentSchema, apiKey);

    const commentsText = batch
      .map((c, idx) => {
        const cleanText = c.text
          .replace(/[\n\r]/g, " ")
          .replace(/"/g, "'")
          .trim();

        return `${idx + 1}. ${smartTruncate(cleanText, 150)}`;
      })
      .join("\n");

    const contextPrompt = hasTranscript
      ? `Video Context:\n${smartTruncate(transcript, 1500)}\n\n`
      : "";

    const prompt = `${contextPrompt}Classify each comment as positive, negative, or neutral.

Positive: Supportive, appreciative, constructive praise
Negative: Critical, complaints, hostile
Neutral: Questions, facts, no clear sentiment

Comments:
${commentsText}`;

    const validated = await model.invoke(prompt);
    console.log(
      `✅ Batch ${batchNumber} completed (${validated.results.length} classified)`,
    );

    return validated.results;
  } catch (error: any) {
    console.error(`❌ Error in batch ${batchNumber}:`, error.message);
    throw error; // Re-throw to be handled by worker pool
  }
}

// ========================================
// OPTIMIZED WORKER POOL WITH ROLLING EXECUTION
// ========================================

async function processWithWorkerPool(
  allBatches: YouTubeComment[][],
  transcript: string,
  hasTranscript: boolean,
  maxConcurrentWorkers: number,
  jobId?: string, // ✅ ADD this parameter
  videoId?: string, // ✅ ADD this parameter
): Promise<CommentSentiment[]> {
  const totalBatches = allBatches.length;
  const allResults: CommentSentiment[] = [];

  // Create job queue
  const jobQueue: BatchJob[] = allBatches.map((batch, idx) => ({
    batch,
    batchNumber: idx + 1,
    totalBatches,
    transcript,
    hasTranscript,
    retryCount: 0,
  }));

  // Track progress
  let completedBatches = 0;
  let failedBatches = 0;

  // Worker function - processes jobs until queue is empty
  const worker = async (workerId: number): Promise<void> => {
    const apiKey = keyRotator.getKeyForWorker(workerId);

    while (jobQueue.length > 0) {
      const job = jobQueue.shift(); // Get next job
      if (!job) break;

      try {
        const results = await processSingleBatch(job, apiKey);
        allResults.push(...results);
        completedBatches++;

        // ✅ ADD: Emit batch progress to socket
        // ✅ Emit batch progress to socket
        if (jobId && videoId) {
          const baseProgress = 40; // Start after initial setup
          const progressRange = 20; // 40% to 60%
          const progressPercentage =
            baseProgress +
            Math.floor((completedBatches / totalBatches) * progressRange);

          socketService.emitProgress({
            jobId,
            videoId,
            stage: "classifying_comments",
            message: `Classified ${completedBatches}/${totalBatches} batches`,
            percentage: progressPercentage,
            data: {
              batchNumber: completedBatches,
              totalBatches,
            },
            timestamp: Date.now(),
          });
        }

        console.log(
          `✨ Progress: ${completedBatches}/${totalBatches} batches completed`,
        );
      } catch (error: any) {
        // Handle retry logic
        if (job.batch.length > 10 && job.retryCount < 2) {
          // Split batch in half and retry
          const halfSize = Math.ceil(job.batch.length / 2);
          const firstHalf: BatchJob = {
            ...job,
            batch: job.batch.slice(0, halfSize),
            retryCount: job.retryCount + 1,
          };
          const secondHalf: BatchJob = {
            ...job,
            batch: job.batch.slice(halfSize),
            retryCount: job.retryCount + 1,
          };

          // Add back to queue
          jobQueue.push(firstHalf, secondHalf);
          console.log(
            `🔄 Batch ${job.batchNumber} split and re-queued (${firstHalf.batch.length} + ${secondHalf.batch.length} comments)`,
          );
        } else {
          // Max retries reached or batch too small
          failedBatches++;
          console.error(
            `❌ Batch ${job.batchNumber} permanently failed after ${job.retryCount} retries`,
          );
        }
      }
    }

    console.log(`🛑 Worker ${workerId} finished`);
  };

  // Start all workers
  const workers = Array.from({ length: maxConcurrentWorkers }, (_, i) =>
    worker(i),
  );
  await Promise.all(workers);

  console.log(
    `✅ All batches processed: ${completedBatches} successful, ${failedBatches} failed`,
  );

  return allResults;
}

// ========================================
// NODE 1: CLASSIFY COMMENTS (OPTIMIZED)
// ========================================

function calculateOptimalBatching(totalComments: number): {
  batchSize: number;
  numWorkers: number;
} {
  const MIN_BATCH_SIZE = 10;
  const MAX_WORKERS = 8;

  // Case 1: More than 4000 comments - use fixed batch size
  if (totalComments > 4000) {
    return {
      batchSize: 500,
      numWorkers: MAX_WORKERS,
    };
  }

  // Case 2: 4000 or fewer comments - divide into 8 batches
  const idealBatchSize = Math.ceil(totalComments / MAX_WORKERS);

  // Edge case: If batch size would be too small, reduce workers
  if (idealBatchSize < MIN_BATCH_SIZE) {
    const optimalWorkers = Math.max(
      1,
      Math.floor(totalComments / MIN_BATCH_SIZE),
    );
    const adjustedBatchSize = Math.ceil(totalComments / optimalWorkers);

    console.log(
      `⚙️ Small dataset: Using ${optimalWorkers} workers with ${adjustedBatchSize} comments per batch`,
    );

    return {
      batchSize: adjustedBatchSize,
      numWorkers: optimalWorkers,
    };
  }

  return {
    batchSize: idealBatchSize,
    numWorkers: MAX_WORKERS,
  };
}

async function classifyCommentsNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  const totalComments = state.comments.length;

  // Handle edge case: No comments
  if (totalComments === 0) {
    console.log("⚠️ No comments to process");
    return { classifiedComments: [] };
  }

  // Calculate optimal batching strategy
  const { batchSize, numWorkers } = calculateOptimalBatching(totalComments);

  console.log(`🚀 Processing ${totalComments} comments:`);
  console.log(`   📦 Batch size: ${batchSize}`);
  console.log(`   👷 Concurrent workers: ${numWorkers}`);
  console.log(`   🔑 API keys available: ${API_KEYS.length}`);

  // Create batches
  const batches: YouTubeComment[][] = [];
  for (let i = 0; i < totalComments; i += batchSize) {
    batches.push(state.comments.slice(i, i + batchSize));
  }

  console.log(`📊 Created ${batches.length} batches`);

  // ✅ MODIFY: Process with worker pool - pass videoId for socket progress
  const allClassified = await processWithWorkerPool(
    batches,
    state.transcript,
    state.hasTranscript,
    numWorkers,
    undefined, // jobId will be in closure from buildAnalysisGraph
    state.videoId, // ✅ Pass videoId for socket emissions
  );

  console.log(
    `✅ Classified ${allClassified.length}/${totalComments} comments`,
  );

  // Warn if significant data loss
  const successRate = (allClassified.length / totalComments) * 100;
  if (successRate < 95) {
    console.warn(
      `⚠️ Only ${successRate.toFixed(1)}% of comments successfully classified`,
    );
  }

  return {
    classifiedComments: allClassified,
  };
}

// ========================================
// NODE 2: SEPARATE BY SENTIMENT
// ========================================

async function separateCommentsNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  const positive: CommentSentiment[] = [];
  const negative: CommentSentiment[] = [];
  const neutral: CommentSentiment[] = [];

  for (const comment of state.classifiedComments) {
    switch (comment.sentiment) {
      case "positive":
        positive.push(comment);
        break;
      case "negative":
        negative.push(comment);
        break;
      case "neutral":
        neutral.push(comment);
        break;
    }
  }

  console.log(
    `📊 Separated: ${positive.length} positive, ${negative.length} negative, ${neutral.length} neutral`,
  );

  return {
    positiveComments: positive,
    negativeComments: negative,
    neutralComments: neutral,
  };
}

// ========================================
// GROUP 1: COMMENT-ONLY ANALYSES (PARALLEL)
// ========================================

// NODE 3A: EMOTIONS (Comment-only)
async function analyzeEmotionsNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  console.log(`🎭 Analyzing audience emotions...`);

  if (state.classifiedComments.length === 0) {
    console.log("⚠️ No comments for emotion analysis");
    return { emotions: [] };
  }

  const model = createModel(EmotionsSchema, keyRotator.getNextKey());

  const sampleSize = Math.min(state.classifiedComments.length, 400);
  const sample = state.classifiedComments.slice(0, sampleSize);

  const commentsText = sample
    .map(
      (c, idx) =>
        `${idx + 1}. [${c.sentiment.toUpperCase()}] ${smartTruncate(
          c.comment,
          100,
        )}`,
    )
    .join("\n");

  const prompt = `Analyze the emotions expressed in these YouTube comments. Identify the top 4-6 emotions and what triggered them.

Focus on emotions like:
- Entertained/Amused
- Informed/Educated
- Inspired/Motivated
- Curious/Intrigued
- Confused/Overwhelmed
- Frustrated/Annoyed

For each emotion, provide percentage and triggers.

Comments:
${commentsText}`;

  try {
    const result = await model.invoke(prompt);
    console.log(`✅ Identified ${result.emotions.length} emotion types`);
    return { emotions: result.emotions };
  } catch (error: any) {
    console.error(`❌ Error analyzing emotions:`, error.message);
    return { emotions: [] };
  }
}

// NODE 3B: PATTERNS (Comment-only)
async function analyzePatternsNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  console.log(`🎨 Analyzing comment patterns and themes...`);

  const model = createModel(PatternsSchema, keyRotator.getNextKey());

  const positiveSample = state.positiveComments
    .slice(0, 200)
    .map((c) => c.comment)
    .join("\n");
  const negativeSample = state.negativeComments
    .slice(0, 100)
    .map((c) => c.comment)
    .join("\n");
  const neutralSample = state.neutralComments
    .slice(0, 100)
    .map((c) => c.comment)
    .join("\n");

  const prompt = `Identify the top recurring themes and patterns in these YouTube comments.

POSITIVE COMMENTS:
${positiveSample}

NEGATIVE COMMENTS:
${negativeSample}

NEUTRAL COMMENTS:
${neutralSample}

For each category, find 3-5 main themes with mention counts and keywords.`;

  try {
    const result = await model.invoke(prompt);
    console.log(
      `✅ Identified patterns: ${result.positive_patterns.length} positive, ${result.negative_patterns.length} negative, ${result.neutral_patterns.length} neutral`,
    );
    return { patterns: result };
  } catch (error: any) {
    console.error(`❌ Error analyzing patterns:`, error.message);
    return {
      patterns: {
        positive_patterns: [],
        negative_patterns: [],
        neutral_patterns: [],
      },
    };
  }
}

// ========================================
// GROUP 2: COMMENT+TRANSCRIPT ANALYSES (PARALLEL)
// ========================================

// NODE 4A: THINGS LOVED (Comment + Transcript)
async function analyzeThingsLovedNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  console.log(`💚 Analyzing what viewers loved...`);

  if (state.positiveComments.length === 0) {
    console.log("⚠️ No positive comments for loved analysis");
    return { thingsLoved: [] };
  }

  const model = createModel(ThingsLovedSchema, keyRotator.getNextKey());

  const sampleSize = Math.min(state.positiveComments.length, 300);
  const positiveSample = state.positiveComments.slice(0, sampleSize);

  const commentsText = positiveSample
    .map((c, idx) => `${idx + 1}. ${smartTruncate(c.comment, 120)}`)
    .join("\n");

  const contextPrompt = state.hasTranscript
    ? `Video Transcript Context:\n${smartTruncate(state.transcript, 2000)}\n\n`
    : "";

  const prompt = `${contextPrompt}Based on these positive comments, identify the top 3-5 things viewers loved most.

For each aspect:
- What specific element they loved
- Why it resonated (use transcript context if available)
- Approximate mention count
- 2-3 representative example comments

Positive comments:
${commentsText}`;

  try {
    const result = await model.invoke(prompt);
    console.log(`✅ Identified ${result.loved_aspects.length} loved aspects`);
    return { thingsLoved: result.loved_aspects };
  } catch (error: any) {
    console.error(`❌ Error analyzing loved aspects:`, error.message);
    return { thingsLoved: [] };
  }
}

// NODE 4B: IMPROVEMENTS (Comment + Transcript)
async function analyzeImprovementsNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  console.log(`🔧 Analyzing improvement suggestions...`);

  const criticalComments = [
    ...state.negativeComments,
    ...state.neutralComments.filter((c) => {
      const lower = c.comment.toLowerCase();
      return (
        lower.includes("but") ||
        lower.includes("however") ||
        lower.includes("could") ||
        lower.includes("should")
      );
    }),
  ];

  if (criticalComments.length === 0) {
    console.log("⚠️ No critical comments for improvement analysis");
    return { improvements: [] };
  }

  const model = createModel(ImprovementSchema, keyRotator.getNextKey());

  const sampleSize = Math.min(criticalComments.length, 250);
  const criticalSample = criticalComments.slice(0, sampleSize);

  const commentsText = criticalSample
    .map((c, idx) => `${idx + 1}. ${smartTruncate(c.comment, 120)}`)
    .join("\n");

  const contextPrompt = state.hasTranscript
    ? `Video Transcript Context:\n${smartTruncate(state.transcript, 2000)}\n\n`
    : "";

  const prompt = `${contextPrompt}Based on these critical/constructive comments, identify the top 3-5 improvement suggestions.

For each improvement:
- What issue/problem viewers identified
- Specific actionable suggestion
- Severity (minor, moderate, critical)
- Mention count
- 2-3 example comments

Critical comments:
${commentsText}`;

  try {
    const result = await model.invoke(prompt);
    console.log(
      `✅ Identified ${result.improvements.length} improvement areas`,
    );
    return { improvements: result.improvements };
  } catch (error: any) {
    console.error(`❌ Error analyzing improvements:`, error.message);
    return { improvements: [] };
  }
}

// NODE 4C: WHAT THEY WANT MORE OF (Comment + Transcript)
async function analyzeWantMoreNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  console.log(`💬 Analyzing what viewers want more of...`);

  const relevantComments = [
    ...state.positiveComments,
    ...state.neutralComments,
  ];

  if (relevantComments.length === 0) {
    console.log("⚠️ No comments for want more analysis");
    return {
      wantMore: {
        content_requests: [],
        expansion_requests: [],
        missing_topics: [],
      },
    };
  }

  const model = createModel(WantMoreSchema, keyRotator.getNextKey());

  const sampleSize = Math.min(relevantComments.length, 350);
  const sample = relevantComments.slice(0, sampleSize);

  const commentsText = sample
    .map((c, idx) => `${idx + 1}. ${smartTruncate(c.comment, 120)}`)
    .join("\n");

  const contextPrompt = state.hasTranscript
    ? `Video Transcript Context:\n${smartTruncate(state.transcript, 2000)}\n\n`
    : "";

  const prompt = `${contextPrompt}Analyze what viewers want more of based on these comments.

Identify:
1. CONTENT REQUESTS: Direct requests like "part 2", "more tutorials", "behind the scenes"
2. EXPANSION REQUESTS: Which parts of THIS video to elaborate (use transcript timestamps if available)
3. MISSING TOPICS: Questions that weren't answered in the video

For each category, provide counts and example comments.

Comments:
${commentsText}`;

  try {
    const result = await model.invoke(prompt);
    console.log(
      `✅ Identified ${result.content_requests.length} content requests, ${result.expansion_requests.length} expansion requests, ${result.missing_topics.length} missing topics`,
    );
    return { wantMore: result };
  } catch (error: any) {
    console.error(`❌ Error analyzing want more:`, error.message);
    return {
      wantMore: {
        content_requests: [],
        expansion_requests: [],
        missing_topics: [],
      },
    };
  }
}

// ========================================
// NODE 5: CALCULATE SUMMARY
// ========================================

async function calculateSummaryNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  const total = state.classifiedComments.length;

  if (total === 0) {
    console.log("⚠️ No comments to summarize");
    return {
      summary: {
        positive: { count: 0, percentage: 0 },
        negative: { count: 0, percentage: 0 },
        neutral: { count: 0, percentage: 0 },
      },
      totalProcessed: 0,
    };
  }

  const summary = {
    positive: {
      count: state.positiveComments.length,
      percentage: Math.round((state.positiveComments.length / total) * 100),
    },
    negative: {
      count: state.negativeComments.length,
      percentage: Math.round((state.negativeComments.length / total) * 100),
    },
    neutral: {
      count: state.neutralComments.length,
      percentage: Math.round((state.neutralComments.length / total) * 100),
    },
  };

  console.log(`✅ Summary calculated:`, summary);

  return {
    summary,
    totalProcessed: total,
  };
}

// ========================================
// BUILD WORKFLOW WITH PARALLEL EXECUTION
// ========================================

export function buildAnalysisGraph(jobId?: string) {
  const workflow = new StateGraph<AnalysisState>({
    channels: {
      videoId: null,
      comments: null,
      transcript: null,
      hasTranscript: null,
      classifiedComments: null,
      positiveComments: null,
      negativeComments: null,
      neutralComments: null,
      thingsLoved: null,
      improvements: null,
      emotions: null,
      patterns: null,
      wantMore: null,
      summary: null,
      totalProcessed: null,
    },
  });

  // ✅ Helper function to wrap nodes with progress tracking
  const wrapNodeWithProgress = (
    nodeFn: (state: AnalysisState) => Promise<Partial<AnalysisState>>,
    stage: string,
    message: string,
    percentage: number,
  ) => {
    return async (state: AnalysisState) => {
      if (jobId) {
        socketService.emitProgress({
          jobId,
          videoId: state.videoId,
          stage: stage as any,
          message,
          percentage,
          timestamp: Date.now(),
        });
      }
      return await nodeFn(state);
    };
  };

  // Add all nodes with progress tracking
  // Add all nodes with progress tracking
  workflow.addNode(
    "classify",
    wrapNodeWithProgress(
      classifyCommentsNode,
      "classifying_comments",
      "Classifying comments by sentiment...",
      40,
    ),
  );

  workflow.addNode(
    "separate",
    wrapNodeWithProgress(
      separateCommentsNode,
      "classifying_comments",
      "Separating comments by sentiment...",
      60,
    ),
  );


  workflow.addNode(
    "analyze_emotions",
    wrapNodeWithProgress(
      analyzeEmotionsNode,
      "analyzing_emotions",
      "Analyzing audience emotions...",
      70,
    ),
  );

  workflow.addNode(
    "analyze_patterns",
    wrapNodeWithProgress(
      analyzePatternsNode,
      "analyzing_patterns",
      "Analyzing audience pattern...",
      70,
    ),
  );

  workflow.addNode(
    "analyze_loved",
    wrapNodeWithProgress(
      analyzeThingsLovedNode,
      "analyzing_loved",
      "Analyzing what viewers loved...",
      80,
    ),
  );

  workflow.addNode(
    "analyze_improvements",
    wrapNodeWithProgress(
      analyzeImprovementsNode,
      "analyzing_improvements",
      "Identifying improvement suggestions...",
      85,
    ),
  );

  workflow.addNode(
    "analyze_wantMore",
    wrapNodeWithProgress(
      analyzeWantMoreNode,
      "analyzing_wantMore",
      "Analyzing what viwers want...",
      70,
    ),
  );

  workflow.addNode(
    "summarize",
    wrapNodeWithProgress(
      calculateSummaryNode,
      "summarizing",
      "Generating final summary...",
      95,
    ),
  );
  
  // Define workflow edges
  workflow.addEdge("__start__" as any, "classify" as any);
  workflow.addEdge("classify" as any, "separate" as any);

  // ✨ ALL ANALYSES RUN IN PARALLEL after separation
  workflow.addEdge("separate" as any, "analyze_emotions" as any);
  workflow.addEdge("separate" as any, "analyze_patterns" as any);
  workflow.addEdge("separate" as any, "analyze_loved" as any);
  workflow.addEdge("separate" as any, "analyze_improvements" as any);
  workflow.addEdge("separate" as any, "analyze_wantMore" as any);

  workflow.addEdge("analyze_emotions" as any, "summarize" as any);
  workflow.addEdge("analyze_patterns" as any, "summarize" as any);
  workflow.addEdge("analyze_loved" as any, "summarize" as any);
  workflow.addEdge("analyze_improvements" as any, "summarize" as any);
  workflow.addEdge("analyze_wantMore" as any, "summarize" as any);

  workflow.addEdge("summarize" as any, END as any);

  return workflow.compile();
}

// ========================================
// EXECUTE WORKFLOW
// ========================================
export async function executeAnalysisWorkflow(
  videoId: string,
  comments: YouTubeComment[],
  transcript: string,
  hasTranscript: boolean,
  jobId?: string, // ✅ ADD this optional parameter
) {
  const graph = buildAnalysisGraph(jobId); // ✅ Pass jobId to graph

  const initialState: AnalysisState = {
    videoId,
    comments,
    transcript,
    hasTranscript,
    classifiedComments: [],
    positiveComments: [],
    negativeComments: [],
    neutralComments: [],
  };

  console.log(`🚀 Starting multi-feature workflow for video ${videoId}`);
  console.log(`📝 Total comments: ${comments.length}`);
  console.log(`🔑 Using ${API_KEYS.length} API keys for parallel processing`);

  // ✅ ADD: Emit initial progress
  if (jobId) {
    socketService.emitProgress({
      jobId,
      videoId,
      stage: "classifying_comments",
      message: `Starting analysis of ${comments.length} comments with ${API_KEYS.length} API keys`,
      percentage: 35,
      timestamp: Date.now(),
    });
  }

  const startTime = Date.now();
  const result = await graph.invoke(initialState as any);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`✅ Complete workflow finished in ${duration}s`);

  return {
    summary: result.summary!,
    thingsLoved: result.thingsLoved || [],
    improvements: result.improvements || [],
    emotions: result.emotions || [],
    patterns: result.patterns || {
      positive_patterns: [],
      negative_patterns: [],
      neutral_patterns: [],
    },
    wantMore: result.wantMore || {
      content_requests: [],
      expansion_requests: [],
      missing_topics: [],
    },
    totalProcessed: result.totalProcessed!,
    hasTranscript,
    processingTime: duration,
  };
}
