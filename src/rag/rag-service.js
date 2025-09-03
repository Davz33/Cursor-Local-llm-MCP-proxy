import { Document, VectorStoreIndex, Settings } from "llamaindex";
import { configureSettings } from "../config/llm-config.js";
import fs from "fs/promises";

/**
 * RAG Service for document indexing and querying
 */
export class RAGService {
  constructor() {
    try {
      // Create unique instance ID for tracking
      this.instanceId = `RAG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Configure global settings (handles duplicate configuration internally)
      configureSettings();
      this.documentIndex = null; // Instance-specific document index
      console.error(`RAG Service [${this.instanceId}]: Initialized successfully`);
      console.error(`RAG Service [${this.instanceId}]: Document index initialized as:`, this.documentIndex);
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to initialize:`, error.message);
      throw error;
    }
  }

  /**
   * Index a document from file path
   */
  async indexDocument(filePath) {
    try {
      const fs = await import("fs/promises");
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
      throw new Error(`Failed to index document: ${error.message}`);
    }
  }

  /**
   * Index text content directly
   */
  async indexText(text) {
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
      console.error("RAG Service: Error in indexText:", error.message);
      throw new Error(`Failed to index text: ${error.message}`);
    }
  }

  /**
   * Query indexed documents
   */
  async queryDocuments(query) {
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
      const response = await queryEngine.query({ query });
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
        responseText = response.response || response.message?.content || response.text || "No response text available";
        
        // Handle source nodes carefully
        if (response.sourceNodes && Array.isArray(response.sourceNodes) && response.sourceNodes.length > 0) {
          sourceInfo = response.sourceNodes.map(node => {
            return node?.node?.metadata?.source || node?.metadata?.source || 'unknown';
          }).join(', ');
        }
      } catch (parseError) {
        console.error(`RAG Service [${this.instanceId}]: Error parsing response:`, parseError.message);
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
      console.error(`RAG Service [${this.instanceId}]: Error in queryDocuments:`, error.message);
      console.error(`RAG Service [${this.instanceId}]: Error stack:`, error.stack);
      throw new Error(`RAG query failed: ${error.message}`);
    }
  }

  /**
   * Check if documents are indexed
   */
  hasIndexedDocuments() {
    console.error("RAG Service: Checking if documents are indexed:", this.documentIndex !== null);
    return this.documentIndex !== null;
  }

  /**
   * Get document index status
   */
  getIndexStatus() {
    const status = {
      hasIndex: this.documentIndex !== null,
      indexType: this.documentIndex ? "VectorStoreIndex" : "none",
      instanceId: this.instanceId
    };
    console.error(`RAG Service [${this.instanceId}]: Index status:`, status);
    return status;
  }
}
