import { RAGService } from "../rag/rag-service.js";

/**
 * Math Tool for basic mathematical operations
 */
export const mathTool = {
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

/**
 * File System Tool for file operations
 */
export const fileSystemTool = {
  name: "file_system",
  description: "Read, write, or list files and directories",
  execute: async ({ action, filePath, content }) => {
    try {
      const fs = await import("fs/promises");
      
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

/**
 * RAG Tool for document indexing and querying
 */
export const createRAGTool = () => {
  const ragService = new RAGService();
  
  return {
    name: "rag_system",
    description: "RAG (Retrieval-Augmented Generation) system for document indexing and querying",
    execute: async ({ action, filePath, query, text }) => {
      try {
        switch (action) {
          case "index_document":
            if (!filePath) return "Error: filePath is required for indexing";
            return await ragService.indexDocument(filePath);
            
          case "index_text":
            if (!text) return "Error: text is required for indexing";
            return await ragService.indexText(text);
            
          case "query_documents":
            const result = await ragService.queryDocuments(query);
            return `Query: ${result.query}\nResponse: ${result.response}\n\nSource nodes: ${result.sourceNodes}`;
            
          case "list_indexed_documents":
            if (!ragService.hasIndexedDocuments()) {
              return "No documents have been indexed yet";
            }
            return "Documents are indexed. Use query_documents to search through them.";
            
          default:
            return "Error: Invalid action. Use 'index_document', 'index_text', 'query_documents', or 'list_indexed_documents'";
        }
      } catch (error) {
        return `Error: ${error.message}`;
      }
    }
  };
};

/**
 * Get all available tools
 */
export function getAvailableTools() {
  return [mathTool, fileSystemTool, createRAGTool()];
}
