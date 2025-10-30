import {
  Document,
  VectorStoreIndex,
  Settings,
  EngineResponse,
  storageContextFromDefaults,
} from "llamaindex";
import { configureSettings } from "../config/llm-config.js";
import fs from "fs/promises";
import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

export interface CodeNode {
  id: string;
  type: string;
  name?: string;
  content: string;
  filePath: string;
  lineNumber: number;
  relationships: CodeRelationship[];
  metadata: Record<string, any>;
}

export interface CodeRelationship {
  type:
    | "calls"
    | "imports"
    | "extends"
    | "implements"
    | "uses"
    | "defines"
    | "references";
  targetId: string;
  confidence: number;
}

export interface ErrorPattern {
  id: string;
  errorType: string;
  errorMessage: string;
  codeContext: string;
  solution: string;
  frequency: number;
  successRate: number;
  lastOccurred: Date;
}

export interface EnhancedRAGQueryResult {
  query: string;
  response: string;
  sourceNodes: string;
  codeGraph: CodeNode[];
  errorPatterns: ErrorPattern[];
  reasoningPath: string[];
  confidence: number;
  fullResponse?: EngineResponse;
}

export class EnhancedRAGService {
  private documentIndex: VectorStoreIndex | null = null;
  private codeGraph: Map<string, CodeNode> = new Map();
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private documents: Document[] = [];
  private instanceId: string;
  private storagePath: string;
  private isPersistent: boolean = false;

  constructor(storagePath: string = "./enhanced-rag-storage") {
    this.instanceId = `EnhancedRAG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.storagePath = path.resolve(storagePath);
    configureSettings();
  }

  async initialize(): Promise<void> {
    try {
      await this.loadStorage();
      console.error(
        `Enhanced RAG Service [${this.instanceId}]: Initialized successfully`,
      );
    } catch (error) {
      console.error(
        `Enhanced RAG Service [${this.instanceId}]: Failed to initialize:`,
        (error as Error).message,
      );
    }
  }

  /**
   * Index code file and build semantic graph
   */
  async indexCodeFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "jsx", "decorators-legacy"],
      });

      const codeNodes: CodeNode[] = [];
      const relationships: CodeRelationship[] = [];

      traverse(ast, {
        FunctionDeclaration: (path) => {
          const node = this.createCodeNode(path, "function", filePath);
          codeNodes.push(node);
        },
        ClassDeclaration: (path) => {
          const node = this.createCodeNode(path, "class", filePath);
          codeNodes.push(node);
        },
        VariableDeclarator: (path) => {
          if (t.isIdentifier(path.node.id)) {
            const node = this.createCodeNode(path, "variable", filePath);
            codeNodes.push(node);
          }
        },
        ImportDeclaration: (path) => {
          const node = this.createCodeNode(path, "import", filePath);
          codeNodes.push(node);
        },
        CallExpression: (path) => {
          if (t.isIdentifier(path.node.callee)) {
            const node = this.createCodeNode(path, "call", filePath);
            codeNodes.push(node);
          }
        },
      });

      // Build relationships
      this.buildCodeRelationships(codeNodes, relationships);

      // Add to graph
      codeNodes.forEach((node) => {
        this.codeGraph.set(node.id, node);
      });

      // Create document for RAG
      const document = new Document({
        text: this.generateCodeDocument(content, codeNodes),
        id_: filePath,
        metadata: {
          source: filePath,
          type: "code",
          nodeCount: codeNodes.length,
          relationships: relationships.length,
        },
      });

      this.documents.push(document);

      if (!this.documentIndex) {
        this.documentIndex = await VectorStoreIndex.fromDocuments([document]);
      } else {
        await this.documentIndex.insert(document);
      }

      await this.saveStorage();
      return `Successfully indexed code file: ${filePath} with ${codeNodes.length} nodes`;
    } catch (error) {
      throw new Error(`Failed to index code file: ${(error as Error).message}`);
    }
  }

  /**
   * Learn from error-solution patterns
   */
  async learnFromError(
    errorMessage: string,
    codeContext: string,
    solution: string,
  ): Promise<void> {
    const errorId = this.generateErrorId(errorMessage, codeContext);
    const existingPattern = this.errorPatterns.get(errorId);

    if (existingPattern) {
      existingPattern.frequency += 1;
      existingPattern.lastOccurred = new Date();
      // Update success rate based on solution effectiveness
      existingPattern.successRate = (existingPattern.successRate + 1) / 2;
    } else {
      const newPattern: ErrorPattern = {
        id: errorId,
        errorType: this.categorizeError(errorMessage),
        errorMessage,
        codeContext,
        solution,
        frequency: 1,
        successRate: 1.0,
        lastOccurred: new Date(),
      };
      this.errorPatterns.set(errorId, newPattern);
    }

    await this.saveStorage();
  }

  /**
   * Enhanced query with graph reasoning
   */
  async queryWithReasoning(query: string): Promise<EnhancedRAGQueryResult> {
    try {
      if (!this.documentIndex) {
        throw new Error("No documents have been indexed yet");
      }

      // Step 1: Basic RAG query
      const queryEngine = this.documentIndex.asQueryEngine();
      const response: EngineResponse = await queryEngine.query({ query });

      // Step 2: Find relevant code nodes
      const relevantNodes = this.findRelevantCodeNodes(query);

      // Step 3: Find similar error patterns
      const similarErrors = this.findSimilarErrorPatterns(query);

      // Step 4: Generate reasoning path
      const reasoningPath = this.generateReasoningPath(
        query,
        relevantNodes,
        similarErrors,
      );

      // Step 5: Calculate confidence
      const confidence = this.calculateConfidence(
        response,
        relevantNodes,
        similarErrors,
      );

      return {
        query,
        response: this.extractResponseText(response),
        sourceNodes: this.extractSourceNodes(response),
        codeGraph: relevantNodes,
        errorPatterns: similarErrors,
        reasoningPath,
        confidence,
        fullResponse: response,
      };
    } catch (error) {
      throw new Error(`Enhanced RAG query failed: ${(error as Error).message}`);
    }
  }

  private createCodeNode(path: any, type: string, filePath: string): CodeNode {
    const id = `${filePath}:${type}:${path.node.loc?.start.line || 0}`;
    return {
      id,
      type,
      name: this.extractNodeName(path.node),
      content: this.extractNodeContent(path.node),
      filePath,
      lineNumber: path.node.loc?.start.line || 0,
      relationships: [],
      metadata: {
        startLine: path.node.loc?.start.line,
        endLine: path.node.loc?.end.line,
        column: path.node.loc?.start.column,
      },
    };
  }

  private buildCodeRelationships(
    nodes: CodeNode[],
    relationships: CodeRelationship[],
  ): void {
    // Implementation for building relationships between code nodes
    // This would analyze AST to find calls, imports, etc.
  }

  private generateCodeDocument(content: string, nodes: CodeNode[]): string {
    // Generate a rich document that includes code structure and relationships
    let doc = `Code File: ${content}\n\n`;
    doc += `Code Structure:\n`;
    nodes.forEach((node) => {
      doc += `- ${node.type}: ${node.name} (line ${node.lineNumber})\n`;
    });
    return doc;
  }

  private findRelevantCodeNodes(query: string): CodeNode[] {
    // Find code nodes relevant to the query using semantic similarity
    const relevantNodes: CodeNode[] = [];
    // Implementation would use embedding similarity
    return relevantNodes;
  }

  private findSimilarErrorPatterns(query: string): ErrorPattern[] {
    // Find error patterns similar to the query
    const similarPatterns: ErrorPattern[] = [];
    // Implementation would use similarity matching
    return similarPatterns;
  }

  private generateReasoningPath(
    query: string,
    nodes: CodeNode[],
    errors: ErrorPattern[],
  ): string[] {
    const path: string[] = [];
    path.push(`Analyzing query: ${query}`);
    path.push(`Found ${nodes.length} relevant code nodes`);
    path.push(`Found ${errors.length} similar error patterns`);
    if (errors.length > 0) {
      path.push(
        `Previous solutions: ${errors.map((e) => e.solution).join(", ")}`,
      );
    }
    return path;
  }

  private calculateConfidence(
    response: EngineResponse,
    nodes: CodeNode[],
    errors: ErrorPattern[],
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on relevant code nodes
    confidence += Math.min(0.3, nodes.length * 0.1);

    // Increase confidence based on similar error patterns
    confidence += Math.min(0.2, errors.length * 0.1);

    return Math.min(1.0, confidence);
  }

  private generateErrorId(errorMessage: string, codeContext: string): string {
    return `${errorMessage.slice(0, 50)}_${codeContext.slice(0, 50)}`.replace(
      /[^a-zA-Z0-9]/g,
      "_",
    );
  }

  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes("TypeError")) return "type_error";
    if (errorMessage.includes("ReferenceError")) return "reference_error";
    if (errorMessage.includes("SyntaxError")) return "syntax_error";
    return "unknown_error";
  }

  private extractNodeName(node: any): string {
    if (node.id?.name) return node.id.name;
    if (node.name) return node.name;
    return "anonymous";
  }

  private extractNodeContent(node: any): string {
    return node.toString().slice(0, 200);
  }

  private extractResponseText(response: EngineResponse): string {
    if (typeof response.response === "string") {
      return response.response;
    }
    return "No response text available";
  }

  private extractSourceNodes(response: EngineResponse): string {
    if (response.sourceNodes && Array.isArray(response.sourceNodes)) {
      return response.sourceNodes
        .map((node) => node?.node?.metadata?.source || "unknown")
        .join(", ");
    }
    return "none";
  }

  private async loadStorage(): Promise<void> {
    // Implementation for loading persistent storage
  }

  private async saveStorage(): Promise<void> {
    // Implementation for saving persistent storage
  }

  /**
   * Get index status for compatibility with RAGService
   */
  getIndexStatus(): any {
    return {
      hasIndex: !!this.documentIndex,
      indexType: "enhanced",
      instanceId: this.instanceId,
      storagePath: this.storagePath,
      isPersistent: true,
    };
  }
}
