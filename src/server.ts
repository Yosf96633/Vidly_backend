// src/server.ts
import { createServer } from 'http';
import app from "./app";
import { config } from "dotenv";
import { connectDB } from "./config/connectDB";
import { socketService } from "./services/socket.service";
import "./workers/video.worker";

config();

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO (only in production)
socketService.initialize(httpServer);

// Start server
httpServer.listen(PORT, async () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  
  await connectDB();
  
  console.log('✅ Server initialization complete');
  console.log('👷 Worker is running in background with concurrency: 2');
  
  if (NODE_ENV === 'production') {
    console.log('🔌 Socket.IO: ENABLED (Real-time updates active)');
  } else {
    console.log('🔌 Socket.IO: DISABLED (Postman testing mode)');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});