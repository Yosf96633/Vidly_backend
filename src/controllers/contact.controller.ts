import type { Request, Response } from 'express';
import { ContactService } from '../services/contact.service';

const contactService = new ContactService();

export const contactController = {
  async sendContactMessage(req: Request, res: Response): Promise<void> {
    try {
      const { name, email, message } = req.body;

      // Validate input data
      const validation = contactService.validateContactData({
        name,
        email,
        message,
      });

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors,
        });
        return;
      }

      // Send email
      const result = await contactService.sendContactEmail({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Your message has been sent successfully. We will get back to you soon!',
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send message. Please try again later.',
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Contact controller error:', error);
      res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again later.',
      });
    }
  },
};