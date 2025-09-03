import { Document, VectorStoreIndex, Settings, EngineResponse, storageContextFromDefaults } from "llamaindex";
import { configureSettings } from "../config/llm-config.js";
import fs from "fs/promises";
import path from "path";

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
  storagePath?: string;
  isPersistent: boolean;
}

/**
 * RAG Service for document indexing and querying
 */
export class RAGService {
  private documentIndex: VectorStoreIndex | null = null;
  private documents: Document[] = []; // Store original documents for persistence
  private instanceId: string;
  private storagePath: string;
  private isPersistent: boolean = false;

  constructor(storagePath: string = './rag-storage') {
    // Create unique instance ID for tracking
    this.instanceId = `RAG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.storagePath = path.resolve(storagePath);
    
    try {
      // Configure global settings (handles duplicate configuration internally)
      configureSettings();
      
      console.error(`RAG Service [${this.instanceId}]: Initialized successfully`);
      console.error(`RAG Service [${this.instanceId}]: Storage path: ${this.storagePath}`);
      console.error(`RAG Service [${this.instanceId}]: Document index initialized as:`, this.documentIndex);
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to initialize:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Initialize the RAG service and load existing storage
   */
  async initialize(): Promise<void> {
    try {
      // Try to load existing storage on startup
      await this.loadStorage();
      console.error(`RAG Service [${this.instanceId}]: Initialization completed`);
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to initialize:`, (error as Error).message);
      // Don't throw error - allow service to continue without persistence
    }
  }

  /**
   * Load existing storage from disk
   */
  private async loadStorage(): Promise<void> {
    try {
      if (await this.storageExists()) {
        console.error(`RAG Service [${this.instanceId}]: Loading existing storage from ${this.storagePath}`);
        
        // Load the stored documents and recreate the index
        const documentsFile = path.join(this.storagePath, 'documents.json');
        if (await this.fileExists(documentsFile)) {
          const documentsData = await fs.readFile(documentsFile, 'utf-8');
          const savedDocuments = JSON.parse(documentsData);
          
          // Recreate documents and store them
          this.documents = savedDocuments.map((doc: any) => new Document({
            text: doc.text,
            id_: doc.id_,
            metadata: doc.metadata
          }));
          
          // Recreate the index from loaded documents
          this.documentIndex = await VectorStoreIndex.fromDocuments(this.documents);
          this.isPersistent = true;
          console.error(`RAG Service [${this.instanceId}]: Successfully loaded ${this.documents.length} documents from storage`);
        } else {
          console.error(`RAG Service [${this.instanceId}]: No documents file found in storage`);
        }
      } else {
        console.error(`RAG Service [${this.instanceId}]: No existing storage found at ${this.storagePath}`);
      }
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to load storage:`, (error as Error).message);
      // Don't throw error - allow service to continue without persistence
    }
  }

  /**
   * Save current index to disk
   */
  async saveStorage(): Promise<void> {
    try {
      if (this.documentIndex && this.documents.length > 0) {
        console.error(`RAG Service [${this.instanceId}]: Saving storage to ${this.storagePath}`);
        
        // Ensure storage directory exists
        await fs.mkdir(this.storagePath, { recursive: true });
        
        // Save the documents as JSON
        const documentsFile = path.join(this.storagePath, 'documents.json');
        const documentsData = this.documents.map(doc => ({
          text: doc.text,
          id_: doc.id_,
          metadata: doc.metadata
        }));
        
        await fs.writeFile(documentsFile, JSON.stringify(documentsData, null, 2));
        
        // Save metadata
        const storageMetadata = {
          instanceId: this.instanceId,
          timestamp: new Date().toISOString(),
          documentCount: this.documents.length,
          version: "1.0.0"
        };
        
        await fs.writeFile(
          path.join(this.storagePath, 'metadata.json'),
          JSON.stringify(storageMetadata, null, 2)
        );
        
        this.isPersistent = true;
        console.error(`RAG Service [${this.instanceId}]: Successfully saved ${this.documents.length} documents to persistent storage`);
      } else {
        console.error(`RAG Service [${this.instanceId}]: No documents to save`);
      }
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to save storage:`, (error as Error).message);
      throw new Error(`Failed to save RAG storage: ${(error as Error).message}`);
    }
  }

  /**
   * Check if storage exists on disk
   */
  private async storageExists(): Promise<boolean> {
    try {
      await fs.access(this.storagePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear persistent storage
   */
  async clearStorage(): Promise<void> {
    try {
      if (await this.storageExists()) {
        console.error(`RAG Service [${this.instanceId}]: Clearing storage at ${this.storagePath}`);
        await fs.rm(this.storagePath, { recursive: true, force: true });
        this.isPersistent = false;
        console.error(`RAG Service [${this.instanceId}]: Storage cleared successfully`);
      }
    } catch (error) {
      console.error(`RAG Service [${this.instanceId}]: Failed to clear storage:`, (error as Error).message);
      throw new Error(`Failed to clear RAG storage: ${(error as Error).message}`);
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
      
      // Add document to our documents array for persistence
      this.documents.push(document);
      
      if (!this.documentIndex) {
        console.error("RAG Service: Creating new VectorStoreIndex from document");
        this.documentIndex = await VectorStoreIndex.fromDocuments([document]);
        console.error("RAG Service: VectorStoreIndex created successfully");
      } else {
        console.error("RAG Service: Adding document to existing index");
        await this.documentIndex.insert(document);
      }
      
      // Auto-save after indexing
      await this.saveStorage();
      
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
      
      // Add document to our documents array for persistence
      this.documents.push(textDocument);
      
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
      
      // Auto-save after indexing
      await this.saveStorage();
      
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
      instanceId: this.instanceId,
      storagePath: this.storagePath,
      isPersistent: this.isPersistent
    };
    console.error(`RAG Service [${this.instanceId}]: Index status:`, status);
    return status;
  }
}
