// src/utils/streamWriter.ts
import type { Response } from 'express';

export class StreamWriter {
  private res: Response;
  private isClosed: boolean = false;

  constructor(res: Response) {
    this.res = res;
    
    // Set headers for streaming
    this.res.setHeader('Content-Type', 'application/json');
    this.res.setHeader('Transfer-Encoding', 'chunked');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Flush headers immediately
    this.res.flushHeaders();
  }

  /**
   * Send a chunk of data to the client
   */
  write(data: any): boolean {
    if (this.isClosed) {
      console.warn('⚠️ Attempted to write to closed stream');
      return false;
    }
    
    try {
      // Send as newline-delimited JSON (NDJSON)
      const jsonString = JSON.stringify(data) + '\n';
      return this.res.write(jsonString);
    } catch (error) {
      console.error('❌ Error writing to stream:', error);
      return false;
    }
  }

  /**
   * Send a log message
   */
  log(message: string, level: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
    console.log(`[${level.toUpperCase()}] ${message}`); // Also log to console
    this.write({
      type: 'log',
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send agent status update
   */
  agentStatus(agent: string, status: 'started' | 'completed' | 'error', data?: any): void {
    console.log(`🤖 Agent ${agent}: ${status}`);
    this.write({
      type: 'agent_status',
      agent,
      status,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send progress update
   */
  progress(current: number, total: number, message?: string): void {
    const percentage = Math.round((current / total) * 100);
    console.log(`📊 Progress: ${percentage}% - ${message || ''}`);
    this.write({
      type: 'progress',
      current,
      total,
      percentage,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send final result
   */
  final(data: any): void {
    console.log('✅ Sending final result');
    this.write({
      type: 'final',
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * End the stream
   */
  end(): void {
    if (this.isClosed) return;
    console.log('🔚 Closing stream');
    this.isClosed = true;
    this.res.end();
  }
}