import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not defined in environment variables');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const emailConfig = {
  from: process.env.EMAIL_FROM || 'noreply@getvidly.com',
  to: process.env.EMAIL_TO || 'vidly.officials@gmail.com',
};