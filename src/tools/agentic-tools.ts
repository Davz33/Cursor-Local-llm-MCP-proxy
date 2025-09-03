import { RAGService } from "../rag/rag-service.js";
import fs from "fs/promises";
import path from "path";

export interface ToolExecutionContext {
  ragService: RAGService;
}

export interface Tool {
  name: string;
  description: string;
  execute: (params: any, context?: ToolExecutionContext) => Promise<string>;
}

/**
 * Math tool for basic arithmetic operations
 */
export const mathTool: Tool = {
  name: "math",
  description: "Perform basic mathematical operations (add, subtract, multiply, divide)",
  execute: async (params: { operation: string; a: number; b: number }): Promise<string> => {
    const { operation, a, b } = params;
    
    switch (operation) {
      case "add":
        return `Result: ${a} + ${b} = ${a + b}`;
      case "subtract":
        return `Result: ${a} - ${b} = ${a - b}`;
      case "multiply":
        return `Result: ${a} * ${b} = ${a * b}`;
      case "divide":
        if (b === 0) {
          return "Error: Division by zero is not allowed";
        }
        return `Result: ${a} / ${b} = ${a / b}`;
      default:
        return `Error: Unknown operation '${operation}'. Supported operations: add, subtract, multiply, divide`;
    }
  }
};

/**
 * File system tool for file operations
 */
export const fileSystemTool: Tool = {
  name: "filesystem",
  description: "Read, write, and list files and directories",
  execute: async (params: { action: string; path: string; content?: string }): Promise<string> => {
    const { action, path: filePath, content } = params;
    
    try {
      switch (action) {
        case "read":
          const fileContent = await fs.readFile(filePath, "utf-8");
          return `File content:\n${fileContent}`;
          
        case "write":
          if (!content) {
            return "Error: Content is required for write operation";
          }
          await fs.writeFile(filePath, content, "utf-8");
          return `Successfully wrote content to ${filePath}`;
          
        case "list":
          const items = await fs.readdir(filePath);
          const itemDetails = await Promise.all(
            items.map(async (item) => {
              const itemPath = path.join(filePath, item);
              const stats = await fs.stat(itemPath);
              return `${item} (${stats.isDirectory() ? 'directory' : 'file'})`;
            })
          );
          return `Directory contents:\n${itemDetails.join('\n')}`;
          
        case "exists":
          try {
            await fs.access(filePath);
            return `Path exists: ${filePath}`;
          } catch {
            return `Path does not exist: ${filePath}`;
          }
          
              default:
        return `Error: Unknown action '${action}'. Supported actions: read, write, list, exists`;
      }
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }
};

/**
 * RAG tool for document querying
 */
export const ragTool: Tool = {
  name: "rag",
  description: "Query indexed documents using RAG (Retrieval-Augmented Generation)",
  execute: async (params: { query: string }, context?: ToolExecutionContext): Promise<string> => {
    const { query } = params;
    
    if (!context?.ragService) {
      return "Error: RAG service not available in context";
    }
    
    try {
      const result = await context.ragService.queryDocuments(query);
      return `Query: ${result.query}\n\nResponse: ${result.response}\n\nSource: ${result.sourceNodes}`;
    } catch (error) {
      return `RAG query error: ${(error as Error).message}`;
    }
  }
};

/**
 * Get all available tools
 */
export function getAvailableTools(): Tool[] {
  return [mathTool, fileSystemTool, ragTool];
}

/**
 * Get tools with context for RAG functionality
 */
export function getAvailableToolsWithContext(ragService: RAGService): Tool[] {
  return [
    mathTool,
    fileSystemTool,
    {
      ...ragTool,
      execute: async (params: { query: string }): Promise<string> => {
        return await ragTool.execute(params, { ragService });
      }
    }
  ];
}
