import { OpenAI } from "@llamaindex/openai";
import { HuggingFaceEmbedding } from "@llamaindex/huggingface";
import { Settings } from "llamaindex";

// LM Studio Configuration
const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || "qwen3-coder-30b-a3b-instruct";

export interface LMStudioConfig {
  baseURL: string;
  model: string;
}

/**
 * Initialize LLM with LM Studio configuration
 */
export function initializeLLM(): OpenAI {
  return new OpenAI({
    baseURL: LM_STUDIO_BASE_URL,
    model: LM_STUDIO_MODEL,
    temperature: 0.7,
    apiKey: "lm-studio", // LM Studio doesn't require real API key
  });
}

/**
 * Initialize embedding model for RAG
 */
export function initializeEmbeddingModel(): HuggingFaceEmbedding {
  return new HuggingFaceEmbedding({
    modelType: "BAAI/bge-small-en-v1.5",
  });
}

/**
 * Configure global settings with local LLM and embedding model
 */
export function configureSettings(): { llm: OpenAI; embedModel: HuggingFaceEmbedding } {
  console.error("LLM Config: Starting configureSettings");
  
  // Always configure settings to ensure they are properly set
  const llm = initializeLLM();
  const embedModel = initializeEmbeddingModel();
  
  // Configure global settings (modern API)
  Settings.llm = llm;
  Settings.embedModel = embedModel;
  
  console.error("LLM Config: Settings configured with LLM and EmbedModel");
  console.error("LLM Config: Settings.llm after setting:", !!Settings.llm);
  console.error("LLM Config: Settings.embedModel after setting:", !!Settings.embedModel);
  
  return { llm, embedModel };
}

/**
 * Get LM Studio configuration
 */
export function getLMStudioConfig(): LMStudioConfig {
  return {
    baseURL: LM_STUDIO_BASE_URL,
    model: LM_STUDIO_MODEL,
  };
}
