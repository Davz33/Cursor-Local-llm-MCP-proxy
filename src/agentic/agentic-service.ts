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
  private toolCallingService: ToolCallingService | null = null;

  constructor() {
    // Configure global settings and get LLM instance
    const { llm } = configureSettings();
    this.llm = llm;
    this.ragService = new RAGService();
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
      this.orchestratorService = new OrchestratorService(
        this.llm,
        this.ragService,
      );
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
        console.error("Agentic Service: Using MCP Orchestrator");
        const orchestratorResult = await this.orchestratorService.processQuery(
          prompt,
          {
            maxTokens,
            temperature,
            ...orchestratorOptions,
          },
        );

        return {
          response: orchestratorResult.response,
          toolsUsed: orchestratorResult.toolsUsed,
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

      // Use dynamic tool calling if enabled and available
      if (useTools && useDynamicToolCalling && this.toolCallingService) {
        console.error("Agentic Service: Using Dynamic Tool Calling");
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
          metadata: {
            maxTokens,
            temperature,
            useTools,
            useOrchestrator: false,
            useDynamicToolCalling: true,
            toolResults: toolResult.toolResults,
          },
        };
      }

      // Fallback to original logic
      let toolsUsed: string[] = [];
      let response = "";

      if (useTools) {
        // Get tools with RAG service context
        const tools = getAvailableToolsWithContext(this.ragService);

        // Simple tool detection and execution
        const toolContext: ToolExecutionContext = {
          ragService: this.ragService,
        };

        // Check if prompt requires math operations
        if (this.isMathQuery(prompt)) {
          const mathResult = await this.executeMathQuery(prompt);
          toolsUsed.push("math");
          response = mathResult;
        }
        // Check if prompt requires file operations
        else if (this.isFileSystemQuery(prompt)) {
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
      // TODO: Fix LLM completion API call for LlamaIndex.TS v0.11.28
      // const response = await this.llm.complete({
      //   prompt,
      //   maxTokens,
      //   temperature
      // });

      // return response.text || "No response generated";
      return `LLM Response for: ${prompt} (maxTokens: ${maxTokens}, temperature: ${temperature})`;
    } catch (error) {
      throw new Error(`LLM generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check if prompt is a math query
   */
  private isMathQuery(prompt: string): boolean {
    const mathKeywords = [
      "calculate",
      "compute",
      "add",
      "subtract",
      "multiply",
      "divide",
      "+",
      "-",
      "*",
      "/",
      "math",
      "arithmetic",
    ];
    return mathKeywords.some((keyword) =>
      prompt.toLowerCase().includes(keyword),
    );
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
   * Execute math query
   */
  private async executeMathQuery(prompt: string): Promise<string> {
    // Simple math parsing - in a real implementation, you'd use a proper math parser
    const numbers = prompt.match(/\d+/g);
    const operations = prompt.match(/[+\-*/]/g);

    if (
      numbers &&
      numbers.length >= 2 &&
      operations &&
      operations.length >= 1
    ) {
      const a = parseInt(numbers[0]);
      const b = parseInt(numbers[1]!);
      const op = operations[0];

      let operation: string;
      switch (op) {
        case "+":
          operation = "add";
          break;
        case "-":
          operation = "subtract";
          break;
        case "*":
          operation = "multiply";
          break;
        case "/":
          operation = "divide";
          break;
        default:
          return "Unsupported math operation";
      }

      // This would normally use the math tool, but for simplicity:
      let result: number;
      switch (operation) {
        case "add":
          result = a + b;
          break;
        case "subtract":
          result = a - b;
          break;
        case "multiply":
          result = a * b;
          break;
        case "divide":
          result = b !== 0 ? a / b : NaN;
          break;
        default:
          return "Unsupported operation";
      }

      return `Math result: ${a} ${op} ${b} = ${result}`;
    }

    return "Could not parse math expression. Please provide numbers and operators.";
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
