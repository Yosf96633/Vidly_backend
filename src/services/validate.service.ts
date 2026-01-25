// src/services/validate.service.ts
import { StateGraph, END, Annotation, START } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { config } from "dotenv";
import { StreamWriter } from "../utils/streamWriter";
import { ChatOpenAI } from "@langchain/openai";

// Import all tools
import {
  getSearchDemandTool,
  checkCompetitionTool,
  getAudienceRelatabilityTool,
  getTrendingSignalsTool,
  findReferenceVideoTool,
  searchGoogleTrendsTool,
  scrapeTopChannelsTool,
  analyzeCommentsTool,
  fetchVideoTranscriptTool,
  estimateMetricsTool,
} from "../tools/index";

// Import types and schemas
import type {
  ValidateIdeaInput,
  CompetitionAgentOutput,
  AudienceAgentOutput,
  TrendAgentOutput,
  StrategyAgentOutput,
  FinalOutput,
} from "../schemas/validation.schemas";

import {
  CompetitionAgentOutputSchema,
  AudienceAgentOutputSchema,
  TrendAgentOutputSchema,
  StrategyAgentOutputSchema,
  FinalOutputSchema,
  ReferenceVideoSchema,
} from "../schemas/validation.schemas";
import z from "zod";

config();

// ========================================
// STATE DEFINITION WITH COMPLETION TRACKING
// ========================================

const AgentState = Annotation.Root({
  // Input fields
  idea: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  targetAudience: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  goal: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  // Add jobId for socket tracking
  jobId: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),

  // Agent outputs (will be populated by parallel agents)
  competitionAnalysis: Annotation<CompetitionAgentOutput | null>({
    reducer: (prev, next) => next ?? prev,
    default: () => null,
  }),
  audienceAnalysis: Annotation<AudienceAgentOutput | null>({
    reducer: (prev, next) => next ?? prev,
    default: () => null,
  }),
  trendAnalysis: Annotation<TrendAgentOutput | null>({
    reducer: (prev, next) => next ?? prev,
    default: () => null,
  }),
  strategyAnalysis: Annotation<StrategyAgentOutput | null>({
    reducer: (prev, next) => next ?? prev,
    default: () => null,
  }),

  // Completion tracking
  agentsCompleted: Annotation<Set<string>>({
    reducer: (prev, next) => {
      if (!next) return prev || new Set();
      const updated = new Set(prev || []);
      if (typeof next === "string") {
        updated.add(next);
      } else if (next instanceof Set) {
        next.forEach((item) => updated.add(item));
      }
      return updated;
    },
    default: () => new Set(),
  }),

  // Final output
  finalOutput: Annotation<FinalOutput | null>({
    reducer: (prev, next) => next ?? prev,
    default: () => null,
  }),
});

// ========================================
// AGENT 1: COMPETITION AGENT
// ========================================

async function competitionAgentNode(
  state: typeof AgentState.State,
  streamWriter: StreamWriter
): Promise<Partial<typeof AgentState.State>> {
  streamWriter.agentStatus("competition", "started");
  streamWriter.log("🔍 Competition Agent: Starting analysis...", "info");

  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).bindTools([
    checkCompetitionTool,
    scrapeTopChannelsTool,
    estimateMetricsTool,
  ]);

  const modelWithSchema = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).withStructuredOutput(CompetitionAgentOutputSchema);

  const researchPrompt = `You are a competition analysis expert for YouTube.

VIDEO IDEA: "${state.idea}"
TARGET AUDIENCE: "${state.targetAudience}"
GOAL: "${state.goal}"

Your task: Analyze the competition landscape using these tools:
1. checkCompetition - Check overall competition level
2. scrapeTopChannels - Analyze top competing channels
3. estimateMetrics - Estimate performance metrics

Call ALL 3 tools to gather comprehensive competition data. Be thorough!`;

  let messages: any[] = [new HumanMessage(researchPrompt)];
  let toolResults: any[] = [];

  // Tool execution loop
  for (let i = 0; i < 5; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of response.tool_calls) {
      streamWriter.log(`  📊 Calling tool: ${toolCall.name}`, "info");

      let result;
      const args = toolCall.args;

      if (toolCall.name === "checkCompetition") {
        result = await checkCompetitionTool.invoke(args as any);
      } else if (toolCall.name === "scrapeTopChannels") {
        result = await scrapeTopChannelsTool.invoke(args as any);
      } else if (toolCall.name === "estimateMetrics") {
        result = await estimateMetricsTool.invoke(args as any);
      }

      toolResults.push({ tool: toolCall.name, result });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });

      streamWriter.log(`  ✓ Tool completed: ${toolCall.name}`, "success");
    }
  }

  streamWriter.log("🔄 Competition Agent: Synthesizing findings...", "info");

  const synthesisPrompt = `Based on the competition research data collected, provide a comprehensive competition analysis.

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Analyze and provide:
1. competitionBreakdown: Breakdown of big/medium/small creators, saturation score (0-100), entry barrier, dominant formats
2. marketGaps: 3-5 specific content gaps or opportunities
3. topCompetitors: Names of top 5-10 competing channels
4. qualityBenchmark: What quality level is needed to compete

Be specific and data-driven. Use the actual numbers from the tools.`;

  const competitionAnalysis = await modelWithSchema.invoke([
    new HumanMessage(synthesisPrompt),
  ]);

  streamWriter.log("✅ Competition Agent: Analysis complete", "success");
  streamWriter.agentStatus("competition", "completed", {
    saturationScore: competitionAnalysis.competitionBreakdown?.saturationScore,
    gapsFound: competitionAnalysis.marketGaps?.length,
  });

  return {
    competitionAnalysis: competitionAnalysis as CompetitionAgentOutput,
    agentsCompleted: "competition" as any,
  };
}

// ========================================
// AGENT 2: AUDIENCE AGENT
// ========================================

async function audienceAgentNode(
  state: typeof AgentState.State,
  streamWriter: StreamWriter
): Promise<Partial<typeof AgentState.State>> {
  const jobId = state.jobId;

  // ADD THIS - Right after function starts
  streamWriter.agentStatus("audience", "started");
  streamWriter.log("👥 Audience Agent: Starting analysis...", "info");

  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).bindTools([getAudienceRelatabilityTool, analyzeCommentsTool]);

  const modelWithSchema = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).withStructuredOutput(AudienceAgentOutputSchema);

  const researchPrompt = `You are an audience psychology expert for YouTube.

VIDEO IDEA: "${state.idea}"
TARGET AUDIENCE: "${state.targetAudience}"
GOAL: "${state.goal}"

Your task: Understand the target audience deeply using these tools:
1. getAudienceRelatability - Measure audience connection
2. analyzeComments - Extract pain points, questions, sentiment

Call BOTH tools to gather comprehensive audience insights.`;

  let messages: any[] = [new HumanMessage(researchPrompt)];
  let toolResults: any[] = [];

  for (let i = 0; i < 5; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of response.tool_calls) {
      // ADD THIS - Before each tool call
      streamWriter.log(`  📊 Calling tool: ${toolCall.name}`, "info");

      let result;
      const args = toolCall.args;

      if (toolCall.name === "getAudienceRelatability") {
        result = await getAudienceRelatabilityTool.invoke(args as any);
      } else if (toolCall.name === "analyzeComments") {
        result = await analyzeCommentsTool.invoke(args as any);
      }

      toolResults.push({ tool: toolCall.name, result });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });

      // ADD THIS - After each tool call
      streamWriter.log(`  ✓ Tool completed: ${toolCall.name}`, "success");
    }
  }

  // ADD THIS - Before synthesis
  streamWriter.log("🔄 Audience Agent: Synthesizing insights...", "info");

  const synthesisPrompt = `Based on the audience research data, provide comprehensive audience insights.

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Analyze and provide:
1. audienceInsights: Pain points (3-5), desires (3-5), common questions (3-5), relatability score (0-10)
2. targetDemographics: Specific demographic details (age, interests, viewing habits)
3. viewerIntent: Why people search for this content
4. emotionalTriggers: 3-5 emotional hooks that resonate with this audience

Be specific about what the audience truly wants and needs.`;

  const audienceAnalysis = await modelWithSchema.invoke([
    new HumanMessage(synthesisPrompt),
  ]);

  console.log("✅ Audience Agent: Analysis complete");
  console.log(
    "   Audience Data:",
    JSON.stringify(audienceAnalysis, null, 2).substring(0, 200) + "..."
  );

  // ADD THIS - After synthesis complete
  streamWriter.log("✅ Audience Agent: Analysis complete", "success");
  streamWriter.agentStatus("audience", "completed", {
    relatabilityScore: audienceAnalysis.audienceInsights?.relatabilityScore,
    painPointsFound: audienceAnalysis.audienceInsights?.painPoints?.length,
    emotionalTriggers: audienceAnalysis.emotionalTriggers?.length,
  });

  return {
    audienceAnalysis: audienceAnalysis as AudienceAgentOutput,
    agentsCompleted: "audience" as any,
  };
}

// ========================================
// AGENT 3: TREND AGENT
// ========================================

async function trendAgentNode(
  state: typeof AgentState.State,
  streamWriter: StreamWriter
): Promise<Partial<typeof AgentState.State>> {
  const jobId = state.jobId;

  // ADD THIS - Right after function starts
  streamWriter.agentStatus("trend", "started");
  streamWriter.log("📈 Trend Agent: Starting analysis...", "info");

  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).bindTools([
    getTrendingSignalsTool,
    searchGoogleTrendsTool,
    getSearchDemandTool,
  ]);

  const modelWithSchema = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).withStructuredOutput(TrendAgentOutputSchema);

  const researchPrompt = `You are a trend analysis expert for YouTube and Google.

VIDEO IDEA: "${state.idea}"
TARGET AUDIENCE: "${state.targetAudience}"
GOAL: "${state.goal}"

Your task: Analyze trending signals and search demand using these tools:
1. getTrendingSignals - Check YouTube trending data
2. searchGoogleTrends - Analyze Google search trends
3. getSearchDemand - Measure search volume

Call ALL 3 tools to understand trend trajectory and timing.`;

  let messages: any[] = [new HumanMessage(researchPrompt)];
  let toolResults: any[] = [];

  for (let i = 0; i < 5; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of response.tool_calls) {
      // ADD THIS - Before each tool call
      streamWriter.log(`  📊 Calling tool: ${toolCall.name}`, "info");

      let result;
      const args = toolCall.args;

      if (toolCall.name === "getTrendingSignals") {
        result = await getTrendingSignalsTool.invoke(args as any);
      } else if (toolCall.name === "searchGoogleTrends") {
        result = await searchGoogleTrendsTool.invoke(args as any);
      } else if (toolCall.name === "getSearchDemand") {
        result = await getSearchDemandTool.invoke(args as any);
      }

      toolResults.push({ tool: toolCall.name, result });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });

      // ADD THIS - After each tool call
      streamWriter.log(`  ✓ Tool completed: ${toolCall.name}`, "success");
    }
  }

  // ADD THIS - Before synthesis
  streamWriter.log("🔄 Trend Agent: Synthesizing trend data...", "info");

  const synthesisPrompt = `Based on the trend research data, provide comprehensive trend insights.

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Analyze and provide:
1. youtubeMetrics: Search volume, trend direction (RISING/STABLE/DECLINING), seasonality, avg engagement rate, virality potential (LOW/MEDIUM/HIGH)
2. trendingKeywords: 5-10 currently trending related keywords
3. bestTimingWindow: When to publish this content for maximum impact
4. futureOutlook: Predicted trend trajectory over next 3-6 months

Be specific about timing and trend momentum.`;

  const trendAnalysis = await modelWithSchema.invoke([
    new HumanMessage(synthesisPrompt),
  ]);

  console.log("✅ Trend Agent: Analysis complete");
  console.log(
    "   Trend Data:",
    JSON.stringify(trendAnalysis, null, 2).substring(0, 200) + "..."
  );

  // ADD THIS - After synthesis complete
  streamWriter.log("✅ Trend Agent: Analysis complete", "success");
  streamWriter.agentStatus("trend", "completed", {
    trendDirection: trendAnalysis.youtubeMetrics?.trendDirection,
    viralityPotential: trendAnalysis.youtubeMetrics?.viralityPotential,
    keywordsFound: trendAnalysis.trendingKeywords?.length,
  });

  return {
    trendAnalysis: trendAnalysis as TrendAgentOutput,
    agentsCompleted: "trend" as any,
  };
}

// ========================================
// AGENT 4: STRATEGY AGENT
// ========================================

async function strategyAgentNode(
  state: typeof AgentState.State,
  streamWriter: StreamWriter
): Promise<Partial<typeof AgentState.State>> {
  const jobId = state.jobId;

  // ADD THIS - Right after function starts
  streamWriter.agentStatus("strategy", "started");
  streamWriter.log("🎯 Strategy Agent: Starting analysis...", "info");

  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).bindTools([fetchVideoTranscriptTool, findReferenceVideoTool]);

  const modelWithSchema = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }).withStructuredOutput(StrategyAgentOutputSchema);

  const researchPrompt = `You are a content strategy expert for YouTube.

VIDEO IDEA: "${state.idea}"
TARGET AUDIENCE: "${state.targetAudience}"
GOAL: "${state.goal}"

Your task: Develop content strategy by analyzing successful videos:
1. fetchVideoTranscript - Analyze video structure and hooks
2. findReferenceVideo - Find successful reference videos (call this 2-3 times for variety)

Call these tools to understand what works in this niche.`;

  let messages: any[] = [new HumanMessage(researchPrompt)];
  let toolResults: any[] = [];

  for (let i = 0; i < 6; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of response.tool_calls) {
      // ADD THIS - Before each tool call
      streamWriter.log(`  📊 Calling tool: ${toolCall.name}`, "info");

      let result;
      const args = toolCall.args;

      if (toolCall.name === "fetchVideoTranscript") {
        result = await fetchVideoTranscriptTool.invoke(args as any);
        // ADD THIS - Extra detail for transcript fetches
        streamWriter.log(`    Analyzing video structure...`, "info");
      } else if (toolCall.name === "findReferenceVideo") {
        result = await findReferenceVideoTool.invoke(args as any);
        // ADD THIS - Extra detail for reference videos
        streamWriter.log(`    Finding reference videos...`, "info");
      }

      toolResults.push({ tool: toolCall.name, result });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });

      // ADD THIS - After each tool call
      streamWriter.log(`  ✓ Tool completed: ${toolCall.name}`, "success");
    }
  }

  // ADD THIS - Before synthesis
  streamWriter.log(
    "🔄 Strategy Agent: Synthesizing content strategy...",
    "info"
  );

  const synthesisPrompt = `Based on the strategy research data, provide comprehensive content strategy.

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Analyze and provide:
1. contentStrategy: Optimal video length, hook strategy (first 15 sec), content structure (chapters), unique angles (3-5)
2. titleFormulas: 5 title templates that work in this niche
3. thumbnailGuidance: Best practices for thumbnails in this niche
4. seriesPotential: Can this idea become a series? How?

Be specific and actionable for content creation.`;

  const strategyAnalysis = await modelWithSchema.invoke([
    new HumanMessage(synthesisPrompt),
  ]);

  console.log("✅ Strategy Agent: Analysis complete");
  console.log(
    "   Strategy Data:",
    JSON.stringify(strategyAnalysis, null, 2).substring(0, 200) + "..."
  );

  // ADD THIS - After synthesis complete
  const referenceVideoCount = toolResults.filter(
    (t) => t.tool === "findReferenceVideo"
  ).length;
  streamWriter.log("✅ Strategy Agent: Analysis complete", "success");
  streamWriter.agentStatus("strategy", "completed", {
    referenceVideosFound: referenceVideoCount,
    uniqueAngles: strategyAnalysis.contentStrategy?.uniqueAngles?.length,
    titleTemplates: strategyAnalysis.titleFormulas?.length,
  });

  return {
    strategyAnalysis: strategyAnalysis as StrategyAgentOutput,
    agentsCompleted: "strategy" as any,
  };
}

// ========================================
// BARRIER NODE: WAIT FOR ALL AGENTS
// ========================================

// Around line 450
async function barrierNode(
  state: typeof AgentState.State,
  streamWriter: StreamWriter
): Promise<Partial<typeof AgentState.State>> {
  streamWriter.log("🚧 Barrier: Verifying all agents completed...", "info");

  const requiredAgents = new Set([
    "competition",
    "audience",
    "trend",
    "strategy",
  ]);
  const completed = state.agentsCompleted || new Set();

  const allComplete = Array.from(requiredAgents).every((agent) =>
    completed.has(agent)
  );

  if (!allComplete) {
    const missing = Array.from(requiredAgents).filter(
      (agent) => !completed.has(agent)
    );
    throw new Error(`Not all agents completed. Missing: ${missing.join(", ")}`);
  }

  if (
    !state.competitionAnalysis ||
    !state.audienceAnalysis ||
    !state.trendAnalysis ||
    !state.strategyAnalysis
  ) {
    throw new Error("Some agent data is missing");
  }

  streamWriter.log("✅ Barrier: All agents completed successfully", "success");
  streamWriter.progress(
    4,
    5,
    "All analysis complete, generating final recommendations..."
  );

  return {};
}

// ========================================
// SUPERVISOR NODE: MERGE & SYNTHESIZE
// ========================================

const SupervisorSynthesisSchema = z.object({
  verdict: z
    .string()
    .describe("Detailed verdict paragraph explaining the overall assessment"),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall potential score out of 100"),
  improvements: z
    .array(z.string())
    .min(3)
    .describe("Specific actionable improvements"),
  titles: z
    .array(z.string())
    .min(3)
    .describe("Compelling video title suggestions"),
  angles: z
    .array(z.string())
    .min(2)
    .describe("Unique content angles to explore"),
  referenceVideos: z
    .array(ReferenceVideoSchema)
    .min(1)
    .max(5)
    .describe("Successful reference videos for inspiration"),
});

// Around line 485
async function supervisorNode(
  state: typeof AgentState.State,
  streamWriter: StreamWriter
): Promise<Partial<typeof AgentState.State>> {
  streamWriter.log("🧠 Supervisor: Synthesizing all research...", "info");

  if (
    !state.competitionAnalysis ||
    !state.audienceAnalysis ||
    !state.trendAnalysis ||
    !state.strategyAnalysis
  ) {
    throw new Error("Cannot synthesize - missing agent data");
  }

  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY!,
  }).withStructuredOutput(SupervisorSynthesisSchema);

  const prompt = `You are the final validator synthesizing all research from 4 specialized agents.

VIDEO IDEA: "${state.idea}"
TARGET AUDIENCE: "${state.targetAudience}"
GOAL: "${state.goal}"

=== COMPETITION ANALYSIS ===
${JSON.stringify(state.competitionAnalysis, null, 2)}

=== AUDIENCE ANALYSIS ===
${JSON.stringify(state.audienceAnalysis, null, 2)}

=== TREND ANALYSIS ===
${JSON.stringify(state.trendAnalysis, null, 2)}

=== STRATEGY ANALYSIS ===
${JSON.stringify(state.strategyAnalysis, null, 2)}

Based on ALL this research data, provide your final synthesis:

1. verdict: A detailed paragraph (3-5 sentences) explaining whether this idea has potential and why, based on the data
2. score: Overall potential score (0-100) based on competition, audience fit, trends, and strategy
3. improvements: 5-7 specific, actionable improvements to maximize success
4. titles: 5-7 compelling video title suggestions that match the niche
5. angles: 3-5 unique content angles to differentiate from competitors
6. referenceVideos: Extract 3-5 successful reference videos with COMPLETE details

Be honest, data-driven, and actionable.`;

  streamWriter.log("🤖 Supervisor: Generating recommendations...", "info");

  const synthesis = await model.invoke([new HumanMessage(prompt)]);

  const finalOutput: FinalOutput = {
    verdict: synthesis.verdict,
    score: synthesis.score,
    competitionAnalysis: state.competitionAnalysis,
    audienceAnalysis: state.audienceAnalysis,
    trendAnalysis: state.trendAnalysis,
    strategyRecommendations: state.strategyAnalysis,
    improvements: synthesis.improvements,
    titles: synthesis.titles,
    angles: synthesis.angles,
    referenceVideos: synthesis.referenceVideos,
  };

  streamWriter.log(
    `✅ Supervisor: Final score calculated: ${synthesis.score}/100`,
    "success"
  );

  return { finalOutput };
}

// ========================================
// BUILD GRAPH WITH BARRIER NODE
// ========================================

// Around line 570
export function buildValidationGraph(streamWriter: StreamWriter) {
  const workflow = new StateGraph(AgentState);

  // Wrap agent nodes to include streaming
  workflow.addNode("competition_agent", (state) =>
    competitionAgentNode(state, streamWriter)
  );
  workflow.addNode("audience_agent", (state) =>
    audienceAgentNode(state, streamWriter)
  );
  workflow.addNode("trend_agent", (state) =>
    trendAgentNode(state, streamWriter)
  );
  workflow.addNode("strategy_agent", (state) =>
    strategyAgentNode(state, streamWriter)
  );
  workflow.addNode("barrier", (state) => barrierNode(state, streamWriter));
  workflow.addNode("supervisor", (state) =>
    supervisorNode(state, streamWriter)
  );

  // ... rest of the graph setup remains the same
  workflow.addEdge(START, "competition_agent" as any);
  workflow.addEdge(START, "audience_agent" as any);
  workflow.addEdge(START, "trend_agent" as any);
  workflow.addEdge(START, "strategy_agent" as any);

  workflow.addEdge("competition_agent" as any, "barrier" as any);
  workflow.addEdge("audience_agent" as any, "barrier" as any);
  workflow.addEdge("trend_agent" as any, "barrier" as any);
  workflow.addEdge("strategy_agent" as any, "barrier" as any);

  workflow.addEdge("barrier" as any, "supervisor" as any);
  workflow.addEdge("supervisor" as any, END);

  return workflow.compile();
}

// ========================================
// MAIN SERVICE FUNCTION
// ========================================

// Update function signature (around line 600)
export async function validateIdeaService(
  input: ValidateIdeaInput,
  streamWriter: StreamWriter
) {
  streamWriter.log("🚀 Starting parallel validation workflow", "info");
  streamWriter.log(`Idea: "${input.idea}"`, "info");
  streamWriter.log(`Audience: "${input.targetAudience}"`, "info");
  streamWriter.log(`Goal: "${input.goal}"`, "info");

  streamWriter.progress(0, 5, "Initializing validation workflow...");

  const graph = buildValidationGraph(streamWriter); // Pass streamWriter to graph

  const initialState = {
    idea: input.idea,
    targetAudience: input.targetAudience,
    goal: input.goal,
  };

  const startTime = Date.now();

  streamWriter.progress(1, 5, "Executing parallel agent analysis...");

  const result = await graph.invoke(initialState);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  streamWriter.progress(5, 5, "Validation completed!");
  streamWriter.log(`✅ Completed in ${duration}s`, "success");
  streamWriter.log(
    `📊 Final Score: ${result.finalOutput?.score}/100`,
    "success"
  );

  if (!result.finalOutput) {
    throw new Error("Final output was not generated");
  }

  return {
    ...result.finalOutput,
    metadata: {
      processingTime: duration,
      timestamp: new Date().toISOString(),
    },
  };
}
