import { Document, VectorStoreIndex, Settings, EngineResponse } from "llamaindex";
import { configureSettings } from "../config/llm-config.js";
import fs from "fs/promises";

export interface RAGQueryResult {
  query: string;
  response: string;
  sourceNodes: string;
  fullResponse?: EngineResponse;
}

export interface IndexStatus {
  hasIndex: boolean;
  indexType: string;
  instanceId: string;
}

/**
 * RAG Service for document indexing and querying
 */
export class RAGService {
  private documentIndex: VectorStoreIndex | null = null;
  private instanceId: string;

  constructor() {
    // Create unique instance ID for tracking
    this.instanceId = `RAG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Configure global settings (handles duplicate configuration internally)
      configureSettings();
      console.error(`RAG Service [${this.instanceId}]: Initialized successfully`);
      console.error(`RAG Service [${this.instanceId}]: Document index initialized as:`, this.documentIndex);
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to initialize:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Index a document from file path
   */
  async indexDocument(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      
      const document = new Document({ 
        text: content, 
        id_: filePath,
        metadata: { source: filePath }
      });
      
      if (!this.documentIndex) {
        console.error("RAG Service: Creating new VectorStoreIndex from document");
        this.documentIndex = await VectorStoreIndex.fromDocuments([document]);
        console.error("RAG Service: VectorStoreIndex created successfully");
      } else {
        console.error("RAG Service: Adding document to existing index");
        await this.documentIndex.insert(document);
      }
      
      return `Successfully indexed document: ${filePath}`;
    } catch (error) {
      throw new Error(`Failed to index document: ${(error as Error).message}`);
    }
  }

  /**
   * Index text content directly
   */
  async indexText(text: string): Promise<string> {
    try {
      console.error(`RAG Service [${this.instanceId}]: Starting indexText with text length:`, text.length);
      
      const textDocument = new Document({ 
        text: text, 
        id_: `text_${Date.now()}`,
        metadata: { source: "direct_text" }
      });
      
      console.error("RAG Service: Document created, checking if index exists");
      
      if (!this.documentIndex) {
        console.error("RAG Service: Creating new VectorStoreIndex from text document");
        this.documentIndex = await VectorStoreIndex.fromDocuments([textDocument]);
        console.error("RAG Service: VectorStoreIndex created successfully from text");
      } else {
        console.error("RAG Service: Adding text document to existing index");
        await this.documentIndex.insert(textDocument);
        console.error("RAG Service: Text document added to existing index");
      }
      
      console.error("RAG Service: Indexing completed successfully");
      return "Successfully indexed text content";
    } catch (error) {
      console.error("RAG Service: Error in indexText:", (error as Error).message);
      throw new Error(`Failed to index text: ${(error as Error).message}`);
    }
  }

  /**
   * Query indexed documents
   */
  async queryDocuments(query: string): Promise<RAGQueryResult> {
    try {
      const logMsg = `RAG Service [${this.instanceId}]: Starting queryDocuments with query: ${query}\n`;
      await fs.appendFile("rag-debug.log", logMsg).catch(() => {});
      console.error(`RAG Service [${this.instanceId}]: Starting queryDocuments with query:`, query);
      
      if (!this.documentIndex) {
        console.error(`RAG Service [${this.instanceId}]: No document index found`);
        throw new Error("No documents have been indexed yet");
      }
      
      if (!query) {
        console.error(`RAG Service [${this.instanceId}]: No query provided`);
        throw new Error("Query is required");
      }
      
      console.error(`RAG Service [${this.instanceId}]: Document index exists, creating query engine`);
      const queryEngine = this.documentIndex.asQueryEngine();
      console.error(`RAG Service [${this.instanceId}]: Query engine created successfully`);
      
      console.error(`RAG Service [${this.instanceId}]: About to execute query`);
      const response: EngineResponse = await queryEngine.query({ query });
      console.error(`RAG Service [${this.instanceId}]: Query executed, response type:`, typeof response);
      console.error(`RAG Service [${this.instanceId}]: Response keys:`, response ? Object.keys(response) : 'null');
      
      if (!response) {
        return {
          query,
          response: "No response received from query engine",
          sourceNodes: "none"
        };
      }
      
      // Handle response more carefully
      let responseText = "";
      let sourceInfo = "none";
      
      try {
        // Try different ways to extract response text
        if (typeof response.response === 'string') {
          responseText = response.response;
        } else if (response.message?.content) {
          responseText = typeof response.message.content === 'string' 
            ? response.message.content 
            : JSON.stringify(response.message.content);
        } else {
          responseText = "No response text available";
        }
        
        // Handle source nodes carefully
        if (response.sourceNodes && Array.isArray(response.sourceNodes) && response.sourceNodes.length > 0) {
          sourceInfo = response.sourceNodes.map(node => {
            return node?.node?.metadata?.source || 'unknown';
          }).join(', ');
        }
      } catch (parseError) {
        console.error(`RAG Service [${this.instanceId}]: Error parsing response:`, (parseError as Error).message);
        responseText = "Error parsing response";
      }
      
      console.error(`RAG Service [${this.instanceId}]: Successfully processed response`);
      
      return {
        query,
        response: responseText,
        sourceNodes: sourceInfo,
        fullResponse: response
      };
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Error in queryDocuments:`, (error as Error).message);
      console.error(`RAG Service [${this.instanceId}]: Error stack:`, (error as Error).stack);
      throw new Error(`RAG query failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check if documents are indexed
   */
  hasIndexedDocuments(): boolean {
    console.error("RAG Service: Checking if documents are indexed:", this.documentIndex !== null);
    return this.documentIndex !== null;
  }

  /**
   * Get document index status
   */
  getIndexStatus(): IndexStatus {
    const status: IndexStatus = {
      hasIndex: this.documentIndex !== null,
      indexType: this.documentIndex ? "VectorStoreIndex" : "none",
      instanceId: this.instanceId
    };
    console.error(`RAG Service [${this.instanceId}]: Index status:`, status);
    return status;
  }
}
