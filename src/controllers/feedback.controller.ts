import type { Request, Response } from 'express';
import { FeedbackService } from '../services/feedback.service';

const feedbackService = new FeedbackService();


export const feedbackController = {
  async submitFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { rating, tool, feedback, email } = req.body;

      console.log('Received feedback:', { rating, tool, feedback, email });

      // Get additional info from request
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

      // Validate input data
      const validation = feedbackService.validateFeedbackData({
        rating,
        tool,
        feedback,
        email,
        userAgent: String(userAgent),
        ipAddress: String(ipAddress),
      });

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors,
        });
        return;
      }

      // Process feedback (send email, save to DB, etc.)
      const result = await feedbackService.processFeedback({
        rating: Number(rating),
        tool: tool.trim(),
        feedback: feedback.trim(),
        email: email ? email.trim().toLowerCase() : undefined,
        userAgent: String(userAgent),
        ipAddress: String(ipAddress),
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Thank you for your feedback! It helps us improve our tools.',
          feedbackId: result.feedbackId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to submit feedback. Please try again later.',
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Feedback controller error:', error);
      res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again later.',
      });
    }
  },

  // Optional: For admin dashboard
  async getFeedbackStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await feedbackService.getFeedbackStatistics();
      
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Get feedback stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve feedback statistics.',
      });
    }
  },
};