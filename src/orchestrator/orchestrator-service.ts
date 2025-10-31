import type { RAGService } from "../rag/rag-service.js";
import { LangGraphRunner } from "./langraph-runner.js";
import { getAvailableToolsWithContext } from "../tools/agentic-tools.js";
import type { Tool } from "../tools/agentic-tools.js";
import type { ToolExecutionContext } from "../tools/agentic-tools.js";

export interface OrchestratorOptions {
  context?: Record<string, any>;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  enableValidation?: boolean;
  enableRules?: boolean;
  enableRAG?: boolean;
  fallbackToCursor?: boolean;
}

export interface OrchestratorResult {
  response: string;
  toolsUsed: string[];
  plan: Array<{
    tool: string;
    parameters: Record<string, any>;
    result: string;
  }>;
  artifacts: string[];
  usedLocalLLM: boolean;
  fallbackUsed: boolean;
  savedToRAG: boolean;
}

export class OrchestratorService {
  private runner: LangGraphRunner;
  private toolMap: Map<string, Tool>;

  constructor(private ragService: RAGService) {
    this.runner = new LangGraphRunner();
    this.toolMap = new Map(
      getAvailableToolsWithContext(this.ragService).map((tool) => [
        tool.name,
        tool,
      ]),
    );
  }

  async initialize(): Promise<void> {
    await this.runner.ensureReady();
  }

  async processQuery(
    prompt: string,
    options: OrchestratorOptions = {},
  ): Promise<OrchestratorResult> {
    const planPayload = await this.runner.buildPlan(
      prompt,
      options.context ?? {},
    );

    const toolExecutionContext: ToolExecutionContext = {
      ragService: this.ragService,
    };
    const executedPlan: OrchestratorResult["plan"] = [];
    const toolsUsed: string[] = [];

    for (const step of planPayload.plan) {
      const tool = this.toolMap.get(step.tool);
      if (!tool) {
        throw new Error(`LangGraph requested unknown tool '${step.tool}'`);
      }

      const result = await tool.execute(step.parameters, toolExecutionContext);
      executedPlan.push({
        tool: tool.name,
        parameters: step.parameters,
        result,
      });
      toolsUsed.push(tool.name);
    }

    const finalResponse = this.composeResponse(
      planPayload.prompt,
      executedPlan,
      planPayload.artifacts,
    );

    return {
      response: finalResponse,
      toolsUsed,
      plan: executedPlan,
      artifacts: planPayload.artifacts,
      usedLocalLLM: true,
      fallbackUsed: false,
      savedToRAG: false,
    };
  }

  getStatus(): Record<string, any> {
    return {
      orchestrator: "langgraph",
      tools: Array.from(this.toolMap.keys()),
    };
  }

  getAvailableTools(): string[] {
    return Array.from(this.toolMap.keys());
  }

  private composeResponse(
    prompt: string,
    plan: OrchestratorResult["plan"],
    artifacts: string[],
  ): string {
    const steps = plan
      .map(
        (entry, index) =>
          `${index + 1}. ${entry.tool} → ${
            entry.parameters.action ?? entry.parameters.query ?? "execute"
          } ⇒ ${entry.result}`,
      )
      .join("\n");

    const artifactSummary = artifacts
      .map((artifact) => `- ${artifact}`)
      .join("\n");

    return [
      `Prompt: ${prompt}`,
      "\nExecuted Steps:",
      steps,
      "\nArtifacts:",
      artifactSummary,
    ].join("\n");
  }
}
