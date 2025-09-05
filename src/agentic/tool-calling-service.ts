import { LLM } from "llamaindex";
import { Tool, ToolExecutionContext } from "../tools/agentic-tools.js";

export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  result: string;
  error?: string;
}

export interface ToolCallingOptions {
  maxRetries?: number;
  enableErrorReporting?: boolean;
}

/**
 * Service for handling dynamic tool calling following LM Studio patterns
 */
export class ToolCallingService {
  private llm: LLM;
  private tools: Map<string, Tool> = new Map();
  private useRealLLM: boolean = true;

  constructor(llm: LLM, tools: Tool[]) {
    this.llm = llm;
    tools.forEach((tool) => {
      this.tools.set(tool.name, tool);
    });
  }

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Look for tool call patterns in the response
    // Support both <tool_call> tags and direct JSON format
    const toolCallRegex =
      /(?:<tool_call>\s*)?{\s*"name":\s*"([^"]+)",\s*"parameters":\s*({[^}]+})\s*}(?:\s*<\/tool_call>)?/g;
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const toolName = match[1];
        const parametersStr = match[2];
        if (toolName && parametersStr) {
          // Try to fix common JSON issues
          let fixedParametersStr = parametersStr;

          // Fix missing quotes around property names
          fixedParametersStr = fixedParametersStr.replace(/(\w+):/g, '"$1":');

          // Fix missing quotes around string values
          fixedParametersStr = fixedParametersStr.replace(
            /:\s*([^",{\[\s][^,}]*?)(\s*[,}])/g,
            ': "$1"$2',
          );

          const parameters = JSON.parse(fixedParametersStr);
          toolCalls.push({ name: toolName, parameters });
          console.log(`🔧 Parsed tool call: ${toolName}`, parameters);
        }
      } catch (error) {
        console.error(`Failed to parse tool call: ${match[0]}`, error);
        console.log(`Raw parameters string: ${match[2]}`);

        // Try to extract basic information even if JSON parsing fails
        try {
          const toolName = match[1];
          if (toolName) {
            console.log(
              `⚠️ Attempting to create basic tool call for: ${toolName}`,
            );
            // Create a basic tool call with empty parameters
            toolCalls.push({ name: toolName, parameters: {} });
          }
        } catch (fallbackError) {
          console.error(`Fallback parsing also failed:`, fallbackError);
        }
      }
    }

    return toolCalls;
  }

  /**
   * Execute a single tool call
   */
  private async executeToolCall(
    toolCall: ToolCall,
    context?: ToolExecutionContext,
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        toolName: toolCall.name,
        success: false,
        result: "",
        error: `Tool '${toolCall.name}' not found`,
      };
    }

    try {
      // Validate parameters against tool schema
      const validationError = this.validateToolParameters(
        tool,
        toolCall.parameters,
      );
      if (validationError) {
        return {
          toolName: toolCall.name,
          success: false,
          result: "",
          error: validationError,
        };
      }

      // Execute the tool
      const result = await tool.execute(toolCall.parameters, context);

      return {
        toolName: toolCall.name,
        success: true,
        result,
      };
    } catch (error) {
      return {
        toolName: toolCall.name,
        success: false,
        result: "",
        error: (error as Error).message,
      };
    }
  }

  /**
   * Validate tool parameters against schema
   */
  private validateToolParameters(
    tool: Tool,
    parameters: Record<string, any>,
  ): string | null {
    const { required, properties } = tool.parameters;

    // Check required parameters
    for (const requiredParam of required) {
      if (!(requiredParam in parameters)) {
        return `Missing required parameter: ${requiredParam}`;
      }
    }

    // Check parameter types and enums
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) {
        return `Unknown parameter: ${paramName}`;
      }

      // Type validation
      if (paramSchema.type === "string" && typeof paramValue !== "string") {
        return `Parameter '${paramName}' must be a string`;
      }
      if (paramSchema.type === "number" && typeof paramValue !== "number") {
        return `Parameter '${paramName}' must be a number`;
      }

      // Enum validation
      if (paramSchema.enum && !paramSchema.enum.includes(paramValue)) {
        return `Parameter '${paramName}' must be one of: ${paramSchema.enum.join(", ")}`;
      }
    }

    return null;
  }

  /**
   * Generate tool calling prompt for LLM
   */
  private generateToolCallingPrompt(userPrompt: string): string {
    const toolDescriptions = Array.from(this.tools.values())
      .map((tool) => {
        const params = Object.entries(tool.parameters.properties)
          .map(
            ([name, schema]) =>
              `  - ${name} (${schema.type}): ${schema.description}`,
          )
          .join("\n");

        return `Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${params}`;
      })
      .join("\n\n");

    return `You are an AI assistant with access to the following tools:

${toolDescriptions}

When you need to use a tool, format your response as:
<tool_call>
{
  "name": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  }
}
</tool_call>

User request: ${userPrompt}

Please respond with either a direct answer or use the appropriate tool(s) to help the user.`;
  }

  /**
   * Process a query with dynamic tool calling
   */
  async processQuery(
    userPrompt: string,
    context?: ToolExecutionContext,
    options: ToolCallingOptions = {},
  ): Promise<{
    response: string;
    toolResults: ToolCallResult[];
    toolsUsed: string[];
  }> {
    const { maxRetries = 3, enableErrorReporting = true } = options;
    const toolResults: ToolCallResult[] = [];
    const toolsUsed: string[] = [];

    try {
      // Generate tool calling prompt
      const toolPrompt = this.generateToolCallingPrompt(userPrompt);

      // Get LLM response (this would need to be implemented with your LLM)
      // For now, we'll simulate the response
      const llmResponse = await this.getLLMResponse(toolPrompt);

      // Parse tool calls from response
      const toolCalls = this.parseToolCalls(llmResponse);

      if (toolCalls.length === 0) {
        // No tool calls, return direct response
        return {
          response: llmResponse,
          toolResults: [],
          toolsUsed: [],
        };
      }

      // Execute tool calls
      for (const toolCall of toolCalls) {
        const result = await this.executeToolCall(toolCall, context);
        toolResults.push(result);
        toolsUsed.push(toolCall.name);

        if (!result.success && enableErrorReporting) {
          // Report error back to LLM for retry
          console.error(`Tool call failed: ${result.error}`);
        }
      }

      // Generate final response based on tool results
      const finalResponse = this.generateFinalResponse(
        userPrompt,
        toolResults,
        llmResponse,
      );

      return {
        response: finalResponse,
        toolResults,
        toolsUsed,
      };
    } catch (error) {
      throw new Error(`Tool calling failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get LLM response using the configured LLM
   */
  private async getLLMResponse(prompt: string): Promise<string> {
    try {
      if (this.useRealLLM) {
        // Try to use the actual LLM first
        const llmResponse = await this.callRealLLM(prompt);
        if (llmResponse) {
          console.log("✅ Using real LLM for tool calling");
          return llmResponse;
        }
        console.log(
          "⚠️ Real LLM not available, falling back to intelligent simulation",
        );
      } else {
        console.log("🔧 Using intelligent simulation for tool calling");
      }

      // Fall back to intelligent simulation
      return await this.generateIntelligentResponse(prompt);
    } catch (error) {
      throw new Error(`LLM response failed: ${(error as Error).message}`);
    }
  }

  /**
   * Call the real LLM if available
   * Note: Currently disabled due to TypeScript/API compatibility issues
   * This will be re-enabled when the LLM completion API is properly fixed
   */
  private async callRealLLM(prompt: string): Promise<string | null> {
    try {
      console.log("🤖 Calling real LLM for tool calling...");

      // Use the chat method for non-streaming responses
      const response = await this.llm.chat({
        messages: [
          {
            role: "system",
            content:
              'You are a helpful assistant that can use tools. When you need to use a tool, respond with a JSON object in the format: <tool_call>{"name": "tool_name", "parameters": {"param1": "value1", "param2": "value2"}}</tool_call>\n\nIMPORTANT: The JSON must be valid with proper quotes around all property names and string values. Example for filesystem tool: <tool_call>{"name": "filesystem", "parameters": {"action": "write", "path": "filename.txt", "content": "file content"}}</tool_call>',
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract the response content
      if (response && response.message && response.message.content) {
        const content = response.message.content as string;
        console.log(
          "✅ Real LLM response received:",
          content.substring(0, 100) + "...",
        );
        return content;
      } else {
        console.log("⚠️ No content in LLM response");
        return null;
      }
    } catch (error) {
      console.error("❌ Real LLM calling failed:", error);
      return null;
    }
  }

  /**
   * Generate an intelligent response based on the prompt
   * This simulates what a real LLM would do when given tool calling instructions
   */
  private async generateIntelligentResponse(prompt: string): Promise<string> {
    // Analyze the prompt to determine what tools should be called
    const lowerPrompt = prompt.toLowerCase();

    // Check for math operations
    const mathMatch = lowerPrompt.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
    if (mathMatch) {
      const [, a, operation, b] = mathMatch;
      if (a && operation && b) {
        const opMap: Record<string, string> = {
          "+": "add",
          "-": "subtract",
          "*": "multiply",
          "/": "divide",
        };

        return `<tool_call>
{
  "name": "math",
  "parameters": {
    "operation": "${opMap[operation] || "add"}",
    "a": ${parseInt(a)},
    "b": ${parseInt(b)}
  }
}
</tool_call>`;
      }
    }

    // Check for file operations
    if (
      lowerPrompt.includes("list") &&
      (lowerPrompt.includes("directory") || lowerPrompt.includes("contents"))
    ) {
      return `<tool_call>
{
  "name": "filesystem",
  "parameters": {
    "action": "list",
    "path": "."
  }
}
</tool_call>`;
    }

    if (lowerPrompt.includes("read") && lowerPrompt.includes("file")) {
      // Extract file path from prompt
      const fileMatch = lowerPrompt.match(
        /read.*?file[^a-z]*([a-zA-Z0-9._/-]+)/,
      );
      const filePath = fileMatch ? fileMatch[1] : "README.md";

      return `<tool_call>
{
  "name": "filesystem",
  "parameters": {
    "action": "read",
    "path": "${filePath}"
  }
}
</tool_call>`;
    }

    if (lowerPrompt.includes("write") && lowerPrompt.includes("file")) {
      // Extract file path and content from prompt
      const fileMatch = lowerPrompt.match(
        /write.*?file[^a-z]*([a-zA-Z0-9._/-]+)/,
      );
      const filePath = fileMatch ? fileMatch[1] : "output.txt";
      const contentMatch =
        lowerPrompt.match(/content[^a-z]*["']([^"']+)["']/) ||
        lowerPrompt.match(/with[^a-z]*["']([^"']+)["']/);
      const content = contentMatch ? contentMatch[1] : "Generated content";

      return `<tool_call>
{
  "name": "filesystem",
  "parameters": {
    "action": "write",
    "path": "${filePath}",
    "content": "${content}"
  }
}
</tool_call>`;
    }

    // Check for RAG/search operations
    if (
      lowerPrompt.includes("search") ||
      lowerPrompt.includes("information") ||
      lowerPrompt.includes("find") ||
      lowerPrompt.includes("query")
    ) {
      // Extract search query from prompt
      const queryMatch =
        lowerPrompt.match(
          /(?:search|find|query).*?(?:for|about)[^a-z]*["']?([^"']+)["']?/,
        ) ||
        lowerPrompt.match(/(?:information|about)[^a-z]*["']?([^"']+)["']?/);
      const query = queryMatch ? queryMatch[1] : "general information";

      return `<tool_call>
{
  "name": "rag",
  "parameters": {
    "query": "${query}"
  }
}
</tool_call>`;
    }

    // Check for complex multi-tool operations
    if (
      lowerPrompt.includes("calculate") &&
      lowerPrompt.includes("create") &&
      lowerPrompt.includes("file")
    ) {
      // Extract math operation
      const mathMatch = lowerPrompt.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
      if (mathMatch) {
        const [, a, operation, b] = mathMatch;
        if (a && operation && b) {
          const opMap: Record<string, string> = {
            "+": "add",
            "-": "subtract",
            "*": "multiply",
            "/": "divide",
          };

          // Calculate result
          const numA = parseInt(a);
          const numB = parseInt(b);
          let result = 0;
          switch (operation) {
            case "+":
              result = numA + numB;
              break;
            case "-":
              result = numA - numB;
              break;
            case "*":
              result = numA * numB;
              break;
            case "/":
              result = numB !== 0 ? numA / numB : 0;
              break;
          }

          // Extract file path
          const fileMatch = lowerPrompt.match(
            /create.*?file[^a-z]*([a-zA-Z0-9._/-]+)/,
          );
          const filePath = fileMatch ? fileMatch[1] : "result.txt";

          return `<tool_call>
{
  "name": "math",
  "parameters": {
    "operation": "${opMap[operation] || "add"}",
    "a": ${numA},
    "b": ${numB}
  }
}
</tool_call>

<tool_call>
{
  "name": "filesystem",
  "parameters": {
    "action": "write",
    "path": "${filePath}",
    "content": "${result}"
  }
}
</tool_call>`;
        }
      }
    }

    // Default response - no tool calls needed
    return `I understand your request: "${prompt}". I can help you with math operations, file system tasks, or search for information. What would you like me to do?`;
  }

  /**
   * Generate final response based on tool results
   */
  private generateFinalResponse(
    userPrompt: string,
    toolResults: ToolCallResult[],
    originalResponse: string,
  ): string {
    const successfulResults = toolResults.filter((r) => r.success);
    const failedResults = toolResults.filter((r) => !r.success);

    let response = `Based on your request: "${userPrompt}"\n\n`;

    if (successfulResults.length > 0) {
      response += "I used the following tools to help you:\n";
      successfulResults.forEach((result) => {
        response += `- ${result.toolName}: ${result.result}\n`;
      });
    }

    if (failedResults.length > 0) {
      response += "\nSome tools encountered errors:\n";
      failedResults.forEach((result) => {
        response += `- ${result.toolName}: ${result.error}\n`;
      });
    }

    return response;
  }

  /**
   * Get available tools for external use
   */
  getAvailableTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Add a new tool
   */
  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Remove a tool
   */
  removeTool(toolName: string): void {
    this.tools.delete(toolName);
  }

  /**
   * Enable or disable real LLM usage
   */
  setUseRealLLM(useRealLLM: boolean): void {
    this.useRealLLM = useRealLLM;
    console.log(
      `🔧 Tool calling service: ${useRealLLM ? "enabled" : "disabled"} real LLM usage`,
    );
  }

  /**
   * Check if real LLM is available
   */
  async checkLLMAvailability(): Promise<boolean> {
    try {
      const response = await this.callRealLLM("test");
      return response !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): {
    useRealLLM: boolean;
    availableTools: string[];
    llmType: string;
  } {
    return {
      useRealLLM: this.useRealLLM,
      availableTools: Array.from(this.tools.keys()),
      llmType: this.llm.constructor.name,
    };
  }
}
