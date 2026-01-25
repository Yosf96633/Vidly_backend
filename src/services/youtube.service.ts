import axios from "axios";
import { YoutubeTranscript } from "youtube-transcript";
import dotenv from "dotenv";
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";
dotenv.config();
import z from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY! as string;
const YOUTUBE_API_KEY2 = process.env.YOUTUBE_API_KEY2! as string;
const YOUTUBE_API_KEY3 = process.env.YOUTUBE_API_KEY3! as string;
const YOUTUBE_API_KEY4 = process.env.YOUTUBE_API_KEY4! as string;
const YOUTUBE_API_KEY5 = process.env.YOUTUBE_API_KEY5! as string;
if (!YOUTUBE_API_KEY) {
  throw new Error("YouTube API key is not defined in environment variables");
}
// --- Interfaces (Updated for Advanced Features) ---
export interface SearchFilters {
  duration?: "any" | "long" | "medium" | "short";
  order?: "date" | "relevance" | "viewCount" | "rating";
  type?: "video" | "channel" | "playlist";
  publishedAfter?: string;
}

export interface YouTubeComment {
  id: string;
  text: string;
  likeCount: number;
  replyCount: number;
  relevanceScore: number;
}

export interface VideoTranscript {
  text: string;
  available: boolean;
}

export interface SearchFilters {
  duration?: "any" | "long" | "medium" | "short";
  order?: "date" | "relevance" | "viewCount" | "rating";
  type?: "video" | "channel" | "playlist";
  publishedAfter?: string;
  pageToken?: string; // <--- ✅ ADDED THIS
}

export interface YouTubeSearchResult {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      channelId: string;
      publishedAt: string;
      description: string;
      thumbnails: any;
    };
  }>;
  pageInfo: {
    totalResults: number;
  };
  nextPageToken?: string;
}

export interface YouTubeVideoStats {
  items: Array<{
    id: string;
    statistics: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
      favoriteCount?: string;
    };
    snippet: {
      title: string;
      description: string;
      channelTitle: string;
      channelId: string;
      publishedAt: string;
      tags?: string[];
      categoryId?: string;
      thumbnails: any;
    };
    contentDetails: {
      duration: string;
      dimension: string;
      definition: string;
    };
  }>;
}

export interface ChannelStats {
  id: string;
  statistics: {
    viewCount: string;
    subscriberCount: string;
    videoCount: string;
    hiddenSubscriberCount: boolean;
  };
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
  };
}
const TranscriptSummarySchema = z.object({
  summary: z.string().describe("Concise, information-rich summary"),
  key_topics: z.array(z.string()).describe("Main topics (3-5 items)"),
  key_moments: z
    .array(
      z.object({
        topic: z.string(),
        description: z.string(),
      }),
    )
    .describe("Important moments"),
});
export interface TopicAnalysis {
  videoCount: number;
  avgViews: number;
  topChannels: string[];
  totalResults: number;
  avgLikes?: number;
  avgComments?: number;
}

class YouTubeService {
  private apiKey: string;
  private apiKey2: string;
  private apiKey3: string;
  private apiKey4: string;
  private apiKey5: string;
  private baseUrl = "https://www.googleapis.com/youtube/v3";

  constructor() {
    this.apiKey = YOUTUBE_API_KEY!;
    this.apiKey2 = YOUTUBE_API_KEY2!;
    this.apiKey3 = YOUTUBE_API_KEY3!;
    this.apiKey4 = YOUTUBE_API_KEY4!;
    this.apiKey5 = YOUTUBE_API_KEY5!;
  }

  // ===== COMMENT & TRANSCRIPT FUNCTIONS =====

  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  async fetchAllComments(videoId: string): Promise<YouTubeComment[]> {
    const comments: YouTubeComment[] = [];
    let pageToken: string | undefined = undefined;
    let retries = 0;
    const maxRetries = 3;

    try {
      do {
        try {
          const response: any = await axios.get(
            `${this.baseUrl}/commentThreads`,
            {
              params: {
                part: "snippet",
                videoId: videoId,
                maxResults: 100,
                pageToken: pageToken,
                key: this.apiKey,
                order: "relevance",
              },
            },
          );

          const items = response.data.items || [];

          for (const item of items) {
            const comment = item.snippet.topLevelComment.snippet;
            const likeCount = comment.likeCount || 0;
            const replyCount = item.snippet.totalReplyCount || 0;

            comments.push({
              id: item.id,
              text: comment.textDisplay,
              likeCount,
              replyCount,
              relevanceScore: likeCount + replyCount,
            });
          }

          pageToken = response.data.nextPageToken;
          retries = 0;
        } catch (error: any) {
          if (error.response?.status === 429 || error.response?.status >= 500) {
            retries++;
            if (retries >= maxRetries) {
              throw new Error(
                `Failed after ${maxRetries} retries: ${error.message}`,
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
          } else {
            throw error;
          }
        }
      } while (pageToken);

      console.log(
        `✅ Fetched ${comments.length} comments from video ${videoId}`,
      );
      return comments;
    } catch (error: any) {
      console.error("Error fetching comments:", error.message);
      throw new Error(`Failed to fetch comments: ${error.message}`);
    }
  }

  filterTopComments(
    comments: YouTubeComment[],
    maxComments: number = 5000,
  ): YouTubeComment[] {
    const sorted = comments.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const filtered = sorted.slice(0, Math.min(maxComments, sorted.length));

    console.log(`✅ Filtered to top ${filtered.length} comments by relevance`);
    return filtered;
  }

  async fetchTranscript(videoId: string): Promise<VideoTranscript> {
    try {
      // ========================================
      // CONFIGURATION
      // ========================================
      const MAX_LENGTH = 15000; // Max chars before summarization
      const CHUNK_SIZE = 10000; // Chunk size for long transcripts
      const CHUNK_OVERLAP = 1000; // Overlap between chunks
      const CONCURRENT_CHUNKS = 3; // Process 3 chunks at a time
      const API_KEY = process.env.GEMINI_API_KEY1 || "";

      // ========================================
      // STEP 1: FETCH RAW TRANSCRIPT
      // ========================================
      console.log(`🎥 Fetching transcript for video ${videoId}...`);

      const loader = YoutubeLoader.createFromUrl(
        `https://youtu.be/${videoId}`,
        { language: "en", addVideoInfo: true },
      );

      const transcriptData = await loader.load();

      if (!transcriptData || transcriptData.length === 0) {
        console.log(`⚠️ No transcript available for video ${videoId}`);
        return { text: "", available: false };
      }

      const fullTranscript = transcriptData
        .map((item) => item.pageContent)
        .join(" ")
        .trim();

      console.log(`📊 Raw transcript: ${fullTranscript.length} chars`);

      // ========================================
      // STEP 2: CHECK IF SUMMARIZATION NEEDED
      // ========================================
      if (fullTranscript.length <= MAX_LENGTH) {
        console.log(`✅ Transcript within limits, no summarization needed`);
        return { text: fullTranscript, available: true };
      }

      console.log(
        `📦 Transcript too long, starting chunking & summarization...`,
      );

      // ========================================
      // STEP 3: CHUNK TRANSCRIPT
      // ========================================
      const chunks: string[] = [];
      let startIndex = 0;

      while (startIndex < fullTranscript.length) {
        const endIndex = Math.min(
          startIndex + CHUNK_SIZE,
          fullTranscript.length,
        );
        chunks.push(fullTranscript.slice(startIndex, endIndex));
        startIndex += CHUNK_SIZE - CHUNK_OVERLAP;
        if (endIndex === fullTranscript.length) break;
      }

      console.log(`📦 Created ${chunks.length} chunks`);

      // ========================================
      // STEP 4: SUMMARIZE CHUNKS IN PARALLEL
      // ========================================
      const summaries: string[] = [];

      for (let i = 0; i < chunks.length; i += CONCURRENT_CHUNKS) {
        const chunkBatch = chunks.slice(i, i + CONCURRENT_CHUNKS);

        const batchPromises = chunkBatch.map(async (chunk, batchIdx) => {
          const chunkIndex = i + batchIdx;
          console.log(
            `📝 Summarizing chunk ${chunkIndex + 1}/${chunks.length}`,
          );

          try {
            const model = new ChatGoogleGenerativeAI({
              model: "gemini-2.0-flash",
              apiKey: API_KEY,
            }).withStructuredOutput(TranscriptSummarySchema);

            const prompt = `Summarize part ${chunkIndex + 1}/${
              chunks.length
            } of a video transcript.

Create a concise, information-rich summary that:
- Captures all key points and insights
- Preserves important details and context
- Uses clear, natural language
- Target: ~2000 characters

Transcript:
${chunk}`;

            const result = await model.invoke(prompt);

            const enrichedSummary = `
${result.summary}

Topics: ${result.key_topics.join(", ")}

Key Moments:
${result.key_moments.map((m) => `- ${m.topic}: ${m.description}`).join("\n")}
          `.trim();

            console.log(
              `✅ Chunk ${chunkIndex + 1} done: ${enrichedSummary.length} chars`,
            );
            return enrichedSummary;
          } catch (error: any) {
            console.error(`❌ Chunk ${chunkIndex + 1} failed:`, error.message);
            // Fallback: return truncated original
            return chunk.slice(0, 2000) + "...";
          }
        });

        const batchResults = await Promise.all(batchPromises);
        summaries.push(...batchResults);
      }

      // ========================================
      // STEP 5: MERGE SUMMARIES
      // ========================================
      console.log(`🔗 Merging ${summaries.length} summaries...`);

      const combinedSummaries = summaries
        .map((s, idx) => `=== Part ${idx + 1} ===\n${s}`)
        .join("\n\n");

      // If combined is within limit, return it
      if (combinedSummaries.length <= MAX_LENGTH) {
        console.log(`✅ Final transcript: ${combinedSummaries.length} chars`);
        return { text: combinedSummaries, available: true };
      }

      // Otherwise, do final merge summarization
      console.log(`🔄 Combined still too long, doing final merge...`);

      try {
        const model = new ChatGoogleGenerativeAI({
          model: "gemini-2.0-flash",
          apiKey: API_KEY,
        }).withStructuredOutput(TranscriptSummarySchema);

        const prompt = `Merge these ${summaries.length} summaries into one cohesive summary.

Maintain all key insights and important details.
Target: ~${MAX_LENGTH} characters

Summaries:
${combinedSummaries}`;

        const result = await model.invoke(prompt);

        const finalSummary = `
${result.summary}

Key Topics: ${result.key_topics.join(", ")}

Important Sections:
${result.key_moments.map((m) => `- ${m.topic}: ${m.description}`).join("\n")}
      `.trim();

        console.log(`✅ Final merged transcript: ${finalSummary.length} chars`);
        return { text: finalSummary, available: true };
      } catch (error: any) {
        console.error(`❌ Final merge failed:`, error.message);
        // Fallback: return truncated combined
        const fallback = combinedSummaries.slice(0, MAX_LENGTH);
        return { text: fallback, available: true };
      }
    } catch (error: any) {
      console.error(`⚠️ Transcript error for ${videoId}:`, error.message);
      return { text: "", available: false };
    }
  }

  // ===== SEARCH & ANALYTICS FUNCTIONS =====

  async searchVideos(
    keyword: string,
    maxResults: number = 50,
    filters: SearchFilters = {},
  ): Promise<YouTubeSearchResult> {
    try {
      const params: any = {
        part: "snippet",
        q: keyword,
        type: filters.type || "video",
        maxResults,
        order: filters.order || "relevance",
        key: this.apiKey2,
      };

      if (
        filters.duration &&
        filters.duration !== "any" &&
        (!filters.type || filters.type === "video")
      ) {
        params.videoDuration = filters.duration;
      }

      if (filters.publishedAfter) {
        params.publishedAfter = filters.publishedAfter;
      }

      // ✅ FIX: Actually use the pageToken
      if (filters.pageToken) {
        params.pageToken = filters.pageToken;
      }

      const response = await axios.get<YouTubeSearchResult>(
        `${this.baseUrl}/search`,
        { params },
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "YouTube API search error:",
        error.response?.data?.error || error.message,
      );
      throw new Error("Failed to search YouTube videos");
    }
  }

  async getVideoStats(videoIds: string[]): Promise<YouTubeVideoStats> {
    if (videoIds.length === 0) return { items: [] };

    try {
      const response = await axios.get<YouTubeVideoStats>(
        `${this.baseUrl}/videos`,
        {
          params: {
            part: "statistics,snippet,contentDetails",
            id: videoIds.join(","),
            key: this.apiKey3,
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("YouTube API stats error:", error);
      throw new Error("Failed to get video statistics");
    }
  }

  async getChannelsStats(
    channelIds: string[],
  ): Promise<{ items: ChannelStats[] }> {
    if (channelIds.length === 0) return { items: [] };

    const uniqueIds = [...new Set(channelIds)].slice(0, 50);

    try {
      const response = await axios.get(`${this.baseUrl}/channels`, {
        params: {
          part: "statistics,snippet",
          id: uniqueIds.join(","),
          key: this.apiKey4,
        },
      });

      return { items: response.data.items || [] };
    } catch (error) {
      console.error("YouTube API channel stats error:", error);
      return { items: [] };
    }
  }

  // Get Channel Stats (Single Channel)
  async getChannelStats(channelId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/channels`, {
        params: {
          part: "statistics,snippet",
          id: channelId,
          key: this.apiKey5,
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        return this.getMockChannelStats(channelId);
      }

      const channel = response.data.items[0];
      return {
        id: channel.id,
        statistics: channel.statistics || {
          viewCount: "0",
          subscriberCount: "0",
          hiddenSubscriberCount: false,
          videoCount: "0",
        },
        snippet: channel.snippet,
      };
    } catch (error) {
      console.error("Error fetching channel stats, using mock data:", error);
      return this.getMockChannelStats(channelId);
    }
  }

  // Mock channel stats for fallback
  private getMockChannelStats(channelId: string): any {
    return {
      id: channelId,
      statistics: {
        viewCount: Math.floor(Math.random() * 1000000).toString(),
        subscriberCount: Math.floor(Math.random() * 100000).toString(),
        hiddenSubscriberCount: false,
        videoCount: Math.floor(Math.random() * 1000).toString(),
      },
      snippet: {
        title: "Channel Title",
        description: "Channel description",
        publishedAt: new Date().toISOString(),
        thumbnails: {},
      },
    };
  }

  async getChannelInfo(channelId: string) {
    const stats = await this.getChannelsStats([channelId]);
    return stats.items[0] || null;
  }

  async analyzeTopicPerformance(keyword: string): Promise<TopicAnalysis> {
    try {
      const searchResults = await this.searchVideos(keyword, 50);

      if (!searchResults.items || searchResults.items.length === 0) {
        return {
          videoCount: 0,
          avgViews: 0,
          topChannels: [],
          totalResults: 0,
        };
      }

      const videoIds = searchResults.items.map((item) => item.id.videoId);
      const videoStats = await this.getVideoStats(videoIds);

      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;

      videoStats.items.forEach((video) => {
        totalViews += parseInt(video.statistics.viewCount || "0");
        totalLikes += parseInt(video.statistics.likeCount || "0");
        totalComments += parseInt(video.statistics.commentCount || "0");
      });

      const avgViews = Math.round(totalViews / videoStats.items.length);
      const avgLikes = Math.round(totalLikes / videoStats.items.length);
      const avgComments = Math.round(totalComments / videoStats.items.length);

      const channelCounts = new Map<string, number>();
      searchResults.items.forEach((item) => {
        const channel = item.snippet.channelTitle;
        channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
      });

      const topChannels = Array.from(channelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([channel]) => channel);

      return {
        videoCount: searchResults.items.length,
        avgViews,
        avgLikes,
        avgComments,
        topChannels,
        totalResults: searchResults.pageInfo.totalResults,
      };
    } catch (error) {
      console.error("Error analyzing topic performance:", error);
      throw error;
    }
  }

  async getRelatedTopics(keyword: string): Promise<string[]> {
    try {
      const searchResults = await this.searchVideos(keyword, 20);

      const words = new Set<string>();
      const stopWords = [
        "the",
        "and",
        "for",
        "with",
        "how",
        "what",
        "video",
        "2024",
        "2025",
      ];

      searchResults.items.forEach((item) => {
        const title = item.snippet.title.toLowerCase();
        const titleWords = title.replace(/[^\w\s]/g, "").split(/\s+/);

        titleWords.forEach((word) => {
          if (word.length > 3 && !stopWords.includes(word)) {
            words.add(word);
          }
        });
      });

      words.delete(keyword.toLowerCase());
      return Array.from(words).slice(0, 10);
    } catch (error) {
      console.error("Error getting related topics:", error);
      return [];
    }
  }

  // ===== COMBINED ANALYSIS FUNCTION =====

  async comprehensiveVideoAnalysis(videoUrl: string) {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    try {
      const [comments, transcript, videoStats] = await Promise.all([
        this.fetchAllComments(videoId).catch(() => []),
        this.fetchTranscript(videoId),
        this.getVideoStats([videoId]),
      ]);

      const topComments = this.filterTopComments(comments, 100);

      return {
        videoId,
        comments: topComments,
        transcript,
        statistics: videoStats.items[0]?.statistics || null,
        snippet: videoStats.items[0]?.snippet || null,
        contentDetails: videoStats.items[0]?.contentDetails || null,
      };
    } catch (error) {
      console.error("Error in comprehensive video analysis:", error);
      throw error;
    }
  }
}

export default new YouTubeService();
