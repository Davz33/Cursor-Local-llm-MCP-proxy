import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AgenticService } from "../agentic/agentic-service.js";
import { RAGService } from "../rag/rag-service.js";

/**
 * MCP Server for Local LLM Proxy with LlamaIndex.TS integration
 */
export class LocalLLMProxyServer {
  constructor() {
    this.server = new Server(
      {
        name: "local-llm-proxy-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.agenticService = new AgenticService();
    this.ragService = new RAGService();
    
    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_text",
            description: "Generate text using the local LLM with agentic capabilities",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The prompt to send to the LLM",
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
            description: "Chat completion with the local LLM using agentic capabilities",
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
                  description: "Text content to index directly (alternative to file_path)",
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
          case "generate_text":
            return await this.handleGenerateText(args);
          case "chat_completion":
            return await this.handleChatCompletion(args);
          case "rag_query":
            const fs = await import("fs/promises");
            await fs.appendFile("tool-debug.log", `Tool handler: rag_query called with args: ${JSON.stringify(args)}\n`).catch(() => {});
            console.error("MCP Server: About to call handleRAGQuery");
            const result = await this.handleRAGQuery(args);
            console.error("MCP Server: handleRAGQuery completed");
            return result;
          case "index_document":
            return await this.handleIndexDocument(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`MCP Server: Error in tool handler for ${name}:`, error.message);
        console.error(`MCP Server: Error stack:`, error.stack);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async handleGenerateText(args) {
    const { prompt, max_tokens = 1000, temperature = 0.7, use_agentic = true, stream = false } = args;

    try {
      if (stream) {
        // For streaming, we'll return a single response with streaming info
        return {
          content: [
            {
              type: "text",
              text: `[STREAMING] Starting generation for prompt: "${prompt.substring(0, 100)}..."`,
            },
          ],
        };
      }

      const response = await this.agenticService.generateText(prompt, {
        use_agentic,
        max_tokens,
        temperature,
      });
      
      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (error) {
      throw new Error(`LLM generation failed: ${error.message}`);
    }
  }

  async handleChatCompletion(args) {
    const { messages, max_tokens = 1000, temperature = 0.7, use_agentic = true, stream = false } = args;

    try {
      if (stream) {
        return {
          content: [
            {
              type: "text",
              text: `[STREAMING] Starting chat completion with ${messages.length} messages`,
            },
          ],
        };
      }

      const response = await this.agenticService.chatCompletion(messages, {
        use_agentic,
        max_tokens,
        temperature,
      });
      
      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Chat completion failed: ${error.message}`);
    }
  }

  async handleRAGQuery(args) {
    const { query, max_tokens = 1000, temperature = 0.7 } = args;

    try {
      // Write to file since console.error might not be visible
      const fs = await import("fs/promises");
      await fs.appendFile("mcp-debug.log", `MCP Server: Starting RAG query with: ${query}\n`).catch(() => {});
      
      console.error("MCP Server: Starting RAG query with:", query);
      console.error("MCP Server: RAG service exists:", !!this.ragService);
      console.error("MCP Server: RAG service instance ID:", this.ragService?.instanceId);
      
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
      await fs.appendFile("mcp-debug.log", `MCP Server: RAG query error: ${error.message}\n`).catch(() => {});
      console.error("MCP Server: RAG query error:", error.message);
      console.error("MCP Server: RAG query error stack:", error.stack);
      throw new Error(`RAG query failed: ${error.message}`);
    }
  }

  async handleIndexDocument(args) {
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
      throw new Error(`Document indexing failed: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Local LLM Proxy MCP Server with LlamaIndex.TS integration running on stdio");
  }
}
