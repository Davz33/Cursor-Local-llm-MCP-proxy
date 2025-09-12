import {
  EnhancedRAGService,
  EnhancedRAGQueryResult,
} from "./enhanced-rag-service.js";
import { ASTGraphBuilder, CodeGraph } from "./ast-graph-builder.js";
import {
  ErrorLearningService,
  ErrorContext,
  SolutionPattern,
} from "./error-learning-service.js";
import { LLM } from "llamaindex";

export interface MemoryQueryResult {
  response: string;
  codeContext: string[];
  errorPatterns: Array<{
    errorType: string;
    solution: string;
    confidence: number;
  }>;
  reasoningPath: string[];
  confidence: number;
  sourceFiles: string[];
}

export interface CodebaseMemoryConfig {
  enableErrorLearning: boolean;
  enableASTGraph: boolean;
  enableEnhancedRAG: boolean;
  storagePath: string;
  confidenceThreshold: number;
}

export class EnhancedMemoryOrchestrator {
  private enhancedRAG: EnhancedRAGService;
  private astGraphBuilder: ASTGraphBuilder;
  private errorLearning: ErrorLearningService;
  private llm: LLM;
  private config: CodebaseMemoryConfig;
  private codeGraph: CodeGraph | null = null;

  constructor(llm: LLM, config: CodebaseMemoryConfig) {
    this.llm = llm;
    this.config = config;

    this.enhancedRAG = new EnhancedRAGService(config.storagePath);
    this.astGraphBuilder = new ASTGraphBuilder();
    this.errorLearning = new ErrorLearningService(config.storagePath);
  }

  async initialize(): Promise<void> {
    console.error("Enhanced Memory Orchestrator: Initializing...");

    if (this.config.enableEnhancedRAG) {
      await this.enhancedRAG.initialize();
    }

    if (this.config.enableErrorLearning) {
      await this.errorLearning.initialize();
    }

    console.error("Enhanced Memory Orchestrator: Initialized successfully");
  }

  /**
   * Index codebase files with enhanced memory
   */
  async indexCodebase(
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    console.error(
      `Enhanced Memory Orchestrator: Indexing ${files.length} files...`,
    );

    for (const file of files) {
      try {
        // Index with enhanced RAG
        if (this.config.enableEnhancedRAG) {
          await this.enhancedRAG.indexCodeFile(file.path);
        }

        // Build AST graph
        if (this.config.enableASTGraph) {
          const fileGraph = await this.astGraphBuilder.buildFromFile(
            file.path,
            file.content,
          );
          this.mergeCodeGraph(fileGraph);
        }

        console.error(`Enhanced Memory Orchestrator: Indexed ${file.path}`);
      } catch (error) {
        console.error(
          `Enhanced Memory Orchestrator: Failed to index ${file.path}:`,
          (error as Error).message,
        );
      }
    }

    console.error("Enhanced Memory Orchestrator: Codebase indexing completed");
  }

  /**
   * Query with enhanced memory and reasoning
   */
  async queryWithMemory(
    query: string,
    context: Record<string, any> = {},
  ): Promise<MemoryQueryResult> {
    console.error(`Enhanced Memory Orchestrator: Processing query: ${query}`);

    const reasoningPath: string[] = [];
    const codeContext: string[] = [];
    const sourceFiles: string[] = [];

    // Step 1: Enhanced RAG query
    let ragResult: EnhancedRAGQueryResult | null = null;
    if (this.config.enableEnhancedRAG) {
      try {
        ragResult = await this.enhancedRAG.queryWithReasoning(query);
        reasoningPath.push("Enhanced RAG query completed");
        codeContext.push(
          ...ragResult.codeGraph.map(
            (node) =>
              `${node.type}: ${node.name} (${node.filePath}:${node.lineNumber})`,
          ),
        );
        sourceFiles.push(...ragResult.codeGraph.map((node) => node.filePath));
      } catch (error) {
        reasoningPath.push(
          `Enhanced RAG query failed: ${(error as Error).message}`,
        );
      }
    }

    // Step 2: AST Graph analysis
    let astInsights: string[] = [];
    if (this.config.enableASTGraph && this.codeGraph) {
      try {
        const similarNodes = this.astGraphBuilder.findSimilarNodes(query, 0.6);
        astInsights = similarNodes.map(
          (node) => `${node.type} ${node.name} in ${node.filePath}`,
        );
        reasoningPath.push(
          `Found ${similarNodes.length} relevant code nodes via AST analysis`,
        );
      } catch (error) {
        reasoningPath.push(`AST analysis failed: ${(error as Error).message}`);
      }
    }

    // Step 3: Error pattern analysis
    let errorPatterns: Array<{
      errorType: string;
      solution: string;
      confidence: number;
    }> = [];
    if (this.config.enableErrorLearning) {
      try {
        const errorContext: ErrorContext = {
          filePath: context.filePath || "unknown",
          functionName: context.functionName,
          className: context.className,
          lineNumber: context.lineNumber || 0,
          stackTrace: context.stackTrace || "",
          variables: context.variables || {},
          imports: context.imports || [],
        };

        const recommendations =
          await this.errorLearning.getSolutionRecommendations(
            query,
            errorContext,
          );
        errorPatterns = [
          {
            errorType: "query_analysis",
            solution: recommendations.primarySolution,
            confidence: recommendations.confidence,
          },
        ];

        reasoningPath.push(...recommendations.reasoning);
      } catch (error) {
        reasoningPath.push(
          `Error pattern analysis failed: ${(error as Error).message}`,
        );
      }
    }

    // Step 4: Generate final response
    const response = await this.generateEnhancedResponse(
      query,
      ragResult,
      astInsights,
      errorPatterns,
      reasoningPath,
    );

    // Step 5: Calculate overall confidence
    const confidence = this.calculateOverallConfidence(
      ragResult,
      errorPatterns,
      astInsights,
    );

    return {
      response,
      codeContext: [...codeContext, ...astInsights],
      errorPatterns,
      reasoningPath,
      confidence,
      sourceFiles: [...new Set(sourceFiles)],
    };
  }

  /**
   * Learn from error-solution pair
   */
  async learnFromError(
    error: Error,
    context: ErrorContext,
    solution: string,
    codeChanges: Array<{
      type: "add" | "remove" | "modify";
      filePath: string;
      lineNumber: number;
      oldCode?: string;
      newCode: string;
      reason: string;
    }> = [],
  ): Promise<void> {
    if (!this.config.enableErrorLearning) return;

    try {
      await this.errorLearning.learnFromError(
        error,
        context,
        solution,
        codeChanges,
      );
      console.error(
        "Enhanced Memory Orchestrator: Learned from error-solution pair",
      );
    } catch (error) {
      console.error(
        "Enhanced Memory Orchestrator: Failed to learn from error:",
        (error as Error).message,
      );
    }
  }

  /**
   * Get memory statistics
   */
  getMemoryStatistics(): {
    ragStats: any;
    errorStats: any;
    astStats: any;
  } {
    return {
      ragStats: this.config.enableEnhancedRAG
        ? this.enhancedRAG.getIndexStatus()
        : null,
      errorStats: this.config.enableErrorLearning
        ? this.errorLearning.getErrorStatistics()
        : null,
      astStats: this.codeGraph
        ? {
            totalNodes: this.codeGraph.nodes.size,
            totalRelationships: this.codeGraph.relationships.size,
            files: this.codeGraph.fileStructure.size,
          }
        : null,
    };
  }

  private mergeCodeGraph(newGraph: CodeGraph): void {
    if (!this.codeGraph) {
      this.codeGraph = newGraph;
      return;
    }

    // Merge nodes
    for (const [id, node] of newGraph.nodes) {
      this.codeGraph.nodes.set(id, node);
    }

    // Merge relationships
    for (const [id, relationship] of newGraph.relationships) {
      this.codeGraph.relationships.set(id, relationship);
    }

    // Merge file structure
    for (const [filePath, nodeIds] of newGraph.fileStructure) {
      this.codeGraph.fileStructure.set(filePath, nodeIds);
    }
  }

  private async generateEnhancedResponse(
    query: string,
    ragResult: EnhancedRAGQueryResult | null,
    astInsights: string[],
    errorPatterns: Array<{
      errorType: string;
      solution: string;
      confidence: number;
    }>,
    reasoningPath: string[],
  ): Promise<string> {
    let response = "";

    // Start with RAG response if available
    if (ragResult && ragResult.response) {
      response += ragResult.response + "\n\n";
    }

    // Add AST insights
    if (astInsights.length > 0) {
      response += "**Code Analysis:**\n";
      astInsights.forEach((insight) => {
        response += `- ${insight}\n`;
      });
      response += "\n";
    }

    // Add error pattern insights
    if (errorPatterns.length > 0) {
      response += "**Error Pattern Analysis:**\n";
      errorPatterns.forEach((pattern) => {
        if (pattern.confidence > this.config.confidenceThreshold) {
          response += `- ${pattern.errorType}: ${pattern.solution} (confidence: ${(pattern.confidence * 100).toFixed(1)}%)\n`;
        }
      });
      response += "\n";
    }

    // Add reasoning path
    if (reasoningPath.length > 0) {
      response += "**Reasoning Process:**\n";
      reasoningPath.forEach((step, index) => {
        response += `${index + 1}. ${step}\n`;
      });
    }

    return response.trim();
  }

  private calculateOverallConfidence(
    ragResult: EnhancedRAGQueryResult | null,
    errorPatterns: Array<{
      errorType: string;
      solution: string;
      confidence: number;
    }>,
    astInsights: string[],
  ): number {
    let confidence = 0.5; // Base confidence

    // RAG confidence
    if (ragResult) {
      confidence += ragResult.confidence * 0.4;
    }

    // Error pattern confidence
    if (errorPatterns.length > 0) {
      const avgErrorConfidence =
        errorPatterns.reduce((sum, p) => sum + p.confidence, 0) /
        errorPatterns.length;
      confidence += avgErrorConfidence * 0.3;
    }

    // AST insights confidence
    if (astInsights.length > 0) {
      confidence += Math.min(0.2, astInsights.length * 0.05);
    }

    return Math.min(1.0, confidence);
  }
}
