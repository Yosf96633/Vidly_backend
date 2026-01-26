// middleware/featureLimiters.ts
import { featureRateLimiter } from "./featureRateLimiter";

// Comment Analyzer - 2 uses per 24 hours
export const commentAnalyzerLimiter = featureRateLimiter({
  featureName: "comment-analyzer",
  maxRequests: 2,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
});

// Idea Validator - 2 uses per 24 hours
export const ideaValidatorLimiter = featureRateLimiter({
  featureName: "idea-validator",
  maxRequests: 2,
  windowMs: 24 * 60 * 60 * 1000,
});

// Viral Search - 2 uses per 24 hours
export const viralSearchLimiter = featureRateLimiter({
  featureName: "viral-search",
  maxRequests: 2,
  windowMs: 24 * 60 * 60 * 1000,
});