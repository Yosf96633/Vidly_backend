import { Router } from 'express';
import { feedbackController } from '../controllers/feedback.controller';

const router = Router();

router.post('/', feedbackController.submitFeedback);

router.get('/stats', feedbackController.getFeedbackStats); 
export default router;