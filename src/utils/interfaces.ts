
export interface YouTubeVideoStats {
  id: string;
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    categoryId: string;
    tags?: string[];
    thumbnails?: {
      default?: { url: string };
      high?: { url: string };
    };
  };
  contentDetails: {
    duration: string;
  };
}

export interface YouTubeChannelStats {
  id: string;
  statistics: {
    viewCount: string;
    subscriberCount: string;
    videoCount: string;
  };
}

export interface AdvancedTopicAnalysis {
  keyword: string;
  searchVolume: number;
  competition: 'low' | 'medium' | 'high';
  trend: 'rising' | 'stable' | 'declining';
  difficultyScore: number;
  difficultyReason: string;
  monetizationPotential: {
    estimatedRevenuePerVideo: string;
    cpmRate: string;
    monthlyPotential: string;
  };
  optimalVideoLength: {
    avgLength: string;
    insight: string;
  };
  titleInsights: {
    commonWords: string[];
    avgTitleLength: string;
    topPattern: string;
  };
  competitorInsights: {
    topChannelUploadFrequency: string;
    recommendedFrequency: string;
  };
  seoRecommendations: {
    suggestedTags: string[];
    longTailKeywords: string[];
    searchability: string;
  };
  viralPotential: {
    score: number;
    reasoning: string;
    timing: string;
  };
  relatedTopics: string[];
  youtubeData: {
    videoCount: number;
    avgViews: number;
    topChannels: string[];
    avgLikes: number;
    avgComments: number;
    engagementRate: string;
  };
}

export interface AdvancedSearchTopic {
  keyword: string;
  searchVolume: number;
  competition: string;
  trend: string;
  avgViews: number;
  opportunityScore: number;
  opportunityReason: string;
  growthRate: string;
  estimatedRevenue: string;
  successRate: string;
  contentGaps?: string[];
  bestPostTime: {
    day: string;
    time: string;
    reason: string;
  };
  warning?: string;
}

export interface AdvancedSuggestions {
  count: number;
  seedKeyword: string;
  suggestions: {
    highOpportunity: any[];
    mediumOpportunity: any[];
    avoidThese: any[];
  };
  nicheCombinations: string[];
  trendingSubNiches: any[];
  longTailKeywords: string[];
  contentIdeas: any[];
}

// ✨ NEW INTERFACES FOR ADVANCED FILTERING

export interface AdvancedVideoFilters {
  sort?: 'latest' | 'bestMatch' | 'mostViews' | 'topRated'; // Frontend sort options
  contentType?: 'longForm' | 'shorts' | 'all'; // Frontend content type
  viralScore?: number | undefined; // 0-1000 (frontend shows 200%)
  minViews?: number | undefined; // Frontend shows "10K+"
  maxResults?: 20 | 50 | 100;
}

export interface EnrichedVideoData {
  id: string;
  videoUrl: string; // ✅ Added video link
  title: string;
  thumbnail: string;
  channel: string;
  channelId: string;
  channelUrl: string; // ✅ Added channel link
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  duration: number;
  durationMins: number;
  isShort: boolean;
  subscribers: number;
  viewsPerHour: number;
  engagementRate: number;
  viewToSubRatio: number;
  outlierScore: number; // Viral score
  freshnessScore: number;
  tags: string[];
}

export interface AdvancedVideoSearchResponse {
  success: boolean;
  count: number;
  filters: {
    query: string;
    sort: string;
    videoType: string;
    outlierScore: [number, number];
    views: [number, number];
    subscribers: [number, number];
    viewsPerHour: [number, number];
    videoLength: [number, number];
    viewToSubRatio: [number, number];
    maxResults: number;
  };
  data: EnrichedVideoData[];
}

export interface ContentGap {
  format: string;
  reason: string;
  gap: string;
  potentialViews: string;
  competitionLevel: string;
}

export interface TitleAnalysis {
  hasTutorial: boolean;
  hasComparison: boolean;
  hasBeginnerGuide: boolean;
  hasGuide: boolean;
  hasReview: boolean;
  hasTips: boolean;
  hasHow: boolean;
  hasTop: boolean;
}