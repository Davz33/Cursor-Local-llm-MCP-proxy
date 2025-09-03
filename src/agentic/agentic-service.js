import { configureSettings } from "../config/llm-config.js";
import { getAvailableTools } from "../tools/agentic-tools.js";

/**
 * Agentic Service for handling LLM interactions with tool integration
 */
export class AgenticService {
  constructor() {
    // Configure global settings and get LLM instance
    const { llm } = configureSettings();
    this.llm = llm;
    this.tools = getAvailableTools();
  }

  /**
   * Run agentic query with tool integration
   */
  async runAgenticQuery(prompt, options = {}) {
    try {
      // Check if the prompt requires tool usage
      const needsMath = /\b(add|subtract|multiply|divide|plus|minus|times|divided by)\b/i.test(prompt);
      const needsFileSystem = /\b(read|write|list|file|directory)\b/i.test(prompt);
      const needsRAG = /\b(search|find|query|document|index)\b/i.test(prompt);

      let toolResults = "";
      
      if (needsMath) {
        // Extract numbers and operation from prompt
        const numbers = prompt.match(/\d+/g);
        if (numbers && numbers.length >= 2) {
          const a = parseInt(numbers[0]);
          const b = parseInt(numbers[1]);
          let operation = "add";
          
          if (/\b(subtract|minus)\b/i.test(prompt)) operation = "subtract";
          else if (/\b(multiply|times)\b/i.test(prompt)) operation = "multiply";
          else if (/\b(divide|divided by)\b/i.test(prompt)) operation = "divide";
          
          const mathTool = this.tools.find(tool => tool.name === "math_calculator");
          if (mathTool) {
            const result = await mathTool.execute({ a, b, operation });
            toolResults += `\nTool Result: ${result}\n`;
          }
        }
      }

      if (needsRAG) {
        // Extract query from prompt for RAG
        const queryMatch = prompt.match(/\b(?:search|find|query)\s+(.+?)(?:\s|$|,|\.)/i);
        if (queryMatch) {
          const query = queryMatch[1].trim();
          const ragTool = this.tools.find(tool => tool.name === "rag_system");
          if (ragTool) {
            const result = await ragTool.execute({ 
              action: "query_documents", 
              query: query 
            });
            toolResults += `\nTool Result: ${result}\n`;
          }
        }
      }

      // Generate response with tool results
      const enhancedPrompt = `${prompt}\n\n${toolResults}`;
      
      const response = await this.llm.complete({
        prompt: enhancedPrompt,
        maxTokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7,
      });

      return response.text;
    } catch (error) {
      // Fallback to direct LLM call if agentic processing fails
      const response = await this.llm.complete({
        prompt,
        maxTokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7,
      });
      
      return response.text;
    }
  }

  /**
   * Generate text with agentic capabilities
   */
  async generateText(prompt, options = {}) {
    const { use_agentic = true, max_tokens = 1000, temperature = 0.7 } = options;

    if (use_agentic) {
      return await this.runAgenticQuery(prompt, { max_tokens, temperature });
    } else {
      // Direct LLM call without tools
      const response = await this.llm.complete({
        prompt,
        maxTokens: max_tokens,
        temperature,
      });
      return response.text;
    }
  }

  /**
   * Chat completion with agentic capabilities
   */
  async chatCompletion(messages, options = {}) {
    const { use_agentic = true, max_tokens = 1000, temperature = 0.7 } = options;

    if (use_agentic) {
      // Convert messages to a single prompt for agentic processing
      const prompt = messages
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n");
      
      return await this.runAgenticQuery(prompt, { max_tokens, temperature });
    } else {
      // Direct chat completion
      const response = await this.llm.chat({
        messages,
        maxTokens: max_tokens,
        temperature,
      });
      return response.message.content;
    }
  }
}
