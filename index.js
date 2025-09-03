#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { OpenAI } from "@llamaindex/openai";
import { Document, VectorStoreIndex, serviceContextFromDefaults } from "llamaindex";
import { HuggingFaceEmbedding } from "@llamaindex/huggingface";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// LM Studio Configuration
const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || "qwen3";

// Initialize LlamaIndex.TS with LM Studio
const llm = new OpenAI({
  baseURL: LM_STUDIO_BASE_URL,
  model: LM_STUDIO_MODEL,
  temperature: 0.7,
  apiKey: "lm-studio", // LM Studio doesn't require real API key
});

// Initialize embedding model for RAG
const embedModel = new HuggingFaceEmbedding({
  modelType: "BAAI/bge-small-en-v1.5",
  quantized: false,
});

// Create service context
const serviceContext = serviceContextFromDefaults({
  llm: llm,
  embedModel: embedModel,
});

// Global document index for RAG
let documentIndex = null;

// Define tools for the agentic system
const mathTool = {
  name: "math_calculator",
  description: "Perform basic mathematical operations on two numbers",
  execute: async ({ a, b, operation }) => {
    switch (operation) {
      case "add":
        return `${a} + ${b} = ${a + b}`;
      case "subtract":
        return `${a} - ${b} = ${a - b}`;
      case "multiply":
        return `${a} * ${b} = ${a * b}`;
      case "divide":
        if (b === 0) return "Error: Division by zero";
        return `${a} / ${b} = ${a / b}`;
      default:
        return "Error: Invalid operation";
    }
  }
};

const fileSystemTool = {
  name: "file_system",
  description: "Read, write, or list files and directories",
  execute: async ({ action, filePath, content }) => {
    try {
      switch (action) {
        case "read":
          const data = await fs.readFile(filePath, "utf-8");
          return `File content:\n${data}`;
        case "write":
          await fs.writeFile(filePath, content, "utf-8");
          return `Successfully wrote to ${filePath}`;
        case "list":
          const files = await fs.readdir(filePath);
          return `Directory contents:\n${files.join("\n")}`;
        default:
          return "Error: Invalid action";
      }
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }
};

const ragTool = {
  name: "rag_system",
  description: "RAG (Retrieval-Augmented Generation) system for document indexing and querying",
  execute: async ({ action, filePath, query, text }) => {
    try {
      switch (action) {
        case "index_document":
          if (!filePath) return "Error: filePath is required for indexing";
          
          const content = await fs.readFile(filePath, "utf-8");
          const document = new Document({ 
            text: content, 
            id_: filePath,
            metadata: { source: filePath }
          });
          
          if (!documentIndex) {
            documentIndex = await VectorStoreIndex.fromDocuments([document], { serviceContext });
          } else {
            // Add document to existing index
            await documentIndex.insert(document);
          }
          
          return `Successfully indexed document: ${filePath}`;
          
        case "index_text":
          if (!text) return "Error: text is required for indexing";
          
          const textDocument = new Document({ 
            text: text, 
            id_: `text_${Date.now()}`,
            metadata: { source: "direct_text" }
          });
          
          if (!documentIndex) {
            documentIndex = await VectorStoreIndex.fromDocuments([textDocument], { serviceContext });
          } else {
            await documentIndex.insert(textDocument);
          }
          
          return "Successfully indexed text content";
          
        case "query_documents":
          if (!documentIndex) return "Error: No documents have been indexed yet";
          if (!query) return "Error: query is required";
          
          const queryEngine = documentIndex.asQueryEngine();
          const response = await queryEngine.query({ query });
          
          return `Query: ${query}\nResponse: ${response.response}\n\nSource nodes: ${response.sourceNodes?.map(node => node.metadata?.source || 'unknown').join(', ') || 'none'}`;
          
        case "list_indexed_documents":
          if (!documentIndex) return "No documents have been indexed yet";
          
          // This is a simplified way to get document info
          return "Documents are indexed. Use query_documents to search through them.";
          
        default:
          return "Error: Invalid action. Use 'index_document', 'index_text', 'query_documents', or 'list_indexed_documents'";
      }
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }
};

// Available tools for the agentic system
const availableTools = [mathTool, fileSystemTool, ragTool];

// MCP Server implementation
class LocalLLMProxyServer {
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
        switch (name) {
          case "generate_text":
            return await this.handleGenerateText(args);
          case "chat_completion":
            return await this.handleChatCompletion(args);
          case "rag_query":
            return await this.handleRAGQuery(args);
          case "index_document":
            return await this.handleIndexDocument(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
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
        // In a real implementation, you'd use MCP's streaming capabilities
        return {
          content: [
            {
              type: "text",
              text: `[STREAMING] Starting generation for prompt: "${prompt.substring(0, 100)}..."`,
            },
          ],
        };
      }

      if (use_agentic) {
        // Use agentic capabilities with tools
        const response = await this.runAgenticQuery(prompt, {
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
      } else {
        // Direct LLM call without tools
        const response = await llm.complete({
          prompt,
          maxTokens: max_tokens,
          temperature,
        });

        return {
          content: [
            {
              type: "text",
              text: response.text,
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`LLM generation failed: ${error.message}`);
    }
  }

  async handleChatCompletion(args) {
    const { messages, max_tokens = 1000, temperature = 0.7, use_agentic = true, stream = false } = args;

    try {
      if (stream) {
        // For streaming, we'll return a single response with streaming info
        return {
          content: [
            {
              type: "text",
              text: `[STREAMING] Starting chat completion with ${messages.length} messages`,
            },
          ],
        };
      }

      if (use_agentic) {
        // Convert messages to a single prompt for agentic processing
        const prompt = messages
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n");
        
        const response = await this.runAgenticQuery(prompt, {
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
      } else {
        // Direct chat completion
        const response = await llm.chat({
          messages,
          maxTokens: max_tokens,
          temperature,
        });

        return {
          content: [
            {
              type: "text",
              text: response.message.content,
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`Chat completion failed: ${error.message}`);
    }
  }

  async handleRAGQuery(args) {
    const { query, max_tokens = 1000, temperature = 0.7 } = args;

    try {
      if (!documentIndex) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No documents have been indexed yet. Use the index_document tool first.",
            },
          ],
        };
      }

      const queryEngine = documentIndex.asQueryEngine();
      const response = await queryEngine.query({ query });

      const sourceInfo = response.sourceNodes?.map(node => 
        `Source: ${node.metadata?.source || 'unknown'}`
      ).join('\n') || 'No sources found';

      return {
        content: [
          {
            type: "text",
            text: `Query: ${query}\n\nResponse: ${response.response}\n\n${sourceInfo}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`RAG query failed: ${error.message}`);
    }
  }

  async handleIndexDocument(args) {
    const { file_path, text_content } = args;

    try {
      if (file_path) {
        const result = await ragTool.execute({ 
          action: "index_document", 
          filePath: file_path 
        });
        
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } else if (text_content) {
        const result = await ragTool.execute({ 
          action: "index_text", 
          text: text_content 
        });
        
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

  async runAgenticQuery(prompt, options = {}) {
    try {
      // Simple agentic implementation using tool calling
      // In a more advanced implementation, you'd use the full LlamaIndex.TS agent framework
      
      // Check if the prompt requires tool usage
      const needsMath = /\b(add|subtract|multiply|divide|plus|minus|times|divided by)\b/i.test(prompt);
      const needsFileSystem = /\b(read|write|list|file|directory)\b/i.test(prompt);
      const needsRAG = /\b(search|find|query|document|index)\b/i.test(prompt);

      let toolResults = "";
      
      if (needsMath) {
        // Extract numbers and operation from prompt
        const numbers = prompt.match(/\d+/g);
        if (numbers && numbers.length >= 2) {
          const a = parseInt(numbers[0]);
          const b = parseInt(numbers[1]);
          let operation = "add";
          
          if (/\b(subtract|minus)\b/i.test(prompt)) operation = "subtract";
          else if (/\b(multiply|times)\b/i.test(prompt)) operation = "multiply";
          else if (/\b(divide|divided by)\b/i.test(prompt)) operation = "divide";
          
          const result = await mathTool.execute({ a, b, operation });
          toolResults += `\nTool Result: ${result}\n`;
        }
      }


      if (needsRAG && documentIndex) {
        // Extract query from prompt for RAG
        const queryMatch = prompt.match(/\b(?:search|find|query)\s+(.+?)(?:\s|$|,|\.)/i);
        if (queryMatch) {
          const query = queryMatch[1].trim();
          const result = await ragTool.execute({ 
            action: "query_documents", 
            query: query 
          });
          toolResults += `\nTool Result: ${result}\n`;
        }
      }

      // Generate response with tool results
      const enhancedPrompt = `${prompt}\n\n${toolResults}`;
      
      const response = await llm.complete({
        prompt: enhancedPrompt,
        maxTokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7,
      });

      return response.text;
    } catch (error) {
      // Fallback to direct LLM call if agentic processing fails
      const response = await llm.complete({
        prompt,
        maxTokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7,
      });
      
      return response.text;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Local LLM Proxy MCP Server with LlamaIndex.TS integration running on stdio");
  }
}

// Start the server
const server = new LocalLLMProxyServer();
server.run().catch(console.error);
