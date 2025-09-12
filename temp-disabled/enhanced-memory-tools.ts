import { Tool, ToolExecutionContext } from "./agentic-tools.js";
import {
  EnhancedMemoryOrchestrator,
  CodebaseMemoryConfig,
} from "../rag/enhanced-memory-orchestrator.js";
import { ErrorContext } from "../rag/error-learning-service.js";
import { LLM } from "llamaindex";

export interface EnhancedMemoryContext extends ToolExecutionContext {
  enhancedMemory: EnhancedMemoryOrchestrator;
}

export function createEnhancedMemoryTools(llm: LLM): Tool[] {
  const config: CodebaseMemoryConfig = {
    enableErrorLearning: true,
    enableASTGraph: true,
    enableEnhancedRAG: true,
    storagePath: "./enhanced-memory-storage",
    confidenceThreshold: 0.6,
  };

  const enhancedMemory = new EnhancedMemoryOrchestrator(llm, config);

  return [
    {
      name: "enhanced_memory_query",
      description:
        "Query the enhanced memory system with code understanding, error learning, and graph reasoning",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The query to search for in the enhanced memory system",
          },
          context: {
            type: "object",
            description:
              "Additional context for the query (filePath, functionName, etc.)",
          },
        },
        required: ["query"],
      },
      execute: async (params: any, context?: ToolExecutionContext) => {
        try {
          const memory = context?.enhancedMemory || enhancedMemory;
          if (!context?.enhancedMemory) {
            await memory.initialize();
          }

          const result = await memory.queryWithMemory(
            params.query,
            params.context || {},
          );

          let response = `**Enhanced Memory Query Result:**\n\n${result.response}\n\n`;

          if (result.codeContext.length > 0) {
            response += `**Code Context:**\n${result.codeContext.map((ctx) => `- ${ctx}`).join("\n")}\n\n`;
          }

          if (result.errorPatterns.length > 0) {
            response += `**Error Patterns Found:**\n`;
            result.errorPatterns.forEach((pattern) => {
              response += `- ${pattern.errorType}: ${pattern.solution} (confidence: ${(pattern.confidence * 100).toFixed(1)}%)\n`;
            });
            response += "\n";
          }

          if (result.reasoningPath.length > 0) {
            response += `**Reasoning Process:**\n${result.reasoningPath.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\n`;
          }

          response += `**Overall Confidence:** ${(result.confidence * 100).toFixed(1)}%\n`;
          response += `**Source Files:** ${result.sourceFiles.join(", ")}`;

          return response;
        } catch (error) {
          return `Error querying enhanced memory: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "learn_from_error",
      description:
        "Learn from an error-solution pair to improve future assistance",
      parameters: {
        type: "object",
        properties: {
          errorMessage: {
            type: "string",
            description: "The error message that occurred",
          },
          errorContext: {
            type: "object",
            description: "Context about where the error occurred",
          },
          solution: {
            type: "string",
            description: "The solution that fixed the error",
          },
          codeChanges: {
            type: "array",
            description: "Specific code changes made to fix the error",
          },
        },
        required: ["errorMessage", "errorContext", "solution"],
      },
      execute: async (params: any, context?: ToolExecutionContext) => {
        try {
          const memory = context?.enhancedMemory || enhancedMemory;
          if (!context?.enhancedMemory) {
            await memory.initialize();
          }

          const errorContext: ErrorContext = {
            filePath: params.errorContext.filePath,
            functionName: params.errorContext.functionName,
            className: params.errorContext.className,
            lineNumber: params.errorContext.lineNumber,
            stackTrace: params.errorContext.stackTrace || "",
            variables: params.errorContext.variables || {},
            imports: params.errorContext.imports || [],
          };

          const error = new Error(params.errorMessage);

          await memory.learnFromError(
            error,
            errorContext,
            params.solution,
            params.codeChanges || [],
          );

          return `Successfully learned from error-solution pair. This will help improve future assistance for similar issues.`;
        } catch (error) {
          return `Error learning from error-solution pair: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "index_codebase",
      description: "Index codebase files with enhanced memory capabilities",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "Array of files to index",
          },
        },
        required: ["files"],
      },
      execute: async (params: any, context?: ToolExecutionContext) => {
        try {
          const memory = context?.enhancedMemory || enhancedMemory;
          if (!context?.enhancedMemory) {
            await memory.initialize();
          }

          await memory.indexCodebase(params.files);

          return `Successfully indexed ${params.files.length} files with enhanced memory capabilities.`;
        } catch (error) {
          return `Error indexing codebase: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "get_memory_statistics",
      description: "Get statistics about the enhanced memory system",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async (params: any, context?: ToolExecutionContext) => {
        try {
          const memory = context?.enhancedMemory || enhancedMemory;
          if (!context?.enhancedMemory) {
            await memory.initialize();
          }

          const stats = memory.getMemoryStatistics();

          let response = `**Enhanced Memory Statistics:**\n\n`;

          if (stats.ragStats) {
            response += `**RAG System:**\n`;
            response += `- Has Index: ${stats.ragStats.hasIndex}\n`;
            response += `- Index Type: ${stats.ragStats.indexType}\n`;
            response += `- Is Persistent: ${stats.ragStats.isPersistent}\n`;
            response += `- Storage Path: ${stats.ragStats.storagePath}\n\n`;
          }

          if (stats.errorStats) {
            response += `**Error Learning:**\n`;
            response += `- Total Errors: ${stats.errorStats.totalErrors}\n`;
            response += `- Unique Error Types: ${stats.errorStats.uniqueErrorTypes}\n`;
            response += `- Average Resolution Time: ${stats.errorStats.averageResolutionTime.toFixed(2)} minutes\n`;
            response += `- Success Rate: ${(stats.errorStats.successRate * 100).toFixed(1)}%\n`;
            response += `- Most Common Errors:\n`;
            stats.errorStats.mostCommonErrors.forEach((error, index) => {
              response += `  ${index + 1}. ${error.errorType}: ${error.frequency} occurrences\n`;
            });
            response += "\n";
          }

          if (stats.astStats) {
            response += `**AST Graph:**\n`;
            response += `- Total Nodes: ${stats.astStats.totalNodes}\n`;
            response += `- Total Relationships: ${stats.astStats.totalRelationships}\n`;
            response += `- Files Analyzed: ${stats.astStats.files}\n`;
          }

          return response;
        } catch (error) {
          return `Error getting memory statistics: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "find_similar_errors",
      description: "Find similar error patterns to help with debugging",
      parameters: {
        type: "object",
        properties: {
          errorMessage: {
            type: "string",
            description: "The error message to find similar patterns for",
          },
          context: {
            type: "object",
            description: "Context about where the error occurred",
          },
        },
        required: ["errorMessage"],
      },
      execute: async (params: any, context?: ToolExecutionContext) => {
        try {
          const memory = context?.enhancedMemory || enhancedMemory;
          if (!context?.enhancedMemory) {
            await memory.initialize();
          }

          const errorContext: ErrorContext = {
            filePath: params.context?.filePath || "unknown",
            functionName: params.context?.functionName,
            className: params.context?.className,
            lineNumber: params.context?.lineNumber || 0,
            stackTrace: "",
            variables: params.context?.variables || {},
            imports: params.context?.imports || [],
          };

          const recommendations = await memory.queryWithMemory(
            `Find similar errors to: ${params.errorMessage}`,
            params.context || {},
          );

          return `**Similar Error Analysis:**\n\n${recommendations.response}\n\n**Confidence:** ${(recommendations.confidence * 100).toFixed(1)}%`;
        } catch (error) {
          return `Error finding similar errors: ${(error as Error).message}`;
        }
      },
    },
  ];
}
