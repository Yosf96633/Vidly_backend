// src/types/socket.types.ts

/**
 * Stages for video analysis workflow
 */
export type AnalysisStage =
  | "queued"
  | "fetching_comments"
  | "fetching_transcript"
  | "classifying_comments"
  | "analyzing_emotions"
  | "analyzing_patterns"
  | "analyzing_loved"
  | "analyzing_parallel"
  | "analyzing_improvements"
  | "analyzing_wantmore"
  | "summarizing"
  | "completed"
  | "failed";

/**
 * Stages for video idea validation workflow
 */
export type ValidationStage = 
  | "initialization"
  | "competition_analysis"
  | "audience_analysis"
  | "trend_analysis"
  | "strategy_analysis"
  | "parallel_complete"
  | "final_synthesis"
  | "completed"
  | "error";

/**
 * Combined stage type for all workflows
 */
export type WorkflowStage = AnalysisStage | ValidationStage;

/**
 * Progress event for video analysis workflow
 */
export interface AnalysisProgressEvent {
  jobId: string;
  videoId: string;
  stage: AnalysisStage;
  message: string;
  percentage: number;
  data?: {
    commentsCount?: number;
    batchNumber?: number;
    totalBatches?: number;
    transcriptAvailable?: boolean;
    [key: string]: any;
  };
  timestamp: number;
}

/**
 * Progress event for video idea validation workflow
 */
export interface ValidationProgressEvent {
  jobId: string;
  stage: ValidationStage;
  message: string;
  percentage: number;
  details?: string;
  timestamp: number;
}

/**
 * Generic progress event (supports both workflows)
 */
export type ProgressEvent = AnalysisProgressEvent | ValidationProgressEvent;

/**
 * Socket client query parameters
 */
export interface SocketClientQuery {
  jobId: string;
}

/**
 * Error event emitted when any workflow fails
 */
export interface ErrorEvent {
  jobId: string;
  error: string;
  stage?: WorkflowStage;
  details?: string;
  timestamp: number;
}

/**
 * Completion event emitted when workflow succeeds
 */
export interface CompletionEvent {
  jobId: string;
  result: any;
  timestamp: number;
}

/**
 * Connection event emitted when client connects
 */
export interface ConnectionEvent {
  jobId: string;
  message: string;
  timestamp: number;
}

/**
 * Socket event types
 */
export type SocketEvent = 
  | { type: 'connected'; data: ConnectionEvent }
  | { type: 'progress'; data: ProgressEvent }
  | { type: 'error'; data: ErrorEvent }
  | { type: 'completed'; data: CompletionEvent };

/**
 * Socket room naming convention
 */
export type SocketRoom = `job:${string}`;