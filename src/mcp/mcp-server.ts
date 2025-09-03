import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AgenticService } from "../agentic/agentic-service.js";
import { RAGService } from "../rag/rag-service.js";

export interface GenerateTextArgs {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  use_agentic?: boolean;
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

/**
 * Local LLM Proxy MCP Server with LlamaIndex.TS integration
 */
export class LocalLLMProxyServer {
  private server: Server;
  private agenticService: AgenticService;
  private ragService: RAGService;

  constructor() {
    this.server = new Server(
      {
        name: "local-llm-proxy-mcp",
        version: "1.0.0",
      }
    );

    this.agenticService = new AgenticService();
    this.ragService = this.agenticService.getRAGService();
    
    this.setupHandlers();
  }

  setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_text_v2",
            description: "Generate text with optional agentic capabilities and tool integration",
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
            description: "Chat completion with optional agentic capabilities and tool integration",
            inputSchema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  description: "Array of chat messages",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string", enum: ["user", "assistant", "system"] },
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
            description: "Query indexed documents using RAG (Retrieval-Augmented Generation)",
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
            return await this.handleGenerateText(args as unknown as GenerateTextArgs);
          case "chat_completion":
            return await this.handleChatCompletion(args as unknown as ChatCompletionArgs);
          case "rag_query":
            const fs = await import("fs/promises");
            await fs.appendFile("tool-debug.log", `Tool handler: rag_query called with args: ${JSON.stringify(args)}\n`).catch(() => {});
            console.error("MCP Server: About to call handleRAGQuery");
            const result = await this.handleRAGQuery(args as unknown as RAGQueryArgs);
            console.error("MCP Server: handleRAGQuery completed");
            return result;
          case "index_document":
            return await this.handleIndexDocument(args as unknown as IndexDocumentArgs);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`MCP Server: Error in tool handler for ${name}:`, (error as Error).message);
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
    const { prompt, max_tokens = 1000, temperature = 0.7, use_agentic = true, stream = false } = args;

    try {
      const result = await this.agenticService.runAgenticQuery(prompt, {
        maxTokens: max_tokens,
        temperature,
        useTools: use_agentic
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
      throw new Error(`Text generation failed: ${(error as Error).message}`);
    }
  }

  async handleChatCompletion(args: ChatCompletionArgs) {
    const { messages, max_tokens = 1000, temperature = 0.7, use_agentic = true, stream = false } = args;

    try {
      // Convert messages to a single prompt for simplicity
      const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      
      const result = await this.agenticService.runAgenticQuery(prompt, {
        maxTokens: max_tokens,
        temperature,
        useTools: use_agentic
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
      await fs.appendFile("mcp-debug.log", `MCP Server: Starting RAG query with: ${query}\n`).catch(() => {});
      
      console.error("MCP Server: Starting RAG query with:", query);
      console.error("MCP Server: RAG service exists:", !!this.ragService);
      console.error("MCP Server: RAG service instance ID:", (this.ragService as any)?.instanceId);
      
      // Check if documents are indexed
      const hasDocs = this.ragService.hasIndexedDocuments();
      console.error("MCP Server: Has indexed documents:", hasDocs);
      await fs.appendFile("mcp-debug.log", `MCP Server: Has indexed documents: ${hasDocs}\n`).catch(() => {});
      
      const result = await this.ragService.queryDocuments(query);
      console.error("MCP Server: RAG query completed successfully");
      await fs.appendFile("mcp-debug.log", `MCP Server: RAG query completed successfully\n`).catch(() => {});

      return {
        content: [
          {
            type: "text",
            text: `Query: ${result.query}\n\nResponse: ${result.response}\n\n${result.sourceNodes ? `Source nodes: ${result.sourceNodes}` : 'No sources found'}`,
          },
        ],
      };
    } catch (error) {
      const fs = await import("fs/promises");
      await fs.appendFile("mcp-debug.log", `MCP Server: RAG query error: ${(error as Error).message}\n`).catch(() => {});
      console.error("MCP Server: RAG query error:", (error as Error).message);
      console.error("MCP Server: RAG query error stack:", (error as Error).stack);
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

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Local LLM Proxy MCP Server with LlamaIndex.TS integration running on stdio");
  }
}
