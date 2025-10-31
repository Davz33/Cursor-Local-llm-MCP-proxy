import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AgenticService } from "../agentic/agentic-service.js";
import { RAGService } from "../rag/rag-service.js";
import { SonarService } from "../services/sonar-service.js";
// import { createEnhancedMemoryTools } from "../tools/enhanced-memory-tools.js";
import { config } from "dotenv";

// Load environment variables from .env file
config();

export interface GenerateTextArgs {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  use_agentic?: boolean;
  use_orchestrator?: boolean;
  use_dynamic_tool_calling?: boolean;
  stream?: boolean;
}

export interface ChatCompletionArgs {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  use_agentic?: boolean;
  use_orchestrator?: boolean;
  use_dynamic_tool_calling?: boolean;
  stream?: boolean;
}

export interface RAGQueryArgs {
  query: string;
  max_tokens?: number;
  temperature?: number;
}

export interface IndexDocumentArgs {
  file_path?: string;
  text_content?: string;
}

export interface SonarQueryArgs {
  query: string;
  max_tokens?: number;
  temperature?: number;
  model?: string;
}

/**
 * Local LLM Proxy MCP Server with retrieval and agentic integration
 */
export class LocalLLMProxyServer {
  private server: Server;
  private agenticService: AgenticService;
  private ragService: RAGService;
  private sonarService: SonarService;

  constructor() {
    this.server = new Server({
      name: "local-llm-proxy-mcp",
      version: "1.0.0",
    });

    this.agenticService = new AgenticService();
    this.ragService = this.agenticService.getRAGService();

    // Initialize Sonar service (will throw error if API key is missing)
    try {
      this.sonarService = new SonarService();
    } catch (error) {
      console.error(
        "Sonar service initialization failed:",
        (error as Error).message,
      );
      // Create a placeholder service that will show error when used
      this.sonarService = null as any;
    }

    this.setupHandlers();
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<void> {
    await this.agenticService.initialize();
  }

  setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_text_v2",
            description:
              "Generate text with optional agentic capabilities and tool integration",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The prompt to generate text from",
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum number of tokens to generate",
                  default: 1000,
                },
                temperature: {
                  type: "number",
                  description: "Temperature for response generation",
                  default: 0.7,
                },
                use_agentic: {
                  type: "boolean",
                  description: "Whether to use agentic capabilities with tools",
                  default: true,
                },
                use_dynamic_tool_calling: {
                  type: "boolean",
                  description:
                    "Whether to use dynamic tool calling (LM Studio pattern)",
                  default: true,
                },
                stream: {
                  type: "boolean",
                  description: "Whether to stream the response",
                  default: false,
                },
              },
              required: ["prompt"],
            },
          },
          {
            name: "chat_completion",
            description:
              "Chat completion with optional agentic capabilities and tool integration",
            inputSchema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  description: "Array of chat messages",
                  items: {
                    type: "object",
                    properties: {
                      role: {
                        type: "string",
                        enum: ["user", "assistant", "system"],
                      },
                      content: { type: "string" },
                    },
                    required: ["role", "content"],
                  },
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum number of tokens to generate",
                  default: 1000,
                },
                temperature: {
                  type: "number",
                  description: "Temperature for response generation",
                  default: 0.7,
                },
                use_agentic: {
                  type: "boolean",
                  description: "Whether to use agentic capabilities with tools",
                  default: true,
                },
                use_dynamic_tool_calling: {
                  type: "boolean",
                  description:
                    "Whether to use dynamic tool calling (LM Studio pattern)",
                  default: true,
                },
                stream: {
                  type: "boolean",
                  description: "Whether to stream the response",
                  default: false,
                },
              },
              required: ["messages"],
            },
          },
          {
            name: "rag_query",
            description:
              "Query indexed documents using RAG (Retrieval-Augmented Generation)",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The query to search for in indexed documents",
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum number of tokens to generate",
                  default: 1000,
                },
                temperature: {
                  type: "number",
                  description: "Temperature for response generation",
                  default: 0.7,
                },
              },
              required: ["query"],
            },
          },
          {
            name: "index_document",
            description: "Index a document for RAG queries",
            inputSchema: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "Path to the file to index",
                },
                text_content: {
                  type: "string",
                  description: "Text content to index directly",
                },
              },
            },
          },
          {
            name: "save_rag_storage",
            description: "Manually save RAG storage to disk",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "clear_rag_storage",
            description: "Clear all persistent RAG storage from disk",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "rag_storage_status",
            description: "Get status of RAG storage and persistence",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "orchestrator_status",
            description: "Get status of MCP orchestrator and connected servers",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "discover_mcp_servers",
            description:
              "Discover and connect to MCP servers from cursor configuration",
            inputSchema: {
              type: "object",
              properties: {
                auto_connect: {
                  type: "boolean",
                  description:
                    "Whether to automatically connect to discovered servers",
                  default: true,
                },
              },
            },
          },
          {
            name: "list_orchestrated_tools",
            description:
              "List all tools available from orchestrated MCP servers",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "call_orchestrated_tool",
            description:
              "Call any tool from orchestrated MCP servers through the orchestrator",
            inputSchema: {
              type: "object",
              properties: {
                server_name: {
                  type: "string",
                  description: "Name of the MCP server to call the tool on",
                },
                tool_name: {
                  type: "string",
                  description: "Name of the tool to call",
                },
                arguments: {
                  type: "object",
                  description: "Arguments to pass to the tool",
                },
              },
              required: ["server_name", "tool_name"],
            },
          },
          {
            name: "delegate_to_local_llm",
            description:
              "Delegate the entire request to local LLM with full orchestrator access and intelligent tool coordination",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The complete prompt/request to process",
                },
                context: {
                  type: "object",
                  description: "Additional context for the request",
                  default: {},
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum tokens for response generation",
                  default: 2000,
                },
                temperature: {
                  type: "number",
                  description: "Temperature for response generation",
                  default: 0.7,
                },
                enable_validation: {
                  type: "boolean",
                  description: "Enable response validation and fallback",
                  default: true,
                },
              },
              required: ["prompt"],
            },
          },
          {
            name: "sonar_query",
            description:
              "Query Perplexity's Sonar API for real-time information with citations",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The query to search for real-time information",
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum number of tokens to generate",
                  default: 1000,
                },
                temperature: {
                  type: "number",
                  description: "Temperature for response generation",
                  default: 0.7,
                },
                model: {
                  type: "string",
                  description: "Sonar model to use",
                  enum: [
                    "sonar-pro",
                    "sonar-online",
                    "sonar-medium-online",
                    "sonar-small-online",
                  ],
                  default: "sonar-pro",
                },
              },
              required: ["query"],
            },
          },
          // Enhanced Memory Tools - Temporarily disabled
          // {
          //   name: "enhanced_memory_query",
          //   description: "Query the enhanced memory system with code understanding, error learning, and graph reasoning",
          //   inputSchema: {
          //     type: "object",
          //     properties: {
          //       query: {
          //         type: "string",
          //         description: "The query to search for in the enhanced memory system"
          //       },
          //       context: {
          //         type: "object",
          //         description: "Additional context for the query (filePath, functionName, etc.)",
          //         properties: {
          //           filePath: { type: "string" },
          //           functionName: { type: "string" },
          //           className: { type: "string" },
          //           lineNumber: { type: "number" },
          //           variables: { type: "object" },
          //           imports: { type: "array", items: { type: "string" } }
          //         }
          //       }
          //     },
          //     required: ["query"]
          //   }
          // },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        console.error(`MCP Server: Handling tool call: ${name}`);
        console.error(`MCP Server: Tool args:`, args);

        switch (name) {
          case "generate_text_v2":
            return await this.handleGenerateText(
              args as unknown as GenerateTextArgs,
            );
          case "chat_completion":
            return await this.handleChatCompletion(
              args as unknown as ChatCompletionArgs,
            );
          case "rag_query":
            const fs = await import("fs/promises");
            await fs
              .appendFile(
                "tool-debug.log",
                `Tool handler: rag_query called with args: ${JSON.stringify(args)}\n`,
              )
              .catch(() => {});
            console.error("MCP Server: About to call handleRAGQuery");
            const result = await this.handleRAGQuery(
              args as unknown as RAGQueryArgs,
            );
            console.error("MCP Server: handleRAGQuery completed");
            return result;
          case "index_document":
            return await this.handleIndexDocument(
              args as unknown as IndexDocumentArgs,
            );
          case "save_rag_storage":
            return await this.handleSaveRAGStorage();
          case "clear_rag_storage":
            return await this.handleClearRAGStorage();
          case "rag_storage_status":
            return await this.handleRAGStorageStatus();
          case "orchestrator_status":
            return await this.handleOrchestratorStatus();
          case "discover_mcp_servers":
            return await this.handleDiscoverMCPServers(
              args as { auto_connect?: boolean },
            );
          case "list_orchestrated_tools":
            return await this.handleListOrchestratedTools();
          case "call_orchestrated_tool":
            return await this.handleCallOrchestratedTool(
              args as {
                server_name: string;
                tool_name: string;
                arguments?: any;
              },
            );
          case "delegate_to_local_llm":
            return await this.handleDelegateToLocalLLM(
              args as {
                prompt: string;
                context?: any;
                max_tokens?: number;
                temperature?: number;
                enable_validation?: boolean;
              },
            );
          case "sonar_query":
            return await this.handleSonarQuery(
              args as unknown as SonarQueryArgs,
            );
          // Enhanced Memory Tools - Temporarily disabled
          // case "enhanced_memory_query":
          //   return await this.handleEnhancedMemoryQuery(args as any);
          // case "learn_from_error":
          //   return await this.handleLearnFromError(args as any);
          // case "index_codebase":
          //   return await this.handleIndexCodebase(args as any);
          // case "get_memory_statistics":
          //   return await this.handleGetMemoryStatistics();
          // case "find_similar_errors":
          //   return await this.handleFindSimilarErrors(args as any);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(
          `MCP Server: Error in tool handler for ${name}:`,
          (error as Error).message,
        );
        console.error(`MCP Server: Error stack:`, (error as Error).stack);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${(error as Error).message}`,
            },
          ],
        };
      }
    });
  }

  async handleGenerateText(args: GenerateTextArgs) {
    const {
      prompt,
      max_tokens = 1000,
      temperature = 0.7,
      use_agentic = true,
      use_dynamic_tool_calling = true,
      use_orchestrator = false,
      stream = false,
    } = args;

    try {
      const result = await this.agenticService.runAgenticQuery(prompt, {
        maxTokens: max_tokens,
        temperature,
        useTools: use_agentic,
        useOrchestrator: use_orchestrator,
        useDynamicToolCalling: use_dynamic_tool_calling,
      });

      let responseText = result.response;

      // Add orchestrator metadata if available
      if (result.orchestratorResult) {
        responseText += `\n\n--- Orchestrator Info ---\n`;
        responseText += `Tools Used: ${result.orchestratorResult.toolsUsed.join(", ")}\n`;
        responseText += `Used Local LLM: ${result.orchestratorResult.usedLocalLLM}\n`;
        responseText += `Fallback Used: ${result.orchestratorResult.fallbackUsed}\n`;
        responseText += `Saved to RAG: ${result.orchestratorResult.savedToRAG}\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Text generation failed: ${(error as Error).message}`);
    }
  }

  async handleChatCompletion(args: ChatCompletionArgs) {
    const {
      messages,
      max_tokens = 1000,
      temperature = 0.7,
      use_agentic = true,
      use_dynamic_tool_calling = true,
      stream = false,
    } = args;

    try {
      // Convert messages to a single prompt for simplicity
      const prompt = messages
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n");

      const result = await this.agenticService.runAgenticQuery(prompt, {
        maxTokens: max_tokens,
        temperature,
        useTools: use_agentic,
        useDynamicToolCalling: use_dynamic_tool_calling,
      });

      return {
        content: [
          {
            type: "text",
            text: result.response,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Chat completion failed: ${(error as Error).message}`);
    }
  }

  async handleRAGQuery(args: RAGQueryArgs) {
    const { query, max_tokens = 1000, temperature = 0.7 } = args;

    try {
      // Write to file since console.error might not be visible
      const fs = await import("fs/promises");
      await fs
        .appendFile(
          "mcp-debug.log",
          `MCP Server: Starting RAG query with: ${query}\n`,
        )
        .catch(() => {});

      console.error("MCP Server: Starting RAG query with:", query);
      console.error("MCP Server: RAG service exists:", !!this.ragService);
      console.error(
        "MCP Server: RAG service instance ID:",
        (this.ragService as any)?.instanceId,
      );

      // Check if documents are indexed
      const hasDocs = this.ragService.hasIndexedDocuments();
      console.error("MCP Server: Has indexed documents:", hasDocs);
      await fs
        .appendFile(
          "mcp-debug.log",
          `MCP Server: Has indexed documents: ${hasDocs}\n`,
        )
        .catch(() => {});

      const result = await this.ragService.queryDocuments(query);
      console.error("MCP Server: RAG query completed successfully");
      await fs
        .appendFile(
          "mcp-debug.log",
          `MCP Server: RAG query completed successfully\n`,
        )
        .catch(() => {});

      return {
        content: [
          {
            type: "text",
            text: `Query: ${result.query}\n\nResponse: ${result.response}\n\n${result.sourceNodes ? `Source nodes: ${result.sourceNodes}` : "No sources found"}`,
          },
        ],
      };
    } catch (error) {
      const fs = await import("fs/promises");
      await fs
        .appendFile(
          "mcp-debug.log",
          `MCP Server: RAG query error: ${(error as Error).message}\n`,
        )
        .catch(() => {});
      console.error("MCP Server: RAG query error:", (error as Error).message);
      console.error(
        "MCP Server: RAG query error stack:",
        (error as Error).stack,
      );
      throw new Error(`RAG query failed: ${(error as Error).message}`);
    }
  }

  async handleIndexDocument(args: IndexDocumentArgs) {
    const { file_path, text_content } = args;

    try {
      if (file_path) {
        const result = await this.ragService.indexDocument(file_path);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } else if (text_content) {
        const result = await this.ragService.indexText(text_content);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } else {
        throw new Error("Either file_path or text_content must be provided");
      }
    } catch (error) {
      throw new Error(`Document indexing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handle save RAG storage request
   */
  private async handleSaveRAGStorage() {
    try {
      await this.ragService.saveStorage();
      return {
        content: [
          {
            type: "text",
            text: "RAG storage saved successfully to disk",
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to save RAG storage: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle clear RAG storage request
   */
  private async handleClearRAGStorage() {
    try {
      await this.ragService.clearStorage();
      return {
        content: [
          {
            type: "text",
            text: "RAG storage cleared successfully from disk",
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to clear RAG storage: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle RAG storage status request
   */
  private async handleRAGStorageStatus() {
    try {
      const status = this.ragService.getIndexStatus();
      return {
        content: [
          {
            type: "text",
            text: `RAG Storage Status:
- Has Index: ${status.hasIndex}
- Index Type: ${status.indexType}
- Instance ID: ${status.instanceId}
- Storage Path: ${status.storagePath}
- Is Persistent: ${status.isPersistent}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get RAG storage status: ${(error as Error).message}`,
      );
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      "Local LLM Proxy MCP Server with retrieval and agentic integration running on stdio",
    );

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Handle orchestrator status request
   */
  private async handleOrchestratorStatus() {
    try {
      const status = this.agenticService.getOrchestratorStatus();
      if (!status) {
        return {
          content: [
            {
              type: "text",
              text: "MCP Orchestrator is not enabled. Set ENABLE_MCP_ORCHESTRATOR=true to enable.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `MCP Orchestrator Status:
Discovery: ${JSON.stringify(status.discovery, null, 2)}
Connections: ${JSON.stringify(status.connections, null, 2)}
Rules: ${JSON.stringify(status.rules, null, 2)}
Validation: ${JSON.stringify(status.validation, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get orchestrator status: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle discover MCP servers request
   */
  private async handleDiscoverMCPServers(args: { auto_connect?: boolean }) {
    try {
      const orchestrator = this.agenticService.getOrchestratorService();
      if (!orchestrator) {
        return {
          content: [
            {
              type: "text",
              text: "MCP Orchestrator is not enabled. Set ENABLE_MCP_ORCHESTRATOR=true to enable.",
            },
          ],
        };
      }

      // Re-discover servers
      const discoveryService = (orchestrator as any).discoveryService;
      const servers = await discoveryService.discoverMCPServers();

      let result = `Discovered ${servers.length} MCP servers:\n`;
      for (const server of servers) {
        result += `- ${server.name}: ${server.status}\n`;
      }

      if (args.auto_connect !== false) {
        const clientManager = (orchestrator as any).clientManager;
        const { successful, failed } =
          await clientManager.connectToAllDiscoveredServers();
        result += `\nConnection Results:\n`;
        result += `- Successful: ${successful.join(", ")}\n`;
        result += `- Failed: ${failed.join(", ")}\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to discover MCP servers: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle list orchestrated tools request
   */
  private async handleListOrchestratedTools() {
    try {
      const orchestrator = this.agenticService.getOrchestratorService();
      if (!orchestrator) {
        return {
          content: [
            {
              type: "text",
              text: "MCP Orchestrator is not enabled. Set ENABLE_MCP_ORCHESTRATOR=true to enable.",
            },
          ],
        };
      }

      const tools = orchestrator.getAvailableTools();
      let result = `Available orchestrated tools (${tools.length}):\n`;

      for (const tool of tools) {
        result += `- ${tool}\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to list orchestrated tools: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle call orchestrated tool request
   */
  private async handleCallOrchestratedTool(args: {
    server_name: string;
    tool_name: string;
    arguments?: any;
  }) {
    try {
      const orchestrator = this.agenticService.getOrchestratorService();
      if (!orchestrator) {
        return {
          content: [
            {
              type: "text",
              text: "MCP Orchestrator is not enabled. Set ENABLE_MCP_ORCHESTRATOR=true to enable.",
            },
          ],
        };
      }

      const { server_name, tool_name, arguments: toolArgs } = args;

      // Log the call attempt
      console.error(
        `🎯 CURSOR REQUESTING ORCHESTRATED TOOL: ${server_name}.${tool_name}`,
      );
      console.error(`🎯 CURSOR ARGS:`, JSON.stringify(toolArgs, null, 2));

      // Get the client manager from orchestrator
      const clientManager = (orchestrator as any).clientManager;
      const result = await clientManager.callTool(
        server_name,
        tool_name,
        toolArgs || {},
      );

      console.error(
        `🎯 CURSOR ORCHESTRATED TOOL RESULT: ${server_name}.${tool_name} completed`,
      );

      return {
        content: [
          {
            type: "text",
            text: `Orchestrated tool call successful:\nServer: ${server_name}\nTool: ${tool_name}\nResult: ${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      console.error(
        `❌ CURSOR ORCHESTRATED TOOL ERROR:`,
        (error as Error).message,
      );
      throw new Error(
        `Failed to call orchestrated tool: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle delegate to local LLM request
   */
  private async handleDelegateToLocalLLM(args: {
    prompt: string;
    context?: any;
    max_tokens?: number;
    temperature?: number;
    enable_validation?: boolean;
  }) {
    try {
      const {
        prompt,
        context = {},
        max_tokens = 2000,
        temperature = 0.7,
        enable_validation = true,
      } = args;

      console.error(
        `🧠 DELEGATING TO LOCAL LLM: ${prompt.substring(0, 100)}...`,
      );
      console.error(`🧠 DELEGATION CONTEXT:`, JSON.stringify(context, null, 2));

      // Use the agentic service with orchestrator enabled
      const result = await this.agenticService.runAgenticQuery(prompt, {
        maxTokens: max_tokens,
        temperature,
        useTools: true,
        useOrchestrator: true,
        orchestratorOptions: {
          enableValidation: enable_validation,
          enableRules: true,
          enableRAG: true,
          fallbackToCursor: enable_validation,
        },
      });

      let responseText = result.response;

      // Add delegation metadata
      responseText += `\n\n--- Local LLM Delegation Info ---\n`;
      responseText += `Tools Used: ${result.toolsUsed.join(", ")}\n`;
      responseText += `Used Local LLM: ${result.orchestratorResult?.usedLocalLLM ?? result.metadata?.usedLocalLLM ?? "Unknown"}\n`;
      responseText += `Fallback Used: ${result.orchestratorResult?.fallbackUsed ?? result.metadata?.fallbackUsed ?? "Unknown"}\n`;
      responseText += `Saved to RAG: ${result.orchestratorResult?.savedToRAG ?? result.metadata?.savedToRAG ?? "Unknown"}\n`;

      if (result.orchestratorResult) {
        responseText += `Orchestrator Tools: ${result.orchestratorResult.toolsUsed.join(", ")}\n`;
        responseText += `Validation Applied: ${result.orchestratorResult.validationResult ? "Yes" : "No"}\n`;
        responseText += `Rules Applied: ${result.orchestratorResult.ruleEvaluation ? "Yes" : "No"}\n`;
      }

      console.error(
        `🧠 LOCAL LLM DELEGATION COMPLETED: ${result.toolsUsed.length} tools used`,
      );

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      console.error(`❌ LOCAL LLM DELEGATION ERROR:`, (error as Error).message);
      throw new Error(
        `Failed to delegate to local LLM: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      try {
        // Save RAG storage before shutdown
        await this.ragService.saveStorage();
        console.error("RAG storage saved successfully");
      } catch (error) {
        console.error(
          "Failed to save RAG storage on shutdown:",
          (error as Error).message,
        );
      }
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  }

  /**
   * Handle Sonar API queries
   */
  private async handleSonarQuery(args: SonarQueryArgs) {
    try {
      if (!this.sonarService) {
        throw new Error(
          "Sonar service is not available. Please set PERPLEXITY_API_KEY environment variable.",
        );
      }

      console.error(`MCP Server: Querying Sonar API with: ${args.query}`);

      const result = await this.sonarService.searchWithCitations(args.query, {
        max_tokens: args.max_tokens || 1000,
        temperature: args.temperature || 0.7,
      });

      console.error(
        `MCP Server: Sonar API response received with ${result.sources.length} sources`,
      );

      // Format the response with citations
      let responseText = result.answer;

      if (result.sources.length > 0) {
        responseText += "\n\n**Sources:**\n";
        result.sources.forEach((source, index) => {
          responseText += `${index + 1}. [${source.title}](${source.url})\n`;
          if (source.snippet) {
            responseText += `   ${source.snippet}\n`;
          }
        });
      }

      responseText += `\n\n--- Sonar API Info ---\n`;
      responseText += `Cost: $${result.cost.toFixed(4)}\n`;
      responseText += `Sources: ${result.sources.length}\n`;

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      console.error(
        `MCP Server: Error in Sonar query:`,
        (error as Error).message,
      );
      return {
        content: [
          {
            type: "text",
            text: `Error querying Sonar API: ${(error as Error).message}`,
          },
        ],
      };
    }
  }

  // Enhanced Memory Tools - Temporarily disabled
  // private async handleEnhancedMemoryQuery(args: any) {
  //   try {
  //     const enhancedMemoryTools = createEnhancedMemoryTools(this.agenticService.getLLM());
  //     const tool = enhancedMemoryTools.find(t => t.name === "enhanced_memory_query");
  //
  //     if (!tool) {
  //       throw new Error("Enhanced memory query tool not found");
  //     }

  //     const result = await tool.execute(args, {
  //       ragService: this.ragService,
  //       enhancedMemory: null // Will be initialized in the tool
  //     });

  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: result,
  //         },
  //       ],
  //     };
  //   } catch (error) {
  //     console.error(`MCP Server: Error in enhanced memory query:`, (error as Error).message);
  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: `Error in enhanced memory query: ${(error as Error).message}`,
  //         },
  //       ],
  //     };
  //   }
  // }

  // Enhanced Memory Tools - Temporarily disabled
  // private async handleLearnFromError(args: any) { ... }
  // private async handleIndexCodebase(args: any) { ... }
  // private async handleGetMemoryStatistics() { ... }
  // private async handleFindSimilarErrors(args: any) { ... }
}
