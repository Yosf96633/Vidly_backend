// src/app.ts
import express from "express";
import cors from "cors";
import videoRoutes from "./routes/sentiment.routes.js";
import topicRoutes from "./routes/topic.routes.js";
import validateRoutes from "./routes/validate.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/security.middleware.js";

const app = express();


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


app.use(express.json({ limit: '100kb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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

// 404 Handler
app.use(notFoundHandler);

// Error Handler (MUST be last)
app.use(errorHandler);

export default app;