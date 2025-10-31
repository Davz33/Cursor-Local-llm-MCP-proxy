import { LLM, Settings } from "llamaindex";
import { configureSettings } from "../config/llm-config.js";
import { getAvailableToolsWithContext } from "../tools/agentic-tools.js";
import type { ToolExecutionContext } from "../tools/agentic-tools.js";
import { RAGService } from "../rag/rag-service.js";
import {
  OrchestratorService,
  OrchestratorOptions,
} from "../orchestrator/orchestrator-service.js";
import { ToolCallingService } from "./tool-calling-service.js";
import type { ToolCall } from "./tool-calling-service.js";

export interface AgenticOptions {
  maxTokens?: number;
  temperature?: number;
  useTools?: boolean;
  useOrchestrator?: boolean;
  useDynamicToolCalling?: boolean;
  orchestratorOptions?: OrchestratorOptions;
}

export interface AgenticResult {
  response: string;
  toolsUsed: string[];
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
  orchestratorResult?: any;
}

/**
 * Agentic Service for handling LLM interactions with tool integration
 */
export class AgenticService {
  private llm: LLM;
  private ragService: RAGService;
  private orchestratorService: OrchestratorService | null = null;
  public toolCallingService: ToolCallingService | null = null;

  constructor() {
    // Configure global settings and get LLM instance
    const { llm } = configureSettings();
    this.llm = llm;
    this.ragService = new RAGService();
  }

  /**
   * Get the LLM instance
   */
  getLLM(): LLM {
    return this.llm;
  }

  /**
   * Initialize the agentic service
   */
  async initialize(): Promise<void> {
    await this.ragService.initialize();

    // Initialize tool calling service
    const tools = getAvailableToolsWithContext(this.ragService);
    this.toolCallingService = new ToolCallingService(this.llm, tools);
    console.error("Agentic Service: Tool Calling Service initialized");

    // Initialize orchestrator service if needed
    if (process.env.ENABLE_MCP_ORCHESTRATOR === "true") {
      this.orchestratorService = new OrchestratorService(this.ragService);
      await this.orchestratorService.initialize();
      console.error("Agentic Service: MCP Orchestrator initialized");
    }
  }

  /**
   * Run agentic query with tool integration
   */
  async runAgenticQuery(
    prompt: string,
    options: AgenticOptions = {},
  ): Promise<AgenticResult> {
    const {
      maxTokens = 1000,
      temperature = 0.7,
      useTools = true,
      useOrchestrator = false,
      useDynamicToolCalling = true,
      orchestratorOptions = {},
    } = options;

    try {
      // Use orchestrator if enabled and available
      if (useOrchestrator && this.orchestratorService) {
        console.error("🎯 AGENTIC SERVICE: Using MCP Orchestrator");
        console.error(
          `🎯 AGENTIC SERVICE: Orchestrator available: ${!!this.orchestratorService}`,
        );
        console.error(
          `🎯 AGENTIC SERVICE: Processing prompt: ${prompt.substring(0, 100)}...`,
        );

        const orchestratorResult = await this.orchestratorService.processQuery(
          prompt,
          {
            maxTokens,
            temperature,
            ...orchestratorOptions,
          },
        );

        console.error(
          `🎯 AGENTIC SERVICE: Orchestrator completed with ${orchestratorResult.toolsUsed.length} tools used`,
        );
        console.error(
          `🎯 AGENTIC SERVICE: Tools used: ${orchestratorResult.toolsUsed.join(", ")}`,
        );
        console.error(
          `🎯 AGENTIC SERVICE: Used local LLM: ${orchestratorResult.usedLocalLLM}`,
        );
        console.error(
          `🎯 AGENTIC SERVICE: Fallback used: ${orchestratorResult.fallbackUsed}`,
        );

        // Convert orchestrator plan to toolCalls format for DeepEval
        const toolCalls = orchestratorResult.plan.map((step: any) => ({
          name: step.tool,
          parameters: step.parameters,
        }));

        return {
          response: orchestratorResult.response,
          toolsUsed: orchestratorResult.toolsUsed,
          toolCalls,
          orchestratorResult,
          metadata: {
            maxTokens,
            temperature,
            useTools,
            useOrchestrator: true,
            usedLocalLLM: orchestratorResult.usedLocalLLM,
            fallbackUsed: orchestratorResult.fallbackUsed,
            savedToRAG: orchestratorResult.savedToRAG,
          },
        };
      }

      // Log orchestrator status if not used
      if (useOrchestrator && !this.orchestratorService) {
        console.error(
          "⚠️ AGENTIC SERVICE: Orchestrator requested but not available!",
        );
        console.error(
          "⚠️ AGENTIC SERVICE: Check ENABLE_MCP_ORCHESTRATOR environment variable",
        );
      }

      // Use dynamic tool calling if enabled and available
      if (useTools && useDynamicToolCalling && this.toolCallingService) {
        console.error("🔧 AGENTIC SERVICE: Using Dynamic Tool Calling");
        const toolContext: ToolExecutionContext = {
          ragService: this.ragService,
        };

        const toolResult = await this.toolCallingService.processQuery(
          prompt,
          toolContext,
          {
            maxRetries: 3,
            enableErrorReporting: true,
          },
        );

        return {
          response: toolResult.response,
          toolsUsed: toolResult.toolsUsed,
          toolCalls: toolResult.toolCalls,
          metadata: {
            maxTokens,
            temperature,
            useTools,
            useOrchestrator: false,
            useDynamicToolCalling: true,
            toolResults: toolResult.toolResults,
            toolCalls: toolResult.toolCalls,
          },
        };
      }

      // Fallback to original logic
      let toolsUsed: string[] = [];
      let response = "";

      if (useTools) {
        if (this.isFileSystemQuery(prompt)) {
          const fsResult = await this.executeFileSystemQuery(prompt);
          toolsUsed.push("filesystem");
          response = fsResult;
        }
        // Check if prompt requires RAG query
        else if (this.isRAGQuery(prompt)) {
          const ragResult = await this.executeRAGQuery(prompt);
          toolsUsed.push("rag");
          response = ragResult;
        }
        // Default to LLM response
        else {
          response = await this.generateLLMResponse(
            prompt,
            maxTokens,
            temperature,
          );
        }
      } else {
        response = await this.generateLLMResponse(
          prompt,
          maxTokens,
          temperature,
        );
      }

      return {
        response,
        toolsUsed,
        toolCalls: [],
        metadata: {
          maxTokens,
          temperature,
          useTools,
          useOrchestrator: false,
        },
      };
    } catch (error) {
      throw new Error(`Agentic query failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate response using LLM only
   */
  private async generateLLMResponse(
    prompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    try {
      console.log("🤖 Calling real LLM for response generation...");

      // Use the chat method for non-streaming responses
      const response = await this.llm.chat({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract the response content
      if (response && response.message && response.message.content) {
        const content = response.message.content as string;
        console.log(
          "✅ Real LLM response received:",
          content.substring(0, 100) + "...",
        );
        return content;
      } else {
        console.log("⚠️ No content in LLM response, using fallback");
        return `LLM Response for: ${prompt} (maxTokens: ${maxTokens}, temperature: ${temperature})`;
      }
    } catch (error) {
      console.error("❌ LLM generation failed:", error);
      throw new Error(`LLM generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check if prompt is a file system query
   */
  private isFileSystemQuery(prompt: string): boolean {
    const fsKeywords = [
      "read file",
      "write file",
      "list directory",
      "file",
      "directory",
      "folder",
    ];
    return fsKeywords.some((keyword) => prompt.toLowerCase().includes(keyword));
  }

  /**
   * Check if prompt is a RAG query
   */
  private isRAGQuery(prompt: string): boolean {
    const ragKeywords = [
      "search",
      "find",
      "query",
      "document",
      "indexed",
      "rag",
    ];
    return (
      ragKeywords.some((keyword) => prompt.toLowerCase().includes(keyword)) &&
      this.ragService.hasIndexedDocuments()
    );
  }

  /**
   * Execute file system query
   */
  private async executeFileSystemQuery(prompt: string): Promise<string> {
    // Simple file system query handling
    if (
      prompt.toLowerCase().includes("list") &&
      prompt.toLowerCase().includes("directory")
    ) {
      return "File system operations require specific file paths. Please provide a directory path to list.";
    }

    return "File system operations require specific parameters. Please provide file paths and operations.";
  }

  /**
   * Execute RAG query
   */
  private async executeRAGQuery(prompt: string): Promise<string> {
    try {
      const result = await this.ragService.queryDocuments(prompt);
      return `RAG Response: ${result.response}\nSource: ${result.sourceNodes}`;
    } catch (error) {
      return `RAG query failed: ${(error as Error).message}`;
    }
  }

  /**
   * Get RAG service instance
   */
  getRAGService(): RAGService {
    return this.ragService;
  }

  /**
   * Get orchestrator service instance
   */
  getOrchestratorService(): OrchestratorService | null {
    return this.orchestratorService;
  }

  /**
   * Get orchestrator status
   */
  getOrchestratorStatus(): any {
    return this.orchestratorService?.getStatus() || null;
  }
}
