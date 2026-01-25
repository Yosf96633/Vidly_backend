import { Router } from 'express';
import { contactController } from '../controllers/contact.controller';

const router = Router();

router.post('/contact', contactController.sendContactMessage);

export default router;