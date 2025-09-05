import fetch from "node-fetch";
import { config } from "dotenv";

// Load environment variables from .env file
config();

export interface SonarMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SonarRequest {
  model: string;
  messages: SonarMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface SonarSearchResult {
  title: string;
  url: string;
  date: string;
  last_updated: string;
  snippet: string;
}

export interface SonarUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  search_context_size: string;
  cost: {
    input_tokens_cost: number;
    output_tokens_cost: number;
    request_cost: number;
    total_cost: number;
  };
}

export interface SonarResponse {
  id: string;
  model: string;
  created: number;
  usage: SonarUsage;
  citations: string[];
  search_results: SonarSearchResult[];
  object: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
  }>;
}

export interface SonarError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

/**
 * Service for interacting with Perplexity's Sonar API
 */
export class SonarService {
  private apiKey: string;
  private baseUrl: string = "https://api.perplexity.ai/chat/completions";

  constructor(apiKey?: string) {
    // Try multiple possible environment variable names
    this.apiKey =
      apiKey ||
      process.env.PERPLEXITY_API_KEY ||
      process.env.SONAR_API_KEY ||
      process.env.PERPLEXITY_SONAR_API_KEY ||
      "";

    if (!this.apiKey) {
      throw new Error(
        "Perplexity API key is required. Set PERPLEXITY_API_KEY, SONAR_API_KEY, or PERPLEXITY_SONAR_API_KEY environment variable in .env file.",
      );
    }
  }

  /**
   * Make a request to the Sonar API
   */
  async query(
    prompt: string,
    options: {
      model?: string;
      max_tokens?: number;
      temperature?: number;
      stream?: boolean;
    } = {},
  ): Promise<SonarResponse> {
    const {
      model = "sonar-pro",
      max_tokens = 1000,
      temperature = 0.7,
      stream = false,
    } = options;

    const requestBody: SonarRequest = {
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens,
      temperature,
      stream,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as SonarError;
        throw new Error(`Sonar API error: ${errorData.error.message}`);
      }

      const data = (await response.json()) as SonarResponse;
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to query Sonar API: ${error.message}`);
      }
      throw new Error("Failed to query Sonar API: Unknown error");
    }
  }

  /**
   * Get real-time information about a topic
   */
  async getRealTimeInfo(
    topic: string,
    options: {
      max_tokens?: number;
      temperature?: number;
    } = {},
  ): Promise<{
    content: string;
    citations: string[];
    searchResults: SonarSearchResult[];
    usage: SonarUsage;
  }> {
    const response = await this.query(topic, options);

    return {
      content: response.choices[0]?.message?.content || "",
      citations: response.citations,
      searchResults: response.search_results,
      usage: response.usage,
    };
  }

  /**
   * Search for current information with citations
   */
  async searchWithCitations(
    query: string,
    options: {
      max_tokens?: number;
      temperature?: number;
    } = {},
  ): Promise<{
    answer: string;
    sources: Array<{
      title: string;
      url: string;
      snippet: string;
    }>;
    cost: number;
  }> {
    const result = await this.getRealTimeInfo(query, options);

    const sources = result.searchResults.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
    }));

    return {
      answer: result.content,
      sources,
      cost: result.usage.cost.total_cost,
    };
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return [
      "sonar-pro",
      "sonar-online",
      "sonar-medium-online",
      "sonar-small-online",
    ];
  }
}
