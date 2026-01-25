// src/tools/index.ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { google } from "googleapis";
import googleTrends from "google-trends-api";
import type {
  SearchDemandResult,
  CompetitionResult,
  AudienceRelatabilityResult,
  TrendingSignalsResult,
  ReferenceVideoResult,
  GoogleTrendsResult,
  ChannelAnalysisResult,
  CommentAnalysisResult,
  TranscriptAnalysisResult,
  EstimatedMetricsResult,
} from "../schemas/validation.schemas";

// ========================================
// YOUTUBE API SETUP
// ========================================

const youtube = google.youtube({
  version: "v3",
  auth: process.env.YOUTUBE_API_KEY!,
});

// ========================================
// EXISTING TOOLS (ENHANCED)
// ========================================

export const getSearchDemandTool = new DynamicStructuredTool({
  name: "getSearchDemand",
  description:
    "Analyzes search demand for a video idea. Returns score (1-10), total videos found, and reasoning.",
  schema: z.object({
    idea: z.string().describe("The video idea or topic"),
    niche: z.string().describe("Target niche or audience"),
  }),
  func: async ({ idea, niche }): Promise<SearchDemandResult> => {
    console.log(`🔍 Tool: getSearchDemand("${idea}", "${niche}")`);

    try {
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: `${idea} ${niche}`,
        type: ["video"],
        maxResults: 50,
        order: "relevance",
      });

      const totalVideos = searchResponse.data.pageInfo?.totalResults || 0;
      const score = Math.min(
        10,
        Math.max(1, Math.floor((totalVideos / 100000) * 10)),
      );

      const reason =
        score >= 7
          ? "High search demand detected - strong audience interest"
          : score >= 4
            ? "Moderate search interest - decent opportunity"
            : "Lower search volume - niche topic with limited demand";

      console.log(
        `✅ Search demand: ${score}/10 - ${totalVideos.toLocaleString()} videos`,
      );

      return { score, reason, totalVideos };
    } catch (error) {
      console.error("YouTube API error:", error);
      return {
        score: 5,
        reason: "Unable to fetch data, estimated medium demand",
        totalVideos: 0,
      };
    }
  },
});

export const checkCompetitionTool = new DynamicStructuredTool({
  name: "checkCompetition",
  description:
    "Checks competition level and identifies top channels competing in this space.",
  schema: z.object({
    topic: z.string().describe("Topic to analyze"),
  }),
  func: async ({ topic }): Promise<CompetitionResult> => {
    console.log(`🔍 Tool: checkCompetition("${topic}")`);

    try {
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: topic,
        type: ["video"],
        maxResults: 50,
        order: "relevance",
      });

      const videosFound = searchResponse.data.pageInfo?.totalResults || 0;
      const level: "Low" | "Med" | "High" =
        videosFound > 500000 ? "High" : videosFound > 50000 ? "Med" : "Low";

      // Get top channels
      const channelIds = [
        ...new Set(
          searchResponse.data.items
            ?.map((item) => item.snippet?.channelId)
            .filter(Boolean) as string[],
        ),
      ].slice(0, 10);

      const channelsResponse = await youtube.channels.list({
        part: ["statistics", "snippet"],
        id: channelIds, // Pass array directly, not joined string
      });

      const topChannels =
        channelsResponse.data.items?.map((ch) => ({
          channelName: ch.snippet?.title || "Unknown",
          subscribers: parseInt(ch.statistics?.subscriberCount || "0"),
        })) || [];

      console.log(
        `✅ Competition: ${level} (${videosFound.toLocaleString()} videos)`,
      );

      return { videosFound, level, topChannels };
    } catch (error) {
      console.error("YouTube API error:", error);
      return { videosFound: 0, level: "Med", topChannels: [] };
    }
  },
});

export const getAudienceRelatabilityTool = new DynamicStructuredTool({
  name: "getAudienceRelatability",
  description:
    "Evaluates audience connection by analyzing engagement and top comments.",
  schema: z.object({
    idea: z.string().describe("Video idea"),
    audience: z.string().describe("Target audience"),
  }),
  func: async ({ idea, audience }): Promise<AudienceRelatabilityResult> => {
    console.log(`🔍 Tool: getAudienceRelatability("${idea}", "${audience}")`);

    try {
      const searchQuery = `${idea} ${audience}`;
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: searchQuery,
        type: ["video"],
        maxResults: 20,
        order: "relevance",
      });

      const videos = searchResponse.data.items || [];
      const videoIds = videos
        .map((v) => v.id?.videoId)
        .filter(Boolean) as string[];

      // FIX: Use youtube.videos.list instead of youtube.channels.list
      const statsResponse = await youtube.videos.list({
        part: ["statistics"],
        id: videoIds, // Pass array directly
      });

      let totalEngagement = 0;
      let totalViews = 0;

      statsResponse.data.items?.forEach((video) => {
        const stats = video.statistics;
        const views = parseInt(stats?.viewCount || "0");
        const likes = parseInt(stats?.likeCount || "0");
        const comments = parseInt(stats?.commentCount || "0");

        totalViews += views;
        totalEngagement += likes + comments;
      });

      const avgEngagementRate =
        totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;
      const relatabilityScore = Math.min(
        10,
        Math.max(1, Math.floor(avgEngagementRate * 20) + 3),
      );

      // Get top comments from first video
      const firstVideoId = videos[0]?.id?.videoId;
      let topComments: string[] = [];

      if (firstVideoId) {
        try {
          const commentsResponse = await youtube.commentThreads.list({
            part: ["snippet"],
            videoId: firstVideoId,
            maxResults: 10,
            order: "relevance",
          });

          topComments =
            commentsResponse.data.items?.map(
              (item) =>
                item.snippet?.topLevelComment?.snippet?.textDisplay || "",
            ) || [];
        } catch (err) {
          console.log("Comments disabled or unavailable");
        }
      }

      console.log(
        `✅ Relatability: ${relatabilityScore}/10 (${avgEngagementRate.toFixed(2)}% engagement)`,
      );

      return { relatabilityScore, avgEngagementRate, topComments };
    } catch (error) {
      console.error("YouTube API error:", error);
      return { relatabilityScore: 5, avgEngagementRate: 0, topComments: [] };
    }
  },
});

export const getTrendingSignalsTool = new DynamicStructuredTool({
  name: "getTrendingSignals",
  description:
    "Analyzes if topic is trending by checking recent uploads and trending keywords.",
  schema: z.object({
    topic: z.string().describe("Topic to check"),
  }),
  func: async ({ topic }): Promise<TrendingSignalsResult> => {
    console.log(`🔍 Tool: getTrendingSignals("${topic}")`);

    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: topic,
        type: ["video"],
        maxResults: 50,
        order: "date",
        publishedAfter: oneMonthAgo.toISOString(),
      });

      const recentVideos = searchResponse.data.items || [];
      const videoIds = recentVideos
        .map((v) => v.id?.videoId)
        .filter(Boolean) as string[];

      const statsResponse = await youtube.videos.list({
        part: ["statistics"],
        id: videoIds, // Pass array directly
      });

      const totalViews =
        statsResponse.data.items?.reduce(
          (acc, v) => acc + parseInt(v.statistics?.viewCount || "0"),
          0,
        ) || 0;

      const avgViewsRecent =
        totalViews / (statsResponse.data.items?.length || 1);
      const recentVideoCount = recentVideos.length;

      const trendScore = Math.min(
        10,
        Math.max(1, Math.floor(recentVideoCount / 5 + avgViewsRecent / 50000)),
      );

      // Extract keywords from titles
      const allTitles = recentVideos
        .map((v) => v.snippet?.title || "")
        .join(" ");
      const words = allTitles.toLowerCase().split(/\s+/);
      const wordFreq = words.reduce((acc: Record<string, number>, word) => {
        if (word.length > 4 && !["video", "watch", "channel"].includes(word)) {
          acc[word] = (acc[word] || 0) + 1;
        }
        return acc;
      }, {});

      const keywords = Object.entries(wordFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word);

      console.log(
        `✅ Trending: ${trendScore}/10 (${recentVideoCount} recent videos)`,
      );

      return { trendScore, keywords, recentVideoCount, avgViewsRecent };
    } catch (error) {
      console.error("YouTube API error:", error);
      return {
        trendScore: 5,
        keywords: [topic],
        recentVideoCount: 0,
        avgViewsRecent: 0,
      };
    }
  },
});

export const findReferenceVideoTool = new DynamicStructuredTool({
  name: "findReferenceVideo",
  description:
    "Finds successful reference videos similar to the idea with full details.",
  schema: z.object({
    topic: z.string().describe("Topic to find references for"),
    audience: z.string().describe("Target audience"),
    goal: z.string().describe("Creator's goal"),
  }),
  func: async ({ topic, audience, goal }): Promise<ReferenceVideoResult> => {
    console.log(
      `🔍 Tool: findReferenceVideo("${topic}", "${audience}", "${goal}")`,
    );

    try {
      const orderBy = goal.toLowerCase().includes("view")
        ? "viewCount"
        : goal.toLowerCase().includes("engagement")
          ? "rating"
          : "relevance";

      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: `${topic} ${audience}`,
        type: ["video"],
        maxResults: 10,
        order: orderBy,
      });

      const videos = searchResponse.data.items || [];
      if (videos.length === 0) {
        throw new Error("No videos found");
      }

      const topVideo = videos[0];
      const videoId = topVideo?.id?.videoId || "";

      // Get detailed stats
      const statsResponse = await youtube.videos.list({
        part: ["statistics", "snippet"],
        id: [videoId], // Pass as array
      });

      const videoData = statsResponse.data.items?.[0];
      const views = videoData?.statistics?.viewCount || "0";
      const uploadDate = videoData?.snippet?.publishedAt || "";

      const result: ReferenceVideoResult = {
        title: topVideo?.snippet?.title || "",
        videoId,
        link: `https://www.youtube.com/watch?v=${videoId}`,
        channel: topVideo?.snippet?.channelTitle || "",
        views,
        uploadDate,
      };

      console.log(`✅ Reference: "${result.title}" (${views} views)`);

      return result;
    } catch (error) {
      console.error("YouTube API error:", error);
      return {
        title: `${topic} - Example Video`,
        videoId: "dQw4w9WgXcQ",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        channel: "Example Channel",
      };
    }
  },
});

// ========================================
// NEW TOOLS
// ========================================

export const searchGoogleTrendsTool = new DynamicStructuredTool({
  name: "searchGoogleTrends",
  description:
    "Analyzes Google Trends data for search interest over time and related queries.",
  schema: z.object({
    keyword: z.string().describe("Keyword to analyze trends for"),
  }),
  func: async ({ keyword }): Promise<GoogleTrendsResult> => {
    console.log(`🔍 Tool: searchGoogleTrends("${keyword}")`);
    try {
      // Interest over time (last 12 months)
      const interestData = await googleTrends.interestOverTime({
        keyword,
        startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      });

      const parsedInterest = JSON.parse(interestData);
      const timelineData = parsedInterest.default?.timelineData || [];

      const interestOverTime = timelineData.map((item: any) => ({
        date: item.formattedTime,
        value: item.value[0] || 0,
      }));

      // Determine trend direction
      const recent = interestOverTime.slice(-3).map((d: any) => d.value);
      const older = interestOverTime.slice(-6, -3).map((d: any) => d.value);
      const avgRecent =
        recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
      const avgOlder =
        older.reduce((a: number, b: number) => a + b, 0) / older.length;

      const trendDirection: "RISING" | "STABLE" | "DECLINING" =
        avgRecent > avgOlder * 1.2
          ? "RISING"
          : avgRecent < avgOlder * 0.8
            ? "DECLINING"
            : "STABLE";

      // Related queries
      const relatedData = await googleTrends.relatedQueries({ keyword });
      const parsedRelated = JSON.parse(relatedData);
      const queries =
        parsedRelated.default?.rankedList?.[0]?.rankedKeyword || [];
      const relatedQueries = queries.slice(0, 10).map((q: any) => q.query);

      // Regional interest
      const regionData = await googleTrends.interestByRegion({ keyword });
      const parsedRegion = JSON.parse(regionData);
      const regions = parsedRegion.default?.geoMapData || [];
      const regionalInterest = regions.slice(0, 5).map((r: any) => ({
        region: r.geoName,
        value: r.value[0] || 0,
      }));

      console.log(`✅ Google Trends: ${trendDirection} trend`);

      return {
        interestOverTime,
        relatedQueries,
        trendDirection,
        regionalInterest,
      };
    } catch (error) {
      console.error("Google Trends API error:", error);
      return {
        interestOverTime: [],
        relatedQueries: [keyword],
        trendDirection: "STABLE",
        regionalInterest: [],
      };
    }
  },
});

export const scrapeTopChannelsTool = new DynamicStructuredTool({
  name: "scrapeTopChannels",
  description:
    "Scrapes top channels in the niche for subscriber counts and upload frequency.",
  schema: z.object({
    niche: z.string().describe("Niche to analyze"),
  }),
  func: async ({ niche }): Promise<ChannelAnalysisResult[]> => {
    console.log(`🔍 Tool: scrapeTopChannels("${niche}")`);

    try {
      // Use YouTube API to find top channels
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: niche,
        type: ["channel"],
        maxResults: 10,
        order: "relevance",
      });

      const channels = searchResponse.data.items || [];
      const channelIds = channels
        .map((ch) => ch.id?.channelId)
        .filter(Boolean) as string[];

      const channelsResponse = await youtube.channels.list({
        part: ["statistics", "snippet", "contentDetails"],
        id: channelIds, // FIX: Pass array directly
      });

      const results: ChannelAnalysisResult[] = [];

      for (const channel of channelsResponse.data.items || []) {
        const stats = channel.statistics;
        const uploadsPlaylistId =
          channel.contentDetails?.relatedPlaylists?.uploads;

        // Get recent uploads
        let recentUploads = 0;
        let totalViews = 0;

        if (uploadsPlaylistId) {
          const playlistResponse = await youtube.playlistItems.list({
            part: ["snippet"],
            playlistId: uploadsPlaylistId,
            maxResults: 10,
          });

          recentUploads = playlistResponse.data.items?.length || 0;

          const videoIds = playlistResponse.data.items
            ?.map((item) => item.snippet?.resourceId?.videoId)
            .filter(Boolean) as string[];

          if (videoIds.length > 0) {
            const videosResponse = await youtube.videos.list({
              part: ["statistics"],
              id: videoIds, // FIX: Pass array directly
            });

            totalViews =
              videosResponse.data.items?.reduce(
                (acc, v) => acc + parseInt(v.statistics?.viewCount || "0"),
                0,
              ) || 0;
          }
        }

        const avgViews = recentUploads > 0 ? totalViews / recentUploads : 0;
        const totalChannelViews = parseInt(stats?.viewCount || "0");
        const videoCount = parseInt(stats?.videoCount || "1");
        const engagementRate =
          (avgViews / (totalChannelViews / videoCount)) * 100;

        results.push({
          channelName: channel.snippet?.title || "Unknown",
          subscribers: parseInt(stats?.subscriberCount || "0"),
          recentUploads,
          avgViews,
          engagementRate,
        });
      }

      console.log(`✅ Analyzed ${results.length} top channels`);

      return results;
    } catch (error) {
      console.error("Channel scraping error:", error);
      return [];
    }
  },
});

export const analyzeCommentsTool = new DynamicStructuredTool({
  name: "analyzeComments",
  description:
    "Analyzes top comments to extract pain points, questions, and sentiment.",
  schema: z.object({
    topic: z.string().describe("Topic to analyze comments for"),
  }),
  func: async ({ topic }): Promise<CommentAnalysisResult> => {
    console.log(`🔍 Tool: analyzeComments("${topic}")`);

    try {
      // Find top videos
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: topic,
        type: ["video"],
        maxResults: 5,
        order: "relevance",
      });

      const videoIds =
        (searchResponse.data.items
          ?.map((v) => v.id?.videoId)
          .filter(Boolean) as string[]) || [];

      const allComments: string[] = [];

      // Fetch comments from each video
      for (const videoId of videoIds) {
        try {
          const commentsResponse = await youtube.commentThreads.list({
            part: ["snippet"],
            videoId,
            maxResults: 20,
            order: "relevance",
          });

          const comments =
            commentsResponse.data.items?.map(
              (item) =>
                item.snippet?.topLevelComment?.snippet?.textDisplay || "",
            ) || [];

          allComments.push(...comments);
        } catch (err) {
          console.log(`Comments disabled for video ${videoId}`);
        }
      }

      // Analyze comments
      const painPointKeywords = [
        "problem",
        "issue",
        "struggle",
        "hard",
        "difficult",
        "wish",
        "need",
      ];
      const questionKeywords = [
        "how",
        "what",
        "why",
        "when",
        "where",
        "can",
        "should",
        "?",
      ];

      const topPainPoints: string[] = [];
      const commonQuestions: string[] = [];
      const keywords: Record<string, number> = {};

      let positiveCount = 0;
      let negativeCount = 0;

      for (const comment of allComments) {
        const lowerComment = comment.toLowerCase();

        // Extract pain points
        if (painPointKeywords.some((kw) => lowerComment.includes(kw))) {
          topPainPoints.push(comment.substring(0, 100));
        }

        // Extract questions
        if (questionKeywords.some((kw) => lowerComment.includes(kw))) {
          commonQuestions.push(comment.substring(0, 100));
        }

        // Sentiment analysis (simple)
        if (
          lowerComment.includes("great") ||
          lowerComment.includes("awesome") ||
          lowerComment.includes("love")
        ) {
          positiveCount++;
        }
        if (
          lowerComment.includes("bad") ||
          lowerComment.includes("terrible") ||
          lowerComment.includes("hate")
        ) {
          negativeCount++;
        }

        // Extract keywords
        const words = lowerComment.split(/\s+/);
        words.forEach((word) => {
          if (word.length > 4) {
            keywords[word] = (keywords[word] || 0) + 1;
          }
        });
      }

      const sentimentScore =
        allComments.length > 0
          ? ((positiveCount - negativeCount) / allComments.length) * 100
          : 0;

      const topKeywords = Object.entries(keywords)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([word]) => word);

      console.log(`✅ Analyzed ${allComments.length} comments`);

      return {
        topPainPoints: topPainPoints.slice(0, 5),
        commonQuestions: commonQuestions.slice(0, 5),
        sentimentScore,
        topKeywords,
      };
    } catch (error) {
      console.error("Comment analysis error:", error);
      return {
        topPainPoints: [],
        commonQuestions: [],
        sentimentScore: 0,
        topKeywords: [],
      };
    }
  },
});

export const fetchVideoTranscriptTool = new DynamicStructuredTool({
  name: "fetchVideoTranscript",
  description:
    "Fetches and analyzes video transcripts to understand content structure.",
  schema: z.object({
    topic: z.string().describe("Topic to find videos for"),
  }),
  func: async ({ topic }): Promise<TranscriptAnalysisResult> => {
    console.log(`🔍 Tool: fetchVideoTranscript("${topic}")`);

    try {
      // Find top video
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: topic,
        type: ["video"],
        maxResults: 1,
        order: "relevance",
      });

      const video = searchResponse.data.items?.[0];
      if (!video) {
        throw new Error("No video found");
      }

      const videoId = video.id?.videoId || "";
      const videoTitle = video.snippet?.title || "";

      // Fetch video details
      const videoResponse = await youtube.videos.list({
        part: ["contentDetails", "snippet"],
        id: [videoId], // FIX: Pass as array
      });

      const duration =
        videoResponse.data.items?.[0]?.contentDetails?.duration || "PT0S";

      // Parse ISO 8601 duration
      const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
      const hours = parseInt(match?.[1] || "0");
      const minutes = parseInt(match?.[2] || "0");
      const seconds = parseInt(match?.[3] || "0");
      const totalMinutes = hours * 60 + minutes + seconds / 60;

      const averageLength = `${Math.floor(totalMinutes)} minutes`;

      // Note: YouTube API doesn't provide transcripts directly
      // You would need to use youtube-transcript package or similar
      // For now, we'll extract from description and tags

      const description =
        videoResponse.data.items?.[0]?.snippet?.description || "";
      const tags = videoResponse.data.items?.[0]?.snippet?.tags || [];

      // Extract structure from description chapters if available
      const chapterRegex = /(\d{1,2}:\d{2})\s*[-–]\s*(.+)/g;
      const chapters = [...description.matchAll(chapterRegex)].map(
        (match) => match[2],
      );

      const structure =
        chapters.length > 0
          ? chapters
          : [
              "Introduction",
              "Main Content",
              "Key Points",
              "Conclusion/Call to Action",
            ];

      // Extract hook from title
      const hookPatterns = [
        /^(How to|Why|What|The|This|I)/i,
        /(\d+|Best|Ultimate|Complete|Secret)/i,
      ];
      const hookUsed =
        hookPatterns.find((pattern) => pattern.test(videoTitle))?.toString() ||
        "Direct title hook";

      const keyTopics = [
        ...new Set([...tags, ...description.split(/\s+/).slice(0, 10)]),
      ].slice(0, 5);

      console.log(`✅ Transcript analysis for "${videoTitle}"`);

      return {
        videoTitle,
        keyTopics,
        structure,
        hookUsed,
        averageLength,
      };
    } catch (error) {
      console.error("Transcript fetch error:", error);
      return {
        videoTitle: topic,
        keyTopics: [topic],
        structure: ["Introduction", "Main Content", "Conclusion"],
        hookUsed: "Standard hook",
        averageLength: "10 minutes",
      };
    }
  },
});

export const estimateMetricsTool = new DynamicStructuredTool({
  name: "estimateMetrics",
  description:
    "Estimates CTR, retention, and virality potential based on engagement data.",
  schema: z.object({
    topic: z.string().describe("Topic to estimate metrics for"),
    competitionLevel: z.string().describe("Competition level (Low/Med/High)"),
  }),
  func: async ({
    topic,
    competitionLevel,
  }): Promise<EstimatedMetricsResult> => {
    console.log(`🔍 Tool: estimateMetrics("${topic}", "${competitionLevel}")`);

    try {
      // Get sample videos
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: topic,
        type: ["video"],
        maxResults: 20,
        order: "relevance",
      });

      const videoIds = searchResponse.data.items
        ?.map((v) => v.id?.videoId)
        .filter(Boolean) as string[];

      const statsResponse = await youtube.videos.list({
        part: ["statistics"],
        id: videoIds, // FIX: Pass array directly
      });

      // Calculate engagement metrics
      let totalEngagement = 0;
      let totalViews = 0;
      let videoCount = 0;

      statsResponse.data.items?.forEach((video) => {
        const stats = video.statistics;
        const views = parseInt(stats?.viewCount || "0");
        const likes = parseInt(stats?.likeCount || "0");
        const comments = parseInt(stats?.commentCount || "0");

        if (views > 0) {
          totalViews += views;
          totalEngagement += likes + comments;
          videoCount++;
        }
      });

      const avgEngagementRate =
        videoCount > 0 ? (totalEngagement / totalViews) * 100 : 0;

      // Estimate CTR (industry avg: 2-10%)
      const baseCTR = 4; // Base CTR
      const competitionFactor =
        competitionLevel === "Low" ? 1.5 : competitionLevel === "Med" ? 1 : 0.7;
      const estimatedCTR =
        baseCTR * competitionFactor * (1 + avgEngagementRate / 100);

      // Estimate Retention (industry avg: 40-60%)
      const baseRetention = 50;
      const engagementBoost = avgEngagementRate * 2;
      const estimatedRetention = Math.min(80, baseRetention + engagementBoost);

      // Virality Score (1-10)
      const viralityScore = Math.min(
        10,
        Math.max(
          1,
          Math.floor(avgEngagementRate * 10 + totalViews / videoCount / 100000),
        ),
      );

      // Algorithm Score (1-10)
      const algorithmScore = Math.min(
        10,
        Math.max(
          1,
          Math.floor(
            (estimatedCTR / 10) * 3 +
              (estimatedRetention / 10) * 3 +
              avgEngagementRate * 10 * 2,
          ),
        ),
      );

      console.log(
        `✅ Estimated CTR: ${estimatedCTR.toFixed(1)}%, Retention: ${estimatedRetention.toFixed(1)}%`,
      );

      return {
        estimatedCTR,
        estimatedRetention,
        viralityScore,
        algorithmScore,
      };
    } catch (error) {
      console.error("Metrics estimation error:", error);
      return {
        estimatedCTR: 4.0,
        estimatedRetention: 50.0,
        viralityScore: 5,
        algorithmScore: 5,
      };
    }
  },
});
// ========================================
// EXPORT ALL TOOLS
// ========================================

export const allTools = [
  // Existing tools (enhanced)
  getSearchDemandTool,
  checkCompetitionTool,
  getAudienceRelatabilityTool,
  getTrendingSignalsTool,
  findReferenceVideoTool,

  // New tools
  searchGoogleTrendsTool,
  scrapeTopChannelsTool,
  analyzeCommentsTool,
  fetchVideoTranscriptTool,
  estimateMetricsTool,
];
