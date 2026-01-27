import type { Request, Response } from 'express';
import topicService from '../services/topic.service';
import type { AdvancedVideoFilters } from '../utils/interfaces';

class TopicController {
  
  // 1️⃣ Analyze Topic - ADVANCED
  async analyzeTopic(req: Request, res: Response): Promise<void> {
    try {
      const { keyword } = req.body;

      if (!keyword || typeof keyword !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Keyword is required and must be a string',
        });
        return;
      }

      const topicData = await topicService.analyzeTopic(keyword);

      res.status(200).json({
        success: true,
        data: topicData,
      });
    } catch (error: any) {
      console.error('Error in analyzeTopic:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to analyze topic',
      });
    }
  }

  // 2️⃣ Search Topics - ADVANCED
  async searchTopics(req: Request, res: Response): Promise<void> {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
        return;
      }

      const result = await topicService.searchTopics(query);

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('Error in searchTopics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to search topics',
      });
    }
  }

  // 3️⃣ Get Suggestions - ADVANCED
  async getTopicSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { keyword } = req.query;

      if (!keyword || typeof keyword !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Keyword is required',
        });
        return;
      }

      const suggestions = await topicService.getSuggestions(keyword);

      res.status(200).json({
        success: true,
        data: suggestions,
      });
    } catch (error: any) {
      console.error('Error in getTopicSuggestions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get topic suggestions',
      });
    }
  }

  // 4️⃣ Advanced Video Search with Comprehensive Filters
  async searchVideosAdvanced(req: Request, res: Response): Promise<void> {
    try {
      const { 
        query, 
        sort,           // 'latest' | 'bestMatch' | 'mostViews' | 'topRated'
        contentType,    // 'longForm' | 'shorts' | 'all'
        viralScore,     // Number (e.g., 200 for 200%)
        minViews,       // Number (e.g., 10000 for "10K+")
        maxResults
      } = req.query;

      // Validate query
      if (!query || typeof query !== 'string') {
        res.status(400).json({ 
          success: false, 
          message: 'Query is required' 
        });
        return;
      }

      // Validate sort
      const validSorts = ['latest', 'bestMatch', 'mostViews', 'topRated'];
      const sortFilter = (sort && validSorts.includes(sort as string)) 
        ? sort as string 
        : 'bestMatch';

      // Validate content type
      const validTypes = ['all', 'shorts', 'longForm'];
      const typeFilter = (contentType && validTypes.includes(contentType as string)) 
        ? contentType as string 
        : 'all';

      // Parse viral score (200% = 200)
      const viralScoreFilter = viralScore 
        ? parseInt(viralScore as string) 
        : undefined;

      // Parse min views (10K+ = 10000)
      const minViewsFilter = minViews 
        ? parseInt(minViews as string) 
        : undefined;

      // Validate maxResults
      let maxResultsFilter: 20 | 50 | 100 = 20;
      if (maxResults) {
        const parsed = parseInt(maxResults as string);
        if ([20, 50, 100].includes(parsed)) {
          maxResultsFilter = parsed as 20 | 50 | 100;
        }
      }

      // Build filters object
      const filters: AdvancedVideoFilters = {
        sort: sortFilter as any,
        contentType: typeFilter as any,
        viralScore: viralScoreFilter,
        minViews: minViewsFilter,
        maxResults: maxResultsFilter
      };

      // Execute search
      console.log(`🎯 Search Request: "${query}"`, filters);
      
      const results = await topicService.searchVideosAdvanced(query, filters);

      // Return response
      res.status(200).json({
        success: true,
        count: results.length,
        query,
        filters: {
          sort: sortFilter,
          contentType: typeFilter,
          viralScore: viralScoreFilter || 'none',
          minViews: minViewsFilter || 'none',
          maxResults: maxResultsFilter
        },
        data: results
      });

    } catch (error: any) {
      console.error('❌ Advanced Search Error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to search videos' 
      });
    }
  }
}

export default new TopicController();