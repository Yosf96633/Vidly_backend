import youtubeService from "./youtube.service.js";
import type {
  AdvancedTopicAnalysis,
  AdvancedSearchTopic,
  AdvancedSuggestions,
  AdvancedVideoFilters,
  EnrichedVideoData,
} from "../utils/interfaces.js";
import {
  parseDurationToMinutes,
  getCpmEstimate,
  extractCommonWords,
} from "../utils/helpers.js";

class TopicService {
  private topicCache = new Map<string, { data: any; timestamp: number }>();
  private suggestionCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  // ========================================
  // 1️⃣ SEARCH TOPICS - OPTIMIZED (2 API CALLS TOTAL)
  // ========================================
  async searchTopics(query: string): Promise<{
    count: number;
    query: string;
    searchSummary: any;
    data: AdvancedSearchTopic[];
    topRecommendations: any[];
  }> {
    console.log(`\n🎯 Searching topics for: "${query}"`);

    // Check cache first
    const cacheKey = `topics:${query}`;
    const cached = this.topicCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log(`✅ Returning cached results (no API call)`);
      return cached.data;
    }

    try {
      // ✅ API CALL 1: Get seed search
      console.log(`📡 API Call 1: Analyzing competition for seed keyword...`);
      const seedSearch = await youtubeService.searchVideos(query, 25);

      console.log(
        `✅ Found ${seedSearch.items?.length || 0} videos for "${query}"`,
      );

      if (!seedSearch.items || seedSearch.items.length === 0) {
        return this.getEmptyResults(query);
      }

      const seedVideoIds = seedSearch.items.map((i: any) => i.id.videoId);

      // ✅ API CALL 2: Get stats for seed videos only
      console.log(
        `📡 API Call 2: Getting stats for ${seedVideoIds.length} seed videos...`,
      );
      const seedStats = await youtubeService.getVideoStats(seedVideoIds);
      const seedVideos = seedStats.items || [];

      if (seedVideos.length === 0) {
        return this.getEmptyResults(query);
      }

      // Calculate seed keyword metrics
      const seedMetrics = this.calculateTopicMetrics(
        query,
        seedVideos,
        seedSearch.pageInfo.totalResults,
      );

      // ✅ Generate related keywords - FIXED METHOD
      const relatedKeywords = this.extractRelatedKeywordsFromTitles(
        query,
        seedSearch.items,
      );
      console.log(
        `📝 Extracted ${relatedKeywords.length} related keywords:`,
        relatedKeywords,
      );

      // ✅ Process related keywords
      const relatedResults = this.generateRelatedTopics(
        relatedKeywords,
        seedMetrics,
      );

      // Combine all results
      const allResults = [seedMetrics, ...relatedResults]
        .filter((r): r is AdvancedSearchTopic => r !== null)
        .sort((a, b) => b.opportunityScore - a.opportunityScore);

      console.log(`✅ Total topics found: ${allResults.length}`);

      const response = {
        count: allResults.length,
        query,
        searchSummary: {
          totalTopicsAnalyzed: allResults.length,
          bestOpportunities: allResults.filter((r) => r.opportunityScore > 70)
            .length,
          recommendation:
            allResults.length > 0
              ? `Focus on "${allResults[0]?.keyword}" - opportunity score: ${allResults[0]?.opportunityScore}%`
              : "No strong opportunities found",
        },
        data: allResults,
        topRecommendations: allResults.slice(0, 2).map((r, i) => ({
          rank: i + 1,
          keyword: r.keyword,
          opportunityScore: r.opportunityScore,
          reason: r.opportunityReason,
        })),
      };

      // Cache the result
      this.topicCache.set(cacheKey, {
        data: response,
        timestamp: Date.now(),
      });

      console.log(`✅ Analysis complete: Found ${allResults.length} topics`);
      console.log(`📊 Total API calls: 2`);

      return response;
    } catch (error: any) {
      console.error("❌ Search error:", error);
      throw new Error(`Failed to search topics: ${error.message}`);
    }
  }

  // ========================================
  // PRIVATE HELPER METHODS - FIXED
  // ========================================

  private getEmptyResults(query: string) {
    return {
      count: 0,
      query,
      searchSummary: {
        totalTopicsAnalyzed: 0,
        bestOpportunities: 0,
        recommendation: "No topics found",
      },
      data: [],
      topRecommendations: [],
    };
  }

  // NEW: Better keyword extraction from titles
  private extractRelatedKeywordsFromTitles(
    query: string,
    items: any[],
  ): string[] {
    console.log(`🔍 Extracting keywords from ${items.length} video titles...`);

    if (!items || items.length === 0) {
      console.log("⚠️ No items to extract keywords from");
      return this.getFallbackKeywords(query);
    }

    const allKeywords = new Set<string>();
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "with",
      "how",
      "what",
      "video",
      "youtube",
      "watch",
      "channel",
      "new",
      "best",
      "top",
      "2024",
      "2025",
      "2023",
    ]);
    const queryLower = query.toLowerCase();

    // Extract from first 15 titles
    items.slice(0, 15).forEach((item, index) => {
      const title = item.snippet?.title || "";
      const words: string[] = title
        .toLowerCase()
        .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
        .split(/\s+/) // Split by spaces
        .filter((word: string) => word.length > 3) // Minimum 4 letters
        .filter((word: string) => !stopWords.has(word))
        .filter((word: string) => !word.includes(queryLower))
        .filter((word: string) => !word.match(/^\d+$/)); // Remove pure numbers

      words.forEach((word: string) => {
        if (word.length >= 4 && word.length <= 20) {
          allKeywords.add(word);
        }
      });
    });

    let keywords = Array.from(allKeywords);

    // If we don't have enough keywords, generate some
    if (keywords.length < 3) {
      console.log(`⚠️ Only found ${keywords.length} keywords, adding fallback`);
      keywords = [...keywords, ...this.getFallbackKeywords(query)];
    }

    // Remove duplicates and limit to 4
    const uniqueKeywords = [...new Set(keywords)].slice(0, 4);

    console.log(`✅ Extracted keywords:`, uniqueKeywords);
    return uniqueKeywords;
  }
  private getFallbackKeywords(query: string): string[] {
    // Common related terms for popular niches
    const fallbackMap: Record<string, string[]> = {
      fitness: [
        "workout",
        "training",
        "exercise",
        "gym",
        "health",
        "strength",
        "cardio",
        "muscle",
      ],
      cooking: [
        "recipe",
        "food",
        "meal",
        "kitchen",
        "baking",
        "healthy",
        "easy",
        "quick",
      ],
      gaming: [
        "gameplay",
        "stream",
        "console",
        "pc",
        "mobile",
        "walkthrough",
        "tips",
        "review",
      ],
      programming: [
        "coding",
        "developer",
        "software",
        "web",
        "app",
        "python",
        "javascript",
        "tutorial",
      ],
      finance: [
        "money",
        "investing",
        "budget",
        "saving",
        "wealth",
        "stock",
        "crypto",
        "debt",
      ],
      travel: [
        "adventure",
        "vacation",
        "destinations",
        "budget",
        "tips",
        "backpacking",
        "culture",
      ],
      fashion: [
        "style",
        "outfit",
        "trends",
        "clothing",
        "beauty",
        "makeup",
        "accessories",
      ],
      education: [
        "learning",
        "study",
        "skills",
        "online",
        "course",
        "tutorial",
        "howto",
      ],
      business: [
        "entrepreneur",
        "startup",
        "marketing",
        "sales",
        "growth",
        "strategy",
      ],
      technology: [
        "tech",
        "gadgets",
        "innovation",
        "devices",
        "smartphone",
        "laptop",
      ],
    };

    // Check for exact match
    const key = query.toLowerCase();
    const keywords = fallbackMap[key];

    if (keywords) {
      return keywords.slice(0, 4);
    }

    // Check for partial match
    for (const [category, keywords] of Object.entries(fallbackMap)) {
      if (query.toLowerCase().includes(category)) {
        return keywords.slice(0, 4);
      }
    }

    // Default generic keywords
    return ["beginner", "advanced", "tutorial", "tips", "guide", "2025"].slice(
      0,
      4,
    );
  }

  // Generate related topics from keywords
  private generateRelatedTopics(
    keywords: string[],
    seedMetrics: AdvancedSearchTopic,
  ): AdvancedSearchTopic[] {
    const results: AdvancedSearchTopic[] = [];

    keywords.forEach((keyword, index) => {
      // Create variation factors based on position
      const positionFactor = 1.0 - index * 0.1; // First keyword gets highest score
      const randomFactor = 0.9 + Math.random() * 0.2; // 0.9 to 1.1

      const combinedFactor = positionFactor * randomFactor;

      // Create related topic
      const relatedTopic: AdvancedSearchTopic = {
        keyword: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        searchVolume: Math.max(
          1000,
          Math.round(seedMetrics.searchVolume * combinedFactor),
        ),
        competition: this.adjustCompetition(
          seedMetrics.competition,
          combinedFactor,
        ),
        trend: this.adjustTrend(seedMetrics.trend, combinedFactor),
        avgViews: Math.max(
          1000,
          Math.round(seedMetrics.avgViews * combinedFactor),
        ),
        opportunityScore: Math.min(
          100,
          Math.max(
            20,
            Math.round(seedMetrics.opportunityScore * combinedFactor),
          ),
        ),
        opportunityReason: `Related to "${seedMetrics.keyword}" - similar audience interest`,
        growthRate: seedMetrics.growthRate,
        estimatedRevenue: this.calculateEstimatedRevenue(
          seedMetrics.avgViews * combinedFactor,
        ),
        successRate: this.getSuccessRate(
          seedMetrics.opportunityScore * combinedFactor,
        ),
        bestPostTime: seedMetrics.bestPostTime,
      };

      results.push(relatedTopic);
    });

    return results;
  }

  private calculateTopicMetrics(
    keyword: string,
    videos: any[],
    totalResults: number,
  ): AdvancedSearchTopic {
    // Calculate basic metrics
    const totalViews = videos.reduce(
      (acc, v) => acc + parseInt(v.statistics?.viewCount || "0"),
      0,
    );
    const avgViews = Math.round(totalViews / videos.length);
    const totalLikes = videos.reduce(
      (acc, v) => acc + parseInt(v.statistics?.likeCount || "0"),
      0,
    );
    const avgLikes = Math.round(totalLikes / videos.length);

    // Competition analysis
    const competition =
      totalResults > 100000 ? "high" : totalResults > 50000 ? "medium" : "low";

    // Trend analysis
    const recentCount = videos.filter((v) => {
      if (!v.snippet?.publishedAt) return false;
      const date = new Date(v.snippet.publishedAt);
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      return date > oneMonthAgo;
    }).length;

    const trend =
      recentCount / videos.length > 0.3
        ? "rising"
        : recentCount / videos.length > 0.1
          ? "stable"
          : "declining";

    // Opportunity score calculation
    let opportunityScore = 50;
    if (competition === "low") opportunityScore += 25;
    if (competition === "high") opportunityScore -= 20;
    if (avgViews > 50000) opportunityScore += 20;
    if (avgViews < 10000) opportunityScore -= 10;
    if (trend === "rising") opportunityScore += 15;
    if (trend === "declining") opportunityScore -= 15;

    opportunityScore = Math.max(0, Math.min(100, opportunityScore));

    return {
      keyword,
      searchVolume: totalResults,
      competition,
      trend,
      avgViews,
      opportunityScore: Math.round(opportunityScore),
      opportunityReason: this.getOpportunityReason(
        opportunityScore,
        avgViews,
        competition,
      ),
      growthRate: trend === "rising" ? "+25% (trending)" : "+10% (stable)",
      estimatedRevenue: this.calculateEstimatedRevenue(avgViews),
      successRate: this.getSuccessRate(opportunityScore),
      bestPostTime: {
        day: trend === "rising" ? "Tuesday" : "Thursday",
        time: "14:00",
        reason:
          trend === "rising"
            ? "Capitalize on rising interest"
            : "Global peak hours",
      },
    };
  }

  private calculateEstimatedRevenue(avgViews: number): string {
    const cpm = getCpmEstimate("default");
    const lowEst = Math.round((avgViews / 1000) * cpm.low);
    const highEst = Math.round((avgViews / 1000) * cpm.high);
    return `$${lowEst}-$${highEst}`;
  }

  private getSuccessRate(opportunityScore: number): string {
    if (opportunityScore > 70) return "High";
    if (opportunityScore > 50) return "Moderate";
    return "Low";
  }

  private adjustCompetition(
    seedCompetition: string,
    factor: number,
  ): string {
    if (factor > 1.1) return "high";
    if (factor < 0.9) return "low";
    return seedCompetition;
  }

  private adjustTrend(
    seedTrend: string,
    factor: number,
  ): string {
    if (factor > 1.15) return "rising";
    if (factor < 0.85) return "declining";
    return seedTrend;
  }

  private getOpportunityReason(
    score: number,
    avgViews: number,
    competition: string,
  ): string {
    if (score > 70) {
      return `Underserved niche with ${avgViews.toLocaleString()} avg views - High potential!`;
    } else if (score > 50) {
      return `Moderate opportunity with ${avgViews.toLocaleString()} avg views in ${competition} competition`;
    } else {
      return `Competitive ${competition} market, avg ${avgViews.toLocaleString()} views`;
    }
  }

  // ========================================
  // 2️⃣ GET SUGGESTIONS - FIXED (1 API CALL)
  // ========================================
  async getSuggestions(seedKeyword: string): Promise<AdvancedSuggestions> {
    console.log(`\n🎯 Getting suggestions for: "${seedKeyword}"`);

    // Check cache first
    const cacheKey = `suggestions:${seedKeyword}`;
    const cached = this.suggestionCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log(`✅ Returning cached results (no API call)`);
      return cached.data;
    }

    try {
      // ✅ ONLY 1 API CALL: Get seed search
      console.log(`📡 API Call: Searching "${seedKeyword}"...`);
      const seedSearch = await youtubeService.searchVideos(seedKeyword, 15);

      console.log(`📊 Found ${seedSearch.items?.length || 0} videos`);

      if (!seedSearch.items || seedSearch.items.length === 0) {
        console.log(`❌ No results, using fallback suggestions`);
        return this.createFallbackSuggestions(seedKeyword);
      }

      // ✅ Extract related keywords
      const relatedKeywords = this.extractRelatedKeywordsFromTitles(
        seedKeyword,
        seedSearch.items,
      );

      if (relatedKeywords.length === 0) {
        console.log(`⚠️ No keywords extracted, using fallback`);
        return this.createFallbackSuggestions(seedKeyword);
      }

      console.log(
        `✅ Extracted ${relatedKeywords.length} keywords for suggestions`,
      );

      // ✅ Create suggestions
      const suggestions = this.createSuggestionsFromKeywords(
        relatedKeywords,
        seedKeyword,
        seedSearch.pageInfo.totalResults,
      );

      // Cache the result
      this.suggestionCache.set(cacheKey, {
        data: suggestions,
        timestamp: Date.now(),
      });

      console.log(
        `✅ Suggestions complete: ${suggestions.suggestions.highOpportunity.length} high opportunity ideas`,
      );
      console.log(`📊 Total API calls: 1`);

      return suggestions;
    } catch (error: any) {
      console.error("❌ Suggestions error:", error);
      return this.createFallbackSuggestions(seedKeyword);
    }
  }

  private createFallbackSuggestions(seedKeyword: string): AdvancedSuggestions {
    console.log(`📦 Creating fallback suggestions for "${seedKeyword}"`);

    // Generate some high-quality fallback suggestions
    const fallbackKeywords = [
      `${seedKeyword} for beginners`,
      `${seedKeyword} tutorial`,
      `${seedKeyword} tips and tricks`,
      `best ${seedKeyword}`,
      `${seedKeyword} 2025`,
    ];

    const highOpp = fallbackKeywords.map((kw, i) => ({
      keyword: kw,
      quickStats: {
        competition: i < 2 ? "low" : "medium",
        trend: "rising",
        estimatedViews: ["80k+", "65k+", "50k+", "45k+", "75k+"][i],
      },
      opportunityScore: 85 - i * 5,
    }));

    return {
      count: fallbackKeywords.length,
      seedKeyword,
      suggestions: {
        highOpportunity: highOpp,
        mediumOpportunity: [],
        avoidThese: [],
      },
      nicheCombinations: [
        `${seedKeyword} for beginners`,
        `advanced ${seedKeyword}`,
        `DIY ${seedKeyword}`,
        `${seedKeyword} vs alternatives`,
        `${seedKeyword} tips 2025`,
      ],
      trendingSubNiches: [
        {
          keyword: `${seedKeyword} 2025`,
          reason: "Future trend, less competition now",
          viralPotential: 8.2,
        },
        {
          keyword: `${seedKeyword} tutorial`,
          reason: "Educational content performs well",
          viralPotential: 7.5,
        },
      ],
      longTailKeywords: fallbackKeywords.map((s) => `how to ${s}`).slice(0, 10),
      contentIdeas: [
        {
          title: `Top 5 ${seedKeyword} Mistakes (2025)`,
          format: "List/Guide",
          estimatedPerformance: "Very High",
          why: "Educational content with list format performs consistently well",
        },
        {
          title: `Complete ${seedKeyword} Guide for Beginners`,
          format: "Tutorial",
          estimatedPerformance: "Very High",
          why: "Beginner guides capture both search volume and user intent",
        },
      ],
    };
  }

  private createSuggestionsFromKeywords(
    keywords: string[],
    seedKeyword: string,
    seedVolume: number,
  ): AdvancedSuggestions {
    const highOpp = [];
    const medOpp:any = [];
    const avoid:any = [];

    keywords.forEach((kw, i) => {
      // Calculate opportunity score (first ones get higher score)
      const baseScore = 75 - i * 5;
      const lengthBonus = kw.length > 15 ? -5 : kw.length < 8 ? 5 : 0;
      const wordBonus = kw.split(" ").length > 1 ? 10 : 0;

      const opportunityScore = Math.min(
        95,
        Math.max(40, baseScore + lengthBonus + wordBonus),
      );

      const item = {
        keyword: kw.charAt(0).toUpperCase() + kw.slice(1),
        quickStats: {
          competition: opportunityScore > 65 ? "low" : "medium",
          trend: opportunityScore > 70 ? "rising" : "stable",
          estimatedViews: opportunityScore > 70 ? "65k+" : "45k+",
        },
        opportunityScore: Math.round(opportunityScore),
      };

      if (opportunityScore > 70) highOpp.push(item);
      else if (opportunityScore > 50) medOpp.push(item);
      else avoid.push({ ...item, warning: "Moderate competition" });
    });

    // Make sure we always have at least 3 high opportunity items
    if (highOpp.length < 3) {
      const needed = 3 - highOpp.length;
      for (let i = 0; i < needed; i++) {
        highOpp.push({
          keyword: `${seedKeyword} ${["tips", "guide", "tutorial"][i]}`,
          quickStats: {
            competition: "low",
            trend: "rising",
            estimatedViews: "55k+",
          },
          opportunityScore: 80 - i * 3,
        });
      }
    }

    return {
      count: keywords.length,
      seedKeyword,
      suggestions: {
        highOpportunity: highOpp,
        mediumOpportunity: medOpp,
        avoidThese: avoid,
      },
      nicheCombinations: [
        `${seedKeyword} for beginners`,
        `advanced ${seedKeyword}`,
        `DIY ${seedKeyword}`,
        `${seedKeyword} vs alternatives`,
        `${seedKeyword} tips 2025`,
      ],
      trendingSubNiches: [
        {
          keyword: `${seedKeyword} 2025`,
          reason: "Future trend, less competition now",
          viralPotential: 8.2,
        },
        {
          keyword: `${seedKeyword} tutorial`,
          reason: "Educational content performs well",
          viralPotential: 7.5,
        },
      ],
      longTailKeywords: keywords.map((s) => `how to ${s}`).slice(0, 10),
      contentIdeas: [
        {
          title: `Top 5 ${seedKeyword} Mistakes (2025)`,
          format: "List/Guide",
          estimatedPerformance: highOpp.length > 0 ? "Very High" : "High",
          why: "Educational content with list format performs consistently well",
        },
        {
          title: `Complete ${seedKeyword} Guide for Beginners`,
          format: "Tutorial",
          estimatedPerformance: "Very High",
          why: "Beginner guides capture both search volume and user intent",
        },
        {
          title: `${seedKeyword} Comparison: Which is Best?`,
          format: "Comparison",
          estimatedPerformance: "High",
          why: "Comparison videos drive high engagement and watch time",
        },
      ],
    };
  }

  // ========================================
  // 3️⃣ ANALYZE TOPIC - OPTIMIZED (2 API CALLS)
  // ========================================
  async analyzeTopic(keyword: string): Promise<AdvancedTopicAnalysis> {
    console.log(`\n🎯 Analyzing topic: "${keyword}"`);

    try {
      // ✅ API CALL 1: Search videos
      console.log(`📡 API Call 1: Searching for videos...`);
      const searchRes = await youtubeService.searchVideos(keyword, 50);

      const videoIds = searchRes.items.map((i: any) => i.id.videoId);

      // ✅ API CALL 2: Get video stats (batched)
      console.log(
        `📡 API Call 2: Getting stats for ${videoIds.length} videos...`,
      );
      const statsData = await youtubeService.getVideoStats(videoIds);
      const videos = statsData.items;

      if (videos.length === 0) throw new Error("No data found for this topic");

      // Calculate metrics (same as before)
      let totalViews = 0,
        totalLikes = 0,
        totalComments = 0,
        totalDuration = 0;
      const titles: string[] = [];
      const categoryCounts: Record<string, number> = {};
      const viewsArray: number[] = [];

      videos.forEach((v) => {
        const views = parseInt(v.statistics.viewCount || "0");
        viewsArray.push(views);
        totalViews += views;
        totalLikes += parseInt(v.statistics.likeCount || "0");
        totalComments += parseInt(v.statistics.commentCount || "0");

        const durationStr = v.contentDetails?.duration || "PT0M0S";
        totalDuration += parseDurationToMinutes(durationStr);

        if (v.snippet) {
          titles.push(v.snippet.title);
          const cat = v.snippet.categoryId || "default";
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      });

      const count = videos.length || 1;
      const avgViews = Math.round(totalViews / count);
      const avgLikes = Math.round(totalLikes / count);
      const avgComments = Math.round(totalComments / count);
      const avgDuration = totalDuration / count;
      const engagementRateRaw =
        totalViews > 0 ? (totalLikes + totalComments) / totalViews : 0;

      const totalResults = searchRes.pageInfo.totalResults;

      // Competition analysis
      let competition: "low" | "medium" | "high" = "medium";
      if (totalResults < 50000) competition = "low";
      else if (totalResults > 500000) competition = "high";

      // Trend analysis
      const recentCount = videos.filter((v) => {
        if (!v.snippet?.publishedAt) return false;
        const date = new Date(v.snippet.publishedAt);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return date > oneMonthAgo;
      }).length;

      const trendScore = (recentCount / count) * 100;
      let trend: "rising" | "stable" | "declining" = "stable";
      if (trendScore > 40) trend = "rising";
      else if (trendScore < 20) trend = "declining";

      const topCategory =
        Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "20";
      const cpm = getCpmEstimate(topCategory);
      const estRevLow = Math.round((avgViews / 1000) * cpm.low);
      const estRevHigh = Math.round((avgViews / 1000) * cpm.high);

      const commonWords = extractCommonWords(titles, keyword);

      const viralScore = Math.round(
        engagementRateRaw > 0.05 ? 8.5 : engagementRateRaw > 0.02 ? 6.5 : 4.5,
      );

      console.log(
        `✅ Analysis complete: ${competition} competition, ${trend} trend, difficulty: 55`,
      );
      console.log(`📊 Total API calls: 2`);

      return {
        keyword,
        searchVolume: totalResults,
        competition,
        trend,
        difficultyScore: 55,
        difficultyReason: `${competition} competition with ${trend} interest trend. Avg views: ${avgViews.toLocaleString()}`,
        monetizationPotential: {
          estimatedRevenuePerVideo: `$${estRevLow}-$${estRevHigh}`,
          cpmRate: `$${cpm?.low}-$${cpm?.high} (${cpm?.label})`,
          monthlyPotential: `$${estRevLow * 4}-$${estRevHigh * 4} (approx 4 uploads)`,
        },
        optimalVideoLength: {
          avgLength: `${Math.round(avgDuration)} minutes`,
          insight:
            avgDuration > 10
              ? "Long-form content is preferred by audience"
              : "Short, punchy content works better",
        },
        titleInsights: {
          commonWords,
          avgTitleLength: `${Math.round(titles.join("").length / count)} characters`,
          topPattern: `${commonWords[0] || "Best"} ${keyword} ${commonWords[1] || "tutorial"}`,
        },
        competitorInsights: {
          topChannelUploadFrequency:
            avgViews > 50000 ? "3-5 times/week" : "1-2 times/week",
          recommendedFrequency:
            avgViews > 50000
              ? "2-3 times/week for consistency"
              : "Weekly uploads",
        },
        seoRecommendations: {
          suggestedTags: [
            keyword,
            ...commonWords.map((w) => `${keyword} ${w}`),
          ].slice(0, 10),
          longTailKeywords: [
            `how to ${keyword} for beginners`,
            `${keyword} tutorial ${new Date().getFullYear()}`,
            `best ${keyword}`,
            `${keyword} tips and tricks`,
          ],
          searchability: totalResults > 500000 ? "Medium" : "High",
        },
        viralPotential: {
          score: viralScore,
          reasoning:
            engagementRateRaw > 0.05
              ? "Very high engagement rate indicates strong viral potential"
              : engagementRateRaw > 0.02
                ? "Good engagement rate with moderate viral potential"
                : "Standard engagement levels",
          timing:
            trendScore > 40
              ? "Post immediately - topic is rising"
              : "Post during peak hours (Thu-Fri)",
        },
        relatedTopics: this.extractRelatedKeywordsFromTitles(
          keyword,
          searchRes.items,
        ).slice(0, 5),
        youtubeData: {
          videoCount: videos.length,
          avgViews,
          topChannels: videos
            .slice(0, 3)
            .map((v) => v.snippet?.channelTitle || "Unknown"),
          avgLikes,
          avgComments,
          engagementRate: `${(engagementRateRaw * 100).toFixed(2)}%`,
        },
      };
    } catch (error: any) {
      console.error("❌ Analysis error:", error);
      throw new Error(`Failed to analyze topic: ${error.message}`);
    }
  }

  // ========================================
  // 🎯 ADVANCED VIDEO SEARCH - OPTIMIZED (2-3 API CALLS)
  // ========================================
  async searchVideosAdvanced(
    query: string,
    filters: AdvancedVideoFilters,
  ): Promise<EnrichedVideoData[]> {
    const maxResults = this.validateMaxResults(filters.maxResults || 20);

    // Map frontend sort to YouTube API order
    const sortMapping = {
      latest: "date",
      bestMatch: "relevance",
      mostViews: "viewCount",
      topRated: "rating",
    };
    const sort = sortMapping[filters.sort || "bestMatch"] || "relevance";

    console.log(
      `🎯 Searching: "${query}" | Sort: ${filters.sort} | Type: ${filters.contentType || "all"}`,
    );

    try {
      // ========================================
      // STEP 1: Calculate how many to fetch
      // ========================================
      const fetchMultiplier = 3; // Fetch 3x to account for filtering
      const targetFetch = Math.min(maxResults * fetchMultiplier, 150);

      let allSearchResults: any[] = [];
      let pageToken: string | undefined = undefined;
      let searchCalls = 0;
      const maxSearchCalls = Math.ceil(targetFetch / 50);

      // ========================================
      // API CALL 1-2: Search with YouTube filters
      // ========================================
      while (
        allSearchResults.length < targetFetch &&
        searchCalls < maxSearchCalls
      ) {
        searchCalls++;

        const remainingNeeded = targetFetch - allSearchResults.length;
        const fetchCount = Math.min(remainingNeeded, 50);

        const searchParams: any = {
          order: sort,
          maxResults: fetchCount,
        };

        // Apply YouTube's native content type filter
        if (filters.contentType === "shorts") {
          searchParams.videoDuration = "short"; // < 4 minutes
        } else if (filters.contentType === "longForm") {
          searchParams.videoDuration = "long"; // > 20 minutes
        }

        if (pageToken) {
          searchParams.pageToken = pageToken;
        }

        console.log(
          `📡 Search API Call ${searchCalls}: Fetching ${fetchCount} videos...`,
        );

        const searchRes = await youtubeService.searchVideos(
          query,
          fetchCount,
          searchParams,
        );

        if (!searchRes.items || searchRes.items.length === 0) {
          console.log("❌ No more videos found");
          break;
        }

        allSearchResults.push(...searchRes.items);
        pageToken = searchRes.nextPageToken;

        if (!pageToken) break;
      }

      console.log(
        `📦 Fetched ${allSearchResults.length} raw videos in ${searchCalls} calls`,
      );

      if (allSearchResults.length === 0) {
        return [];
      }

      // ========================================
      // API CALL 2: Get video stats (batched)
      // ========================================
      const videoIds = [
        ...new Set(allSearchResults.map((i: any) => i.id.videoId)),
      ];
      console.log(
        `📊 Stats API Call: Getting details for ${videoIds.length} videos...`,
      );

      let allVideoStats: any[] = [];

      // Batch in chunks of 50 (YouTube API limit)
      for (let i = 0; i < videoIds.length; i += 50) {
        const chunk = videoIds.slice(i, i + 50);
        const statsRes = await youtubeService.getVideoStats(chunk);
        if (statsRes.items) {
          allVideoStats.push(...statsRes.items);
        }
      }

      console.log(`✅ Got stats for ${allVideoStats.length} videos`);

      if (allVideoStats.length === 0) {
        return [];
      }

      // ========================================
      // API CALL 3: Get channel stats (CONDITIONAL)
      // ========================================
      let channelLookup: Record<string, number> = {};

      // Only fetch channel stats if needed for high view filters
      const needsChannelStats = filters.minViews && filters.minViews >= 10000;

      if (needsChannelStats) {
        const channelIds = [
          ...new Set(allVideoStats.map((v) => v.snippet.channelId)),
        ];
        console.log(
          `👥 Channel API Call: Getting stats for ${channelIds.length} channels...`,
        );

        for (let i = 0; i < channelIds.length; i += 50) {
          const chunk = channelIds.slice(i, i + 50);
          const channelRes = await youtubeService.getChannelsStats(chunk);
          channelRes.items.forEach((ch) => {
            channelLookup[ch.id] = parseInt(
              ch.statistics?.subscriberCount || "0",
            );
          });
        }

        console.log(
          `✅ Got channel stats for ${Object.keys(channelLookup).length} channels`,
        );
      }

      // ========================================
      // STEP 2: Enrich videos with all metrics
      // ========================================
      console.log(`🔧 Enriching ${allVideoStats.length} videos...`);

      const enrichedVideos = allVideoStats.map((v) => {
        const views = parseInt(v.statistics?.viewCount || "0");
        const likes = parseInt(v.statistics?.likeCount || "0");
        const comments = parseInt(v.statistics?.commentCount || "0");
        const duration = parseDurationToMinutes(
          v.contentDetails?.duration || "PT0M",
        );

        // Time-based metrics
        const published = new Date(v.snippet.publishedAt).getTime();
        const hoursSinceUpload = (Date.now() - published) / (1000 * 60 * 60);
        const viewsPerHour =
          hoursSinceUpload > 0 ? Math.round(views / hoursSinceUpload) : 0;

        const freshnessScore =
          hoursSinceUpload < 24
            ? 100
            : Math.max(0, 100 - hoursSinceUpload / 24);

        // Subscriber data (exact or estimated)
        const subscribers =
          channelLookup[v.snippet.channelId] || Math.round(views / 100);
        const viewToSubRatio = subscribers > 0 ? views / subscribers : 0;

        // Engagement metrics
        const engagementRate =
          views > 0 ? ((likes + comments) / views) * 100 : 0;

        // Viral Score (Outlier Score) - 200% = 200
        const avgViewsForCategory = 50000;
        const outlierScore =
          views > 0
            ? Math.min(Math.round((views / avgViewsForCategory) * 100), 1000)
            : 0;

        return {
          id: v.id,
          videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
          title: v.snippet.title,
          thumbnail:
            v.snippet.thumbnails?.high?.url ||
            v.snippet.thumbnails?.default?.url ||
            "",
          channel: v.snippet.channelTitle,
          channelId: v.snippet.channelId,
          channelUrl: `https://www.youtube.com/channel/${v.snippet.channelId}`,
          publishedAt: v.snippet.publishedAt,
          views,
          likes,
          comments,
          duration,
          durationMins: duration,
          isShort: duration < 1,
          subscribers,
          viewsPerHour,
          engagementRate,
          viewToSubRatio,
          outlierScore,
          freshnessScore: Math.round(freshnessScore),
          tags: v.snippet.tags || [],
        };
      });

      // ========================================
      // STEP 3: Apply frontend filters
      // ========================================
      console.log(`🔍 Applying filters...`);

      let filteredVideos = this.applyFrontendFilters(enrichedVideos, filters);

      console.log(`✅ After filtering: ${filteredVideos.length} videos`);

      // ========================================
      // STEP 4: Deduplicate
      // ========================================
      const uniqueMap = new Map();
      filteredVideos.forEach((item) => uniqueMap.set(item.id, item));
      const uniqueVideos = Array.from(uniqueMap.values());

      // ========================================
      // STEP 5: Apply sorting (if not done by YouTube)
      // ========================================
      let sortedVideos = this.applySorting(
        uniqueVideos,
        filters.sort || "bestMatch",
      );

      // ========================================
      // STEP 6: Return exact count requested
      // ========================================
      const finalResults = sortedVideos.slice(0, maxResults);

      const totalApiCalls =
        searchCalls +
        Math.ceil(videoIds.length / 50) +
        (needsChannelStats
          ? Math.ceil(Object.keys(channelLookup).length / 50)
          : 0);

      console.log(`✅ FINAL: Returning ${finalResults.length} videos`);
      console.log(`📊 Total API calls: ${totalApiCalls}`);

      return finalResults;
    } catch (error: any) {
      console.error("❌ Search error:", error);
      throw new Error(`Failed to search videos: ${error.message}`);
    }
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private applyFrontendFilters(
    videos: EnrichedVideoData[],
    filters: AdvancedVideoFilters,
  ): EnrichedVideoData[] {
    return videos.filter((v) => {
      // Content Type filter (double-check YouTube's filter)
      if (filters.contentType === "shorts" && !v.isShort) return false;
      if (filters.contentType === "longForm" && v.durationMins < 10)
        return false;

      // Viral Score filter (200% = 200)
      if (filters.viralScore !== undefined) {
        if (v.outlierScore < filters.viralScore) return false;
      }

      // Min Views filter (10K+ = 10000)
      if (filters.minViews !== undefined) {
        if (v.views < filters.minViews) return false;
      }

      return true;
    });
  }

  private applySorting(
    videos: EnrichedVideoData[],
    sort: string,
  ): EnrichedVideoData[] {
    const sorted = [...videos];

    switch (sort) {
      case "latest":
        return sorted.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        );
      case "mostViews":
        return sorted.sort((a, b) => b.views - a.views);
      case "topRated":
        return sorted.sort((a, b) => b.engagementRate - a.engagementRate);
      case "bestMatch":
      default:
        return sorted; // Already sorted by YouTube relevance
    }
  }

  private validateMaxResults(maxResults: any): 20 | 50 | 100 {
    const validValues = [20, 50, 100];
    const result = parseInt(maxResults as string);
    return validValues.includes(result) ? (result as 20 | 50 | 100) : 20;
  }
}

export default new TopicService();
