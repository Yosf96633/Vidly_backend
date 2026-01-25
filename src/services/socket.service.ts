// src/services/socket.service.ts
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { ProgressEvent, ErrorEvent } from '../types/socket.types';

class SocketService {
  private io: SocketIOServer | null = null;
  private isEnabled: boolean = false;

  initialize(httpServer: HTTPServer) {
    const NODE_ENV = process.env.NODE_ENV || 'development';
    
    // Only enable sockets in production or when explicitly enabled
    this.isEnabled = true;
    
    if (!this.isEnabled) {
      console.log('🔌 Socket.IO DISABLED (development mode - using Postman)');
      return;
    }

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      path: '/socket.io',
    });

    this.setupEventHandlers();
    console.log('🔌 Socket.IO server initialized');
  }

  private setupEventHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      const jobId = socket.handshake.query.jobId as string;

      if (!jobId) {
        console.warn('⚠️ Socket connected without jobId');
        socket.disconnect();
        return;
      }

      const roomName = `job:${jobId}`;
      socket.join(roomName);

      console.log(`🔗 Client connected to room: ${roomName} (socketId: ${socket.id})`);

      // Send connection confirmation
      socket.emit('connected', {
        jobId,
        message: 'Connected to job updates',
        timestamp: Date.now(),
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected from room: ${roomName} (socketId: ${socket.id})`);
      });
    });
  }

  // Emit progress update to specific job room
  emitProgress(event: ProgressEvent) {
    if (!this.isEnabled || !this.io) {
      // Silently skip if sockets disabled (Postman mode)
      return;
    }

    const roomName = `job:${event.jobId}`;
    this.io.to(roomName).emit('progress', event);
    
    console.log(`📤 Progress emitted to ${roomName}: ${event.stage} (${event.percentage}%)`);
  }

  // Emit error to specific job room
  emitError(event: ErrorEvent) {
    if (!this.isEnabled || !this.io) {
      return;
    }

    const roomName = `job:${event.jobId}`;
    this.io.to(roomName).emit('error', event);
    
    console.error(`❌ Error emitted to ${roomName}: ${event.error}`);
  }

  // Emit completion to specific job room
  emitCompletion(jobId: string, result: any) {
    if (!this.isEnabled || !this.io) {
      return;
    }

    const roomName = `job:${jobId}`;
    this.io.to(roomName).emit('completed', {
      jobId,
      result,
      timestamp: Date.now(),
    });
    
    console.log(`✅ Completion emitted to ${roomName}`);
  }

  // Check if socket service is enabled
  isSocketEnabled(): boolean {
    return this.isEnabled;
  }

  // Get connected clients count for a job
  getConnectedClients(jobId: string): number {
    if (!this.isEnabled || !this.io) {
      return 0;
    }

    const roomName = `job:${jobId}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }
}

// Export singleton instance
export const socketService = new SocketService();