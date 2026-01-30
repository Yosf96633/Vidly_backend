// src/workers/video.worker.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import type { VideoAnalysisJobData } from '../config/queue';
import youtubeService from '../services/youtube.service';
import { executeAnalysisWorkflow } from '../services/sentiment.service';
import { socketService } from '../services/socket.service';

async function processVideoAnalysis(job: Job<VideoAnalysisJobData>) {
  const { jobId, videoId, videoUrl } = job.data;
  
  try {
    // Emit: Job started
    socketService.emitProgress({
      jobId,
      videoId,
      stage: 'queued',
      message: 'Analysis started',
      percentage: 0,
      timestamp: Date.now(),
    });

    // ========================================
    // PARALLEL EXECUTION: Comments + Transcript
    // ========================================
    await job.updateProgress(10);
    
    socketService.emitProgress({
      jobId,
      videoId,
      stage: 'fetching_comments',
      message: 'Fetching comments from YouTube...',
      percentage: 10,
      timestamp: Date.now(),
    });    
    const [commentsResult, transcriptResult] = await Promise.allSettled([
      youtubeService.fetchAllComments(videoId),
      youtubeService.fetchTranscript(videoId),
    ]);
    
    // Handle comments result
    let allComments: any[] = [];
    if (commentsResult.status === 'fulfilled') {
      allComments = commentsResult.value;
      console.log(`✅ Comments fetched: ${allComments.length} total`);
      
      socketService.emitProgress({
        jobId,
        videoId,
        stage: 'fetching_comments',
        message: `Successfully fetched ${allComments.length} comments`,
        percentage: 20,
        data: { commentsCount: allComments.length },
        timestamp: Date.now(),
      });
    } else {
      console.error(`❌ Comments fetch failed:`, commentsResult.reason);
      
      socketService.emitError({
        jobId,
        error: `Failed to fetch comments: ${commentsResult.reason.message}`,
        timestamp: Date.now(),
      });
      
      throw new Error(`Failed to fetch comments: ${commentsResult.reason.message}`);
    }
    
    // Handle transcript result (non-blocking)
    let transcriptData = { text: '', available: false };
    
    socketService.emitProgress({
      jobId,
      videoId,
      stage: 'fetching_transcript',
      message: 'Fetching video transcript...',
      percentage: 25,
      timestamp: Date.now(),
    });
    
    if (transcriptResult.status === 'fulfilled') {
      transcriptData = transcriptResult.value;
      console.log(`✅ Transcript fetched: ${transcriptData.available ? transcriptData.text.length + ' chars' : 'not available'}`);
      
      socketService.emitProgress({
        jobId,
        videoId,
        stage: 'fetching_transcript',
        message: transcriptData.available 
          ? `Transcript fetched (${transcriptData.text.length} characters)` 
          : 'Transcript not available - continuing without it',
        percentage: 30,
        data: { transcriptAvailable: transcriptData.available },
        timestamp: Date.now(),
      });
    } else {
      console.warn(`⚠️ Transcript fetch failed (continuing without it):`, transcriptResult.reason.message);
      
      socketService.emitProgress({
        jobId,
        videoId,
        stage: 'fetching_transcript',
        message: 'Transcript not available - continuing without it',
        percentage: 30,
        data: { transcriptAvailable: false },
        timestamp: Date.now(),
      });
    }
    
    // Validate comments
    if (allComments.length === 0) {
      socketService.emitError({
        jobId,
        error: 'No comments found for this video',
        timestamp: Date.now(),
      });
      throw new Error('No comments found for this video');
    }
    
    await job.updateProgress(40);
    
    socketService.emitProgress({
      jobId,
      videoId,
      stage: 'classifying_comments',
      message: 'Starting sentiment analysis...',
      percentage: 40,
      timestamp: Date.now(),
    });
    
    // ========================================
    // EXECUTE ANALYSIS WORKFLOW
    // ========================================
    console.log('🤖 Executing sentiment analysis workflow...');
    
    const result = await executeAnalysisWorkflow(
      videoId,
      allComments,
      transcriptData.text,
      transcriptData.available,
      jobId // Pass jobId for progress tracking
    );
    
    await job.updateProgress(100);
    
    socketService.emitProgress({
      jobId,
      videoId,
      stage: 'completed',
      message: 'Analysis completed successfully!',
      percentage: 100,
      timestamp: Date.now(),
    });
    
    // Emit final result
    socketService.emitCompletion(jobId, {
      jobId,
      videoId,
      status: 'completed',
      ...result,
    });
    
    console.log(`✅ Job ${jobId} completed successfully`);
    
    return {
      jobId,
      videoId,
      status: 'completed',
      ...result,
    };
    
  } catch (error: any) {
    console.error(`❌ Job ${jobId} failed:`, error.message);
    
    socketService.emitError({
      jobId,
      error: error.message,
      timestamp: Date.now(),
    });
    
    throw error;
  }
}

// Create worker with concurrency of 3
export const videoAnalysisWorker = new Worker(
  'video-analysis',
  processVideoAnalysis,
  {
    connection: redisConnection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

// Worker event handlers
videoAnalysisWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

videoAnalysisWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed with error:`, err.message);
});

videoAnalysisWorker.on('active', (job) => {
  console.log(`🔄 Job ${job.id} is now active`);
});

videoAnalysisWorker.on('progress', (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

console.log('👷 Video analysis worker started with concurrency: 3');