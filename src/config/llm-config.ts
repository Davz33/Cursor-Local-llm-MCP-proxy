import { OpenAI } from "@llamaindex/openai";
import { HuggingFaceEmbedding } from "@llamaindex/huggingface";
import { Settings } from "llamaindex";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

// Cursor Configuration Interface
interface CursorConfig {
  mcpServers?: {
    [key: string]: {
      env?: {
        LOCAL_LLM_URL?: string;
        LM_STUDIO_MODEL?: string;
      };
    };
  };
}

// Default LM Studio Configuration
const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
const DEFAULT_LM_STUDIO_MODEL = "qwen3-coder-30b-a3b-instruct";

/**
 * Read cursor configuration from .cursor-settings.json
 */
function readCursorConfig(): CursorConfig | null {
  try {
    // Look for .cursor-settings.json in current directory and parent directories
    let currentDir = process.cwd();
    const maxDepth = 5; // Prevent infinite loops
    let depth = 0;

    while (depth < maxDepth) {
      const cursorConfigPath = join(currentDir, ".cursor-settings.json");

      if (existsSync(cursorConfigPath)) {
        console.error(`Found cursor config at: ${cursorConfigPath}`);
        const configContent = readFileSync(cursorConfigPath, "utf-8");
        return JSON.parse(configContent) as CursorConfig;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root
      currentDir = parentDir;
      depth++;
    }

    console.error(
      "No .cursor-settings.json found in current or parent directories",
    );
    return null;
  } catch (error) {
    console.error("Error reading cursor config:", (error as Error).message);
    return null;
  }
}

/**
 * Get configuration values with cursor config fallback
 */
function getConfigValues() {
  const cursorConfig = readCursorConfig();

  // Priority: Environment variables > Cursor MCP server config > Defaults
  const baseURL =
    process.env.LOCAL_LLM_URL ||
    cursorConfig?.mcpServers?.["local-llm-proxy"]?.env?.LOCAL_LLM_URL ||
    DEFAULT_LM_STUDIO_BASE_URL;

  const model =
    process.env.LM_STUDIO_MODEL ||
    cursorConfig?.mcpServers?.["local-llm-proxy"]?.env?.LM_STUDIO_MODEL ||
    DEFAULT_LM_STUDIO_MODEL;

  // Use default values for temperature and maxTokens since they're not in the MCP config
  const temperature = 0.7;
  const maxTokens = 2000;

  console.error(`LLM Config: Using baseURL: ${baseURL}`);
  console.error(`LLM Config: Using model: ${model}`);
  console.error(`LLM Config: Using temperature: ${temperature}`);
  console.error(`LLM Config: Using maxTokens: ${maxTokens}`);

  return { baseURL, model, temperature, maxTokens };
}

// Get configuration values
const { baseURL: LM_STUDIO_BASE_URL, model: LM_STUDIO_MODEL } =
  getConfigValues();

export interface LMStudioConfig {
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Initialize LLM with LM Studio configuration
 */
export function initializeLLM(): OpenAI {
  const config = getConfigValues();
  return new OpenAI({
    baseURL: config.baseURL,
    model: config.model,
    temperature: config.temperature,
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
export function configureSettings(): {
  llm: OpenAI;
  embedModel: HuggingFaceEmbedding;
} {
  console.error("LLM Config: Starting configureSettings");

  // Always configure settings to ensure they are properly set
  const llm = initializeLLM();
  const embedModel = initializeEmbeddingModel();

  // Configure global settings (modern API)
  Settings.llm = llm;
  Settings.embedModel = embedModel;

  console.error("LLM Config: Settings configured with LLM and EmbedModel");
  console.error("LLM Config: Settings.llm after setting:", !!Settings.llm);
  console.error(
    "LLM Config: Settings.embedModel after setting:",
    !!Settings.embedModel,
  );

  return { llm, embedModel };
}

/**
 * Get LM Studio configuration
 */
export function getLMStudioConfig(): LMStudioConfig {
  const config = getConfigValues();
  return {
    baseURL: config.baseURL,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}
