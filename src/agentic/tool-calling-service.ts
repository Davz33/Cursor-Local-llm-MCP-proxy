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
    // This is a simplified parser - in practice, you'd want more robust parsing
    const toolCallRegex =
      /<tool_call>\s*{\s*"name":\s*"([^"]+)",\s*"parameters":\s*({[^}]+})\s*}/g;
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const toolName = match[1];
        const parametersStr = match[2];
        if (toolName && parametersStr) {
          const parameters = JSON.parse(parametersStr);
          toolCalls.push({ name: toolName, parameters });
        }
      } catch (error) {
        console.error(`Failed to parse tool call: ${match[0]}`, error);
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
   * Get LLM response (placeholder - needs implementation)
   */
  private async getLLMResponse(prompt: string): Promise<string> {
    // TODO: Implement actual LLM call
    // This should use your LLM instance to generate a response
    return `LLM Response for: ${prompt}`;
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
}
