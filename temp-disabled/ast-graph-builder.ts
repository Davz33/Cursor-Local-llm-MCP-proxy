import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

export interface ASTNode {
  id: string;
  type: string;
  name?: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  parentId?: string;
  children: string[];
  relationships: ASTRelationship[];
  metadata: Record<string, any>;
}

export interface ASTRelationship {
  type:
    | "calls"
    | "imports"
    | "extends"
    | "implements"
    | "uses"
    | "defines"
    | "references"
    | "contains";
  targetId: string;
  confidence: number;
  context: string;
}

export interface CodeGraph {
  nodes: Map<string, ASTNode>;
  relationships: Map<string, ASTRelationship>;
  fileStructure: Map<string, string[]>; // filePath -> nodeIds
}

export class ASTGraphBuilder {
  private graph: CodeGraph;
  private nodeCounter: number = 0;

  constructor() {
    this.graph = {
      nodes: new Map(),
      relationships: new Map(),
      fileStructure: new Map(),
    };
  }

  /**
   * Build graph from code file
   */
  async buildFromFile(filePath: string, content: string): Promise<CodeGraph> {
    try {
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
      });

      const fileNodes: string[] = [];

      traverse(ast, {
        Program: (path) => {
          const node = this.createASTNode(path, "program", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
        },

        FunctionDeclaration: (path) => {
          const node = this.createASTNode(path, "function", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
          this.buildFunctionRelationships(path, node);
        },

        ClassDeclaration: (path) => {
          const node = this.createASTNode(path, "class", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
          this.buildClassRelationships(path, node);
        },

        VariableDeclarator: (path) => {
          if (t.isIdentifier(path.node.id)) {
            const node = this.createASTNode(path, "variable", filePath);
            this.graph.nodes.set(node.id, node);
            fileNodes.push(node.id);
            this.buildVariableRelationships(path, node);
          }
        },

        ImportDeclaration: (path) => {
          const node = this.createASTNode(path, "import", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
          this.buildImportRelationships(path, node);
        },

        CallExpression: (path) => {
          if (t.isIdentifier(path.node.callee)) {
            const node = this.createASTNode(path, "call", filePath);
            this.graph.nodes.set(node.id, node);
            fileNodes.push(node.id);
            this.buildCallRelationships(path, node);
          }
        },

        MemberExpression: (path) => {
          const node = this.createASTNode(path, "member", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
          this.buildMemberRelationships(path, node);
        },

        IfStatement: (path) => {
          const node = this.createASTNode(path, "conditional", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
        },

        ForStatement: (path) => {
          const node = this.createASTNode(path, "loop", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
        },

        WhileStatement: (path) => {
          const node = this.createASTNode(path, "loop", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
        },

        TryStatement: (path) => {
          const node = this.createASTNode(path, "try_catch", filePath);
          this.graph.nodes.set(node.id, node);
          fileNodes.push(node.id);
        },
      });

      this.graph.fileStructure.set(filePath, fileNodes);
      return this.graph;
    } catch (error) {
      throw new Error(`Failed to build AST graph: ${(error as Error).message}`);
    }
  }

  /**
   * Find nodes by semantic similarity
   */
  findSimilarNodes(query: string, threshold: number = 0.7): ASTNode[] {
    const similarNodes: ASTNode[] = [];
    const queryLower = query.toLowerCase();

    for (const node of this.graph.nodes.values()) {
      const similarity = this.calculateSimilarity(queryLower, node);
      if (similarity >= threshold) {
        similarNodes.push(node);
      }
    }

    return similarNodes.sort(
      (a, b) =>
        this.calculateSimilarity(queryLower, b) -
        this.calculateSimilarity(queryLower, a),
    );
  }

  /**
   * Find nodes by relationship traversal
   */
  findRelatedNodes(
    nodeId: string,
    relationshipTypes: string[] = [],
    maxDepth: number = 2,
  ): ASTNode[] {
    const visited = new Set<string>();
    const relatedNodes: ASTNode[] = [];
    const queue: { nodeId: string; depth: number }[] = [{ nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { nodeId: currentId, depth } = queue.shift()!;

      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);

      const node = this.graph.nodes.get(currentId);
      if (!node) continue;

      if (depth > 0) {
        relatedNodes.push(node);
      }

      // Find relationships
      for (const rel of node.relationships) {
        if (
          relationshipTypes.length === 0 ||
          relationshipTypes.includes(rel.type)
        ) {
          queue.push({ nodeId: rel.targetId, depth: depth + 1 });
        }
      }
    }

    return relatedNodes;
  }

  /**
   * Get code context for a node
   */
  getCodeContext(nodeId: string, contextLines: number = 5): string {
    const node = this.graph.nodes.get(nodeId);
    if (!node) return "";

    // This would need to be implemented with actual file reading
    // For now, return the node content
    return node.content;
  }

  private createASTNode(path: any, type: string, filePath: string): ASTNode {
    const id = `${filePath}:${type}:${this.nodeCounter++}`;
    const loc = path.node.loc;

    return {
      id,
      type,
      name: this.extractNodeName(path.node),
      content: this.extractNodeContent(path.node),
      filePath,
      startLine: loc?.start.line || 0,
      endLine: loc?.end.line || 0,
      startColumn: loc?.start.column || 0,
      endColumn: loc?.end.column || 0,
      parentId: this.findParentId(path),
      children: [],
      relationships: [],
      metadata: {
        nodeType: path.node.type,
        isAsync: this.isAsyncNode(path.node),
        isExported: this.isExportedNode(path.node),
        complexity: this.calculateComplexity(path.node),
      },
    };
  }

  private buildFunctionRelationships(path: any, node: ASTNode): void {
    // Find function calls within this function
    traverse(path.node, {
      CallExpression: (callPath) => {
        if (t.isIdentifier(callPath.node.callee)) {
          const relationship: ASTRelationship = {
            type: "calls",
            targetId: `${node.filePath}:function:${callPath.node.callee.name}`,
            confidence: 0.8,
            context: `Function ${node.name} calls ${callPath.node.callee.name}`,
          };
          node.relationships.push(relationship);
        }
      },
    });
  }

  private buildClassRelationships(path: any, node: ASTNode): void {
    // Find class inheritance
    if (path.node.superClass) {
      const relationship: ASTRelationship = {
        type: "extends",
        targetId: `${node.filePath}:class:${path.node.superClass.name}`,
        confidence: 0.9,
        context: `Class ${node.name} extends ${path.node.superClass.name}`,
      };
      node.relationships.push(relationship);
    }

    // Find method calls
    traverse(path.node, {
      CallExpression: (callPath) => {
        if (t.isMemberExpression(callPath.node.callee)) {
          const relationship: ASTRelationship = {
            type: "calls",
            targetId: `${node.filePath}:method:${callPath.node.callee.property.name}`,
            confidence: 0.7,
            context: `Class ${node.name} calls method ${callPath.node.callee.property.name}`,
          };
          node.relationships.push(relationship);
        }
      },
    });
  }

  private buildVariableRelationships(path: any, node: ASTNode): void {
    // Find variable usage
    if (t.isIdentifier(path.node.id)) {
      const varName = path.node.id.name;
      traverse(path.node, {
        Identifier: (idPath) => {
          if (idPath.node.name === varName && idPath !== path) {
            const relationship: ASTRelationship = {
              type: "references",
              targetId: node.id,
              confidence: 0.6,
              context: `Variable ${varName} is referenced`,
            };
            node.relationships.push(relationship);
          }
        },
      });
    }
  }

  private buildImportRelationships(path: any, node: ASTNode): void {
    // Find imported modules
    if (path.node.source) {
      const relationship: ASTRelationship = {
        type: "imports",
        targetId: path.node.source.value,
        confidence: 0.9,
        context: `Imports from ${path.node.source.value}`,
      };
      node.relationships.push(relationship);
    }
  }

  private buildCallRelationships(path: any, node: ASTNode): void {
    // This is handled in other relationship builders
  }

  private buildMemberRelationships(path: any, node: ASTNode): void {
    // Find object property access
    if (t.isIdentifier(path.node.property)) {
      const relationship: ASTRelationship = {
        type: "uses",
        targetId: `${node.filePath}:property:${path.node.property.name}`,
        confidence: 0.7,
        context: `Uses property ${path.node.property.name}`,
      };
      node.relationships.push(relationship);
    }
  }

  private extractNodeName(node: any): string {
    if (node.id?.name) return node.id.name;
    if (node.name) return node.name;
    if (node.key?.name) return node.key.name;
    return "anonymous";
  }

  private extractNodeContent(node: any): string {
    return node.toString().slice(0, 500);
  }

  private findParentId(path: any): string | undefined {
    // Find the parent node ID
    let current = path.parent;
    while (current) {
      if (current.node && current.node.loc) {
        return `${path.hub.file.opts.filename}:${current.node.type}:${current.node.loc.start.line}`;
      }
      current = current.parent;
    }
    return undefined;
  }

  private isAsyncNode(node: any): boolean {
    return node.async === true;
  }

  private isExportedNode(node: any): boolean {
    return node.exported === true || node.exportKind === "value";
  }

  private calculateComplexity(node: any): number {
    // Simple complexity calculation based on nesting and statements
    let complexity = 1;
    traverse(node, {
      enter(path) {
        if (
          t.isIfStatement(path.node) ||
          t.isForStatement(path.node) ||
          t.isWhileStatement(path.node) ||
          t.isSwitchStatement(path.node)
        ) {
          complexity++;
        }
      },
    });
    return complexity;
  }

  private calculateSimilarity(query: string, node: ASTNode): number {
    const nodeText = `${node.name || ""} ${node.content}`.toLowerCase();
    const queryWords = query.split(" ");
    let matches = 0;

    for (const word of queryWords) {
      if (nodeText.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }
}
