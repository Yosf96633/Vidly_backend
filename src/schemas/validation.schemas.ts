// src/schemas/validation.schemas.ts
import { z } from "zod";

// ========================================
// API VALIDATION SCHEMAS (for rate limiting & security)
// ========================================

/**
 * Schema for Video Analysis Request
 */
export const analyzeVideoSchema = z.object({
  body: z.object({
    videoUrl: z.string()
      .url('Invalid YouTube URL')
      .refine(
        (url) => {
          const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
          return youtubeRegex.test(url);
        },
        { message: 'Must be a valid YouTube URL' }
      ),
    options: z.object({
      maxComments: z.number().min(10).max(500).optional().default(100),
      includeReplies: z.boolean().optional().default(false),
    }).optional(),
  }),
});

/**
 * Schema for Idea Validation Request
 */
export const validateIdeaSchema = z.object({
  body: z.object({
    idea: z.string()
      .min(10, 'Idea must be at least 10 characters')
      .max(500, 'Idea must be less than 500 characters')
      .refine(
        (str) => str.trim().length > 0,
        { message: 'Idea cannot be empty' }
      ),
    targetAudience: z.string()
      .min(3, 'Target audience must be at least 3 characters')
      .max(100, 'Target audience must be less than 100 characters'),
    goal: z.string()
      .min(1, 'Goal is required')
      .max(100, 'Goal must be less than 100 characters'),
  }),
});

/**
 * Schema for Advanced Topic Search
 */
export const searchAdvancedSchema = z.object({
  query: z.object({
    query: z.string()
      .min(2, 'Search query must be at least 2 characters')
      .max(200, 'Search query must be less than 200 characters')
      .optional(),
    keyword: z.string()
      .min(2, 'Keyword must be at least 2 characters')
      .max(100, 'Keyword must be less than 100 characters')
      .optional(),
    limit: z.string()
      .refine((val) => !isNaN(Number(val)), { message: 'Limit must be a number' })
      .transform(Number)
      .refine((val) => val > 0 && val <= 50, { message: 'Limit must be between 1 and 50' })
      .optional()
      .default(10),
  }).refine(
    (data) => data.query || data.keyword,
    { message: 'Either query or keyword must be provided' }
  ),
});

/**
 * Schema for Job ID validation
 */
export const jobIdSchema = z.object({
  params: z.object({
    jobId: z.string()
      .min(1, 'Job ID is required')
      .max(100, 'Job ID is too long'),
  }),
});

/**
 * General text input sanitization
 */
export const sanitizeText = (text: string): string => {
  return text
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

// ========================================
// INPUT TYPES (Your existing types)
// ========================================

export interface ValidateIdeaInput {
  idea: string;
  targetAudience: string;
  goal: string; // Free text, not enum
}

// ========================================
// REFERENCE VIDEO SCHEMA - ALL FIELDS REQUIRED
// ========================================

export const ReferenceVideoSchema = z.object({
  title: z.string().describe("The video title"),
  videoId: z.string().describe("YouTube video ID"),
  link: z.string().describe("Full YouTube URL"),
  channel: z.string().describe("Channel name"),
  views: z.string().describe("View count (use 'N/A' if unknown)"),
  uploadDate: z.string().describe("Upload date (use 'N/A' if unknown)"),
});

export type ReferenceVideo = z.infer<typeof ReferenceVideoSchema>;

// ========================================
// COMPETITION BREAKDOWN SCHEMA
// ========================================

export const CompetitionBreakdownSchema = z.object({
  bigCreators: z.number().describe("Number of large channels (1M+ subs)"),
  mediumCreators: z.number().describe("Number of medium channels (100K-1M subs)"),
  smallCreators: z.number().describe("Number of small channels (<100K subs)"),
  saturationScore: z.number().min(0).max(100).describe("Market saturation percentage"),
  entryBarrier: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Difficulty to enter market"),
  dominantFormats: z.array(z.string()).describe("Most common video formats with percentages"),
});

export type CompetitionBreakdown = z.infer<typeof CompetitionBreakdownSchema>;

// ========================================
// YOUTUBE METRICS SCHEMA
// ========================================

export const YouTubeMetricsSchema = z.object({
  searchVolume: z.string().describe("Estimated monthly search volume"),
  trendDirection: z.enum(["RISING", "STABLE", "DECLINING"]).describe("Trend trajectory"),
  seasonality: z.string().describe("Seasonal patterns if any"),
  avgEngagementRate: z.number().describe("Average engagement rate percentage"),
  viralityPotential: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Potential to go viral"),
});

export type YouTubeMetrics = z.infer<typeof YouTubeMetricsSchema>;

// ========================================
// CONTENT STRATEGY SCHEMA
// ========================================

export const ContentStrategySchema = z.object({
  optimalVideoLength: z.string().describe("Recommended video duration"),
  hookStrategy: z.string().describe("How to hook viewers in first 15 seconds"),
  contentStructure: z.array(z.string()).describe("Recommended video structure/chapters"),
  uniqueAngles: z.array(z.string()).describe("Unique approaches to differentiate"),
});

export type ContentStrategy = z.infer<typeof ContentStrategySchema>;

// ========================================
// AUDIENCE INSIGHTS SCHEMA
// ========================================

export const AudienceInsightsSchema = z.object({
  painPoints: z.array(z.string()).describe("Main problems audience faces"),
  desires: z.array(z.string()).describe("What audience wants to see"),
  commonQuestions: z.array(z.string()).describe("Frequently asked questions"),
  relatabilityScore: z.number().min(0).max(10).describe("How relatable to target audience"),
});

export type AudienceInsights = z.infer<typeof AudienceInsightsSchema>;

// ========================================
// AGENT OUTPUT SCHEMAS
// ========================================

export const CompetitionAgentOutputSchema = z.object({
  competitionBreakdown: CompetitionBreakdownSchema,
  marketGaps: z.array(z.string()).describe("Identified content gaps in the market"),
  topCompetitors: z.array(z.string()).describe("Names of top competing channels"),
  qualityBenchmark: z.string().describe("Quality level needed to compete"),
});

export type CompetitionAgentOutput = z.infer<typeof CompetitionAgentOutputSchema>;

export const AudienceAgentOutputSchema = z.object({
  audienceInsights: AudienceInsightsSchema,
  targetDemographics: z.string().describe("Specific demographic details"),
  viewerIntent: z.string().describe("Why people search for this content"),
  emotionalTriggers: z.array(z.string()).describe("Emotional hooks that work"),
});

export type AudienceAgentOutput = z.infer<typeof AudienceAgentOutputSchema>;

export const TrendAgentOutputSchema = z.object({
  youtubeMetrics: YouTubeMetricsSchema,
  trendingKeywords: z.array(z.string()).describe("Currently trending related keywords"),
  bestTimingWindow: z.string().describe("Optimal time to publish this content"),
  futureOutlook: z.string().describe("Predicted trend trajectory"),
});

export type TrendAgentOutput = z.infer<typeof TrendAgentOutputSchema>;

export const StrategyAgentOutputSchema = z.object({
  contentStrategy: ContentStrategySchema,
  titleFormulas: z.array(z.string()).describe("Title templates that work"),
  thumbnailGuidance: z.string().describe("Thumbnail best practices"),
  seriesPotential: z.string().describe("Can this become a series?"),
});

export type StrategyAgentOutput = z.infer<typeof StrategyAgentOutputSchema>;

// ========================================
// FINAL OUTPUT SCHEMA
// ========================================

export const FinalOutputSchema = z.object({
  verdict: z.string().describe("Detailed verdict paragraph explaining the overall assessment"),
  score: z.number().min(0).max(100).describe("Overall potential score out of 100"),
  
  competitionAnalysis: CompetitionAgentOutputSchema,
  audienceAnalysis: AudienceAgentOutputSchema,
  trendAnalysis: TrendAgentOutputSchema,
  strategyRecommendations: StrategyAgentOutputSchema,
  
  improvements: z
    .array(z.string())
    .min(3)
    .describe("Specific actionable improvements"),
  
  titles: z
    .array(z.string())
    .min(3)
    .describe("Compelling video title suggestions"),
  
  angles: z
    .array(z.string())
    .min(2)
    .describe("Unique content angles to explore"),
  
  referenceVideos: z
    .array(ReferenceVideoSchema)
    .min(1)
    .max(5)
    .describe("Successful reference videos for inspiration"),
});

export type FinalOutput = z.infer<typeof FinalOutputSchema>;

// ========================================
// TOOL RETURN TYPES
// ========================================

export interface SearchDemandResult {
  score: number;
  reason: string;
  totalVideos: number;
}

export interface CompetitionResult {
  videosFound: number;
  level: "Low" | "Med" | "High";
  topChannels: Array<{
    channelName: string;
    subscribers: number;
  }>;
}

export interface AudienceRelatabilityResult {
  relatabilityScore: number;
  avgEngagementRate: number;
  topComments: string[];
}

export interface TrendingSignalsResult {
  trendScore: number;
  keywords: string[];
  recentVideoCount: number;
  avgViewsRecent: number;
}

export interface ReferenceVideoResult {
  title: string;
  videoId: string;
  link: string;
  channel: string;
  views?: string;
  uploadDate?: string;
}

export interface GoogleTrendsResult {
  interestOverTime: Array<{ date: string; value: number }>;
  relatedQueries: string[];
  trendDirection: "RISING" | "STABLE" | "DECLINING";
  regionalInterest: Array<{ region: string; value: number }>;
}

export interface ChannelAnalysisResult {
  channelName: string;
  subscribers: number;
  recentUploads: number;
  avgViews: number;
  engagementRate: number;
}

export interface CommentAnalysisResult {
  topPainPoints: string[];
  commonQuestions: string[];
  sentimentScore: number;
  topKeywords: string[];
}

export interface TranscriptAnalysisResult {
  videoTitle: string;
  keyTopics: string[];
  structure: (string| undefined)[];
  hookUsed: string;
  averageLength: string;
}

export interface EstimatedMetricsResult {
  estimatedCTR: number;
  estimatedRetention: number;
  viralityScore: number;
  algorithmScore: number;
}