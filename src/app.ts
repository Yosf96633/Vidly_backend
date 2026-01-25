// src/app.ts
import express from "express";
import cors from "cors";
import videoRoutes from "./routes/sentiment.routes.js";
import topicRoutes from "./routes/topic.routes.js";
import validateRoutes from "./routes/validate.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import usageRoutes from "./routes/usage.routes.js";
import {
  securityHeaders,
  sanitizeInput,
  preventNoSQLInjection,
  requestSizeLimiter,
  configureTrustedProxies,
  errorHandler,
  notFoundHandler,
} from "./middleware/security.middleware.js";

const app = express();

// Trust proxy for Render deployment
configureTrustedProxies(app);

// CORS Configuration
const allowedOrigins = [
  'https://vidspire.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // 24 hours
  })
);

// Security Middlewares (MUST be before routes)
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(sanitizeInput);
app.use(preventNoSQLInjection);
app.use(requestSizeLimiter(100)); // 100KB max

// Health check endpoint (no rate limit)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/feedback', feedbackRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api', contactRoutes);
app.use("/api", validateRoutes);
app.use('/api/usage', usageRoutes);

// 404 Handler
app.use(notFoundHandler);

// Error Handler (MUST be last)
app.use(errorHandler);

export default app;