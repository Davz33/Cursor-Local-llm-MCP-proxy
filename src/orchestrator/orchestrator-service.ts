import { LLM } from "llamaindex";
import { MCPDiscoveryService } from "./mcp-discovery.js";
import { MCPClientManager, MCPTool } from "./mcp-client-manager.js";
import { RulesEngine, RuleEvaluationResult } from "./rules-engine.js";
import { ValidationService, ValidationResult } from "./validation-service.js";
import { RAGService } from "../rag/rag-service.js";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isWebSearchQuery as checkWebSearchQuery,
  getMatchingPatterns,
} from "./web-search-patterns.js";

export interface OrchestratorOptions {
  enableValidation?: boolean;
  enableRules?: boolean;
  enableRAG?: boolean;
  fallbackToCursor?: boolean;
  autoConnectServers?: boolean;
}

export interface OrchestratorResult {
  response: string;
  toolsUsed: string[];
  validationResult?: ValidationResult;
  ruleEvaluation?: RuleEvaluationResult;
  usedLocalLLM: boolean;
  fallbackUsed: boolean;
  savedToRAG: boolean;
  metadata: Record<string, any>;
}

/**
 * Main Orchestrator Service that coordinates MCP discovery, client management, rules, and validation
 */
export class OrchestratorService {
  private discoveryService: MCPDiscoveryService;
  private clientManager: MCPClientManager;
  private rulesEngine: RulesEngine;
  private validationService: ValidationService;
  private ragService: RAGService;
  private llm: LLM;
  private options: OrchestratorOptions;

  constructor(
    llm: LLM,
    ragService: RAGService,
    options: OrchestratorOptions = {},
  ) {
    this.llm = llm;
    this.ragService = ragService;
    this.options = {
      enableValidation: true,
      enableRules: true,
      enableRAG: true,
      fallbackToCursor: true,
      autoConnectServers: true,
      ...options,
    };

    // Initialize services
    this.discoveryService = new MCPDiscoveryService();
    this.clientManager = new MCPClientManager(this.discoveryService);
    this.rulesEngine = new RulesEngine();
    this.validationService = new ValidationService(llm);
  }

  /**
   * Initialize the orchestrator service
   */
  async initialize(): Promise<void> {
    try {
      console.error("Orchestrator: Initializing services...");

      // Load rules
      if (this.options.enableRules) {
        await this.rulesEngine.loadRules();
        console.error("Orchestrator: Rules engine initialized");
      }

      // Discover MCP servers
      await this.discoveryService.discoverMCPServers();
      const discoveredCount =
        this.discoveryService.getAllDiscoveredServers().length;
      console.error(`Orchestrator: Discovered ${discoveredCount} MCP servers`);

      // Auto-connect to servers if enabled
      if (this.options.autoConnectServers && discoveredCount > 0) {
        const { successful, failed } =
          await this.clientManager.connectToAllDiscoveredServers();
        console.error(
          `Orchestrator: Connected to ${successful.length} servers, ${failed.length} failed`,
        );
      }

      console.error("Orchestrator: Initialization complete");
    } catch (error) {
      console.error(
        "Orchestrator: Initialization failed:",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Process a query with full orchestration
   */
  async processQuery(
    prompt: string,
    context: Record<string, any> = {},
  ): Promise<OrchestratorResult> {
    try {
      console.error(
        "Orchestrator: Processing query:",
        prompt.substring(0, 100) + "...",
      );

      // Step 1: Determine which tools to use
      // Use real available tools from connected MCP servers
      const availableTools = this.getAvailableTools();
      const selectedTools = await this.selectToolsForQuery(
        prompt,
        availableTools,
        context,
      );

      // Step 2: Evaluate rules for tool usage
      let ruleEvaluation: RuleEvaluationResult | undefined;
      if (this.options.enableRules && selectedTools.length > 0) {
        ruleEvaluation = this.evaluateRulesForTools(
          selectedTools,
          prompt,
          context,
        );

        if (!ruleEvaluation.shouldProceed) {
          return {
            response: "Tool usage denied by rules engine",
            toolsUsed: [],
            ruleEvaluation,
            usedLocalLLM: false,
            fallbackUsed: false,
            savedToRAG: false,
            metadata: { reason: "rules_denied" },
          };
        }
      }

      // Step 3: Execute tools and generate response
      const { response, toolsUsed } =
        await this.executeToolsAndGenerateResponse(
          prompt,
          selectedTools,
          context,
        );

      // Step 4: Validate response
      let validationResult: ValidationResult | undefined;
      if (this.options.enableValidation) {
        validationResult = await this.validationService.validateResponse(
          prompt,
          response,
          context,
        );
      }

      // Step 5: Decide on fallback
      let finalResponse = response;
      let fallbackUsed = false;

      // Special handling for web search queries - don't fallback if Sonar was used
      const isWebSearchQuery = this.isWebSearchQuery(prompt);
      const usedSonar = toolsUsed.some((tool) => tool.includes("sonar_query"));

      if (validationResult?.shouldFallback && this.options.fallbackToCursor) {
        if (isWebSearchQuery && usedSonar) {
          console.error(
            "Orchestrator: Web search query with Sonar - not falling back to Cursor",
          );
          // Keep the Sonar response even if validation suggests fallback
        } else {
          console.error(
            "Orchestrator: Response validation failed, using fallback",
          );
          finalResponse = await this.fallbackToCursor(prompt, context);
          fallbackUsed = true;
        }
      }

      // Step 6: Save to RAG if needed
      let savedToRAG = false;
      if (
        this.options.enableRAG &&
        this.shouldSaveToRAG(prompt, finalResponse, ruleEvaluation)
      ) {
        try {
          await this.ragService.indexText(`Q: ${prompt}\nA: ${finalResponse}`);
          savedToRAG = true;
          console.error("Orchestrator: Response saved to RAG");
        } catch (error) {
          console.error(
            "Orchestrator: Failed to save to RAG:",
            (error as Error).message,
          );
        }
      }

      const result: OrchestratorResult = {
        response: finalResponse,
        toolsUsed,
        usedLocalLLM: !fallbackUsed,
        fallbackUsed,
        savedToRAG,
        metadata: {
          availableTools: availableTools.length,
          selectedTools: selectedTools.length,
          selectedToolNames: selectedTools.map((t) => t.name),
          context,
        },
      };

      if (validationResult) {
        result.validationResult = validationResult;
      }

      if (ruleEvaluation) {
        result.ruleEvaluation = ruleEvaluation;
      }

      return result;
    } catch (error) {
      console.error(
        "Orchestrator: Error processing query:",
        (error as Error).message,
      );

      // Fallback to cursor on error
      if (this.options.fallbackToCursor) {
        try {
          const fallbackResponse = await this.fallbackToCursor(prompt, context);
          return {
            response: fallbackResponse,
            toolsUsed: [],
            usedLocalLLM: false,
            fallbackUsed: true,
            savedToRAG: false,
            metadata: { error: (error as Error).message, fallback: true },
          };
        } catch (fallbackError) {
          return {
            response: `Error: ${(error as Error).message}`,
            toolsUsed: [],
            usedLocalLLM: false,
            fallbackUsed: false,
            savedToRAG: false,
            metadata: {
              error: (error as Error).message,
              fallbackError: (fallbackError as Error).message,
            },
          };
        }
      }

      throw error;
    }
  }

  /**
   * Get all available tools from connected MCP servers
   */
  getAvailableTools(): MCPTool[] {
    return this.clientManager.getAllTools();
  }

  /**
   * Read orchestration rules from files
   */
  private readOrchestrationRules(): string {
    let combinedRules = "";

    try {
      // Read general rules from the repository
      const generalRulesPath = join(
        __dirname,
        "general-orchestration-rules.txt",
      );
      console.log(
        `Orchestrator: Reading general rules from: ${generalRulesPath}`,
      );
      const generalRules = readFileSync(generalRulesPath, "utf-8");
      combinedRules += generalRules + "\n\n";
    } catch (error) {
      console.error(
        "Orchestrator: Failed to read general orchestration rules:",
        (error as Error).message,
      );
      // Try alternative path
      try {
        const altRulesPath = join(
          process.cwd(),
          "src",
          "orchestrator",
          "general-orchestration-rules.txt",
        );
        console.log(
          `Orchestrator: Trying alternative rules path: ${altRulesPath}`,
        );
        const generalRules = readFileSync(altRulesPath, "utf-8");
        combinedRules += generalRules + "\n\n";
        console.log(
          "Orchestrator: Successfully read general rules from alternative path",
        );
      } catch (altError) {
        console.error(
          "Orchestrator: Failed to read general orchestration rules from alternative path:",
          (altError as Error).message,
        );
      }
    }

    try {
      // Read personal rules from user's home directory
      const personalRulesPath =
        process.env.MCP_PERSONAL_RULES_PATH ||
        join(
          process.env.HOME || process.env.USERPROFILE || "",
          "local-llm-proxy",
          "personal-orchestration-rules.txt",
        );
      console.log(
        `Orchestrator: Reading personal rules from: ${personalRulesPath}`,
      );
      const personalRules = readFileSync(personalRulesPath, "utf-8");
      combinedRules += personalRules;
    } catch (error) {
      console.error(
        "Orchestrator: Failed to read personal orchestration rules:",
        (error as Error).message,
      );
      console.error("Orchestrator: Continuing with general rules only");
    }

    if (!combinedRules.trim()) {
      console.error("Orchestrator: No rules found, using default rules");
      return "# Default orchestration rules\n- Use available tools based on prompt analysis";
    }

    return combinedRules;
  }

  /**
   * Select appropriate tools for a query using orchestration rules
   */
  private async selectToolsForQuery(
    prompt: string,
    availableTools: MCPTool[],
    context: Record<string, any>,
  ): Promise<MCPTool[]> {
    // Read orchestration rules
    const rules = this.readOrchestrationRules();

    // Use local LLM to select tools based on rules
    const selectionPrompt = `You are an MCP orchestrator. Select the appropriate tools to use based on the request and available tools.

Request: "${prompt}"

Available Tools:
${availableTools.map((t) => `- ${t.name} (${t.serverName}): ${t.description}`).join("\n")}

CRITICAL PRIORITY RULES:
1. For ANY request about recent news, current events, real-time information, weather, market data, or location-based queries, ALWAYS use "sonar_query" FIRST
2. For complex analysis, planning, problem-solving, or multi-step reasoning tasks, ALWAYS include "sequentialthinking" tool
3. For web search, news, or real-time information, prioritize "sonar_query" over other tools

Orchestration Rules:
${rules}

Context: ${JSON.stringify(context, null, 2)}

Select the most appropriate tools for this request. Return a JSON array of tool names to use.

Format: ["tool_name_1", "tool_name_2", ...]`;

    try {
      const response = await this.generateLocalLLMResponse(selectionPrompt);
      console.error(
        `Orchestrator: LLM tool selection response: ${response.substring(0, 200)}...`,
      );

      // Try to extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          const selectedToolNames = JSON.parse(jsonMatch[0]);
          if (Array.isArray(selectedToolNames)) {
            console.error(
              `Orchestrator: LLM selected tools: ${selectedToolNames.join(", ")}`,
            );
            return availableTools.filter((tool) =>
              selectedToolNames.includes(tool.name),
            );
          }
        } catch (parseError) {
          console.error(
            "Orchestrator: Failed to parse LLM tool selection JSON:",
            (parseError as Error).message,
          );
        }
      }

      // Try to extract individual tool names from text
      const toolNames = availableTools.map((t) => t.name);
      const foundTools = toolNames.filter((toolName) =>
        response.toLowerCase().includes(toolName.toLowerCase()),
      );

      if (foundTools.length > 0) {
        console.error(
          `Orchestrator: Extracted tools from text: ${foundTools.join(", ")}`,
        );
        return availableTools.filter((tool) => foundTools.includes(tool.name));
      }
    } catch (error) {
      console.error(
        "Orchestrator: Failed to select tools using rules, using fallback:",
        (error as Error).message,
      );
    }

    // Fallback to simple keyword matching with enhanced logic
    const selectedTools: MCPTool[] = [];
    const promptLower = prompt.toLowerCase();

    // PRIORITY 1: Check for web search/real-time information patterns FIRST
    const shouldUseWebSearch = checkWebSearchQuery(prompt);

    console.error(`Orchestrator: Web search check - prompt: "${promptLower}"`);
    console.error(
      `Orchestrator: Should use web search (Sonar): ${shouldUseWebSearch}`,
    );

    if (shouldUseWebSearch) {
      const matchingPatterns = getMatchingPatterns(prompt);
      console.error(
        `Orchestrator: Matching web search patterns: ${matchingPatterns.map((p) => `${p.pattern} (${p.priority})`).join(", ")}`,
      );
    }

    // ALWAYS prioritize Sonar for web search queries
    if (shouldUseWebSearch) {
      const sonarTool = availableTools.find(
        (tool) => tool.name === "sonar_query",
      );
      if (sonarTool) {
        selectedTools.push(sonarTool);
        console.error(
          "Orchestrator: Added Sonar tool for web search/real-time information",
        );
        // For web search, we might not need sequential thinking unless it's complex analysis
        if (
          !promptLower.includes("analyze") &&
          !promptLower.includes("complex")
        ) {
          console.error(
            `Orchestrator: Selected tools for web search: ${selectedTools.map((t) => t.name).join(", ")}`,
          );
          return selectedTools;
        }
      }
    }

    // PRIORITY 2: Check for sequential thinking patterns
    const sequentialThinkingPatterns = [
      "analyze",
      "analysis",
      "think",
      "thinking",
      "reason",
      "reasoning",
      "plan",
      "planning",
      "design",
      "designing",
      "strategy",
      "strategic",
      "complex",
      "complicated",
      "multi-step",
      "step by step",
      "break down",
      "evaluate",
      "evaluation",
      "assess",
      "assessment",
      "consider",
      "problem",
      "solution",
      "approach",
      "methodology",
      "framework",
      "architecture",
      "implementation",
      "recommendation",
      "recommendations",
      "comprehensive",
      "detailed",
      "thorough",
      "in-depth",
      "deep dive",
    ];

    const shouldUseSequentialThinking = sequentialThinkingPatterns.some(
      (pattern) => promptLower.includes(pattern),
    );

    console.error(
      `Orchestrator: Sequential thinking check - prompt: "${promptLower}"`,
    );
    console.error(
      `Orchestrator: Should use sequential thinking: ${shouldUseSequentialThinking}`,
    );

    // Always include sequential thinking for complex analysis tasks
    if (shouldUseSequentialThinking) {
      const sequentialTool = availableTools.find(
        (tool) => tool.name === "sequentialthinking",
      );
      if (sequentialTool) {
        selectedTools.push(sequentialTool);
        console.error(
          "Orchestrator: Added sequential thinking tool for complex analysis",
        );
      }
    }

    // Check for other tools
    for (const tool of availableTools) {
      const toolNameLower = tool.name.toLowerCase();
      const descriptionLower = tool.description.toLowerCase();

      // Skip sequential thinking if already added
      if (tool.name === "sequentialthinking" && shouldUseSequentialThinking) {
        continue;
      }

      if (
        promptLower.includes(toolNameLower) ||
        this.hasKeywordMatch(promptLower, descriptionLower) ||
        this.hasKeywordMatch(promptLower, toolNameLower)
      ) {
        selectedTools.push(tool);
      }
    }

    console.error(
      `Orchestrator: Selected tools: ${selectedTools.map((t) => t.name).join(", ")}`,
    );
    return selectedTools;
  }

  /**
   * Check for keyword matches between prompt and tool description
   */
  private hasKeywordMatch(prompt: string, text: string): boolean {
    const keywords = prompt.split(/\s+/).filter((word) => word.length > 3);
    return keywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Check if a prompt is a web search query
   */
  private isWebSearchQuery(prompt: string): boolean {
    return checkWebSearchQuery(prompt);
  }

  /**
   * Get smart defaults for tool arguments based on tool name and context
   */
  private getSmartDefaults(
    tool: MCPTool,
    prompt: string,
    context: Record<string, any>,
  ): any {
    const toolName = tool.name.toLowerCase();

    // Smart defaults based on tool name patterns
    if (toolName.includes("sequential") || toolName.includes("thinking")) {
      return {
        thought: prompt,
        next_thought_needed: true,
        thought_number: 1, // Correct parameter name
        total_thoughts: 3, // Correct parameter name
      };
    }

    if (toolName.includes("create_entities") || toolName.includes("entities")) {
      return {
        entities: [
          {
            name: "MCP Orchestrator Project",
            entityType: "project",
            observations: [prompt],
          },
        ],
      };
    }

    if (toolName.includes("sonar") || toolName.includes("query")) {
      return {
        query: prompt,
        max_tokens: 1500,
        temperature: 0.7,
        model: "sonar-pro",
      };
    }

    if (toolName.includes("resolve-library") || toolName.includes("library")) {
      return {
        libraryName: "mcp-orchestrator",
      };
    }

    if (toolName.includes("download") || toolName.includes("website")) {
      return {
        url: "https://example.com",
      };
    }

    if (toolName.includes("index") || toolName.includes("document")) {
      return {
        text_content: prompt,
      };
    }

    if (toolName.includes("memory_bank") || toolName.includes("memory")) {
      return {
        projectName: "default",
        fileName: "analysis.md",
        content: prompt,
      };
    }

    // Default fallback
    return { prompt, ...context };
  }

  /**
   * Evaluate rules for tool usage
   */
  private evaluateRulesForTools(
    tools: MCPTool[],
    prompt: string,
    context: Record<string, any>,
  ): RuleEvaluationResult {
    // Evaluate rules for each tool
    const evaluations = tools.map((tool) =>
      this.rulesEngine.evaluateToolUsage(
        tool.name,
        tool.serverName,
        prompt,
        context,
      ),
    );

    // Combine evaluations (most restrictive wins)
    const combined: RuleEvaluationResult = {
      matchedRules: [],
      allowedActions: [],
      deniedActions: [],
      shouldProceed: true,
      requiresApproval: false,
      shouldSaveToRAG: false,
      shouldValidateResponse: true,
      shouldFallbackToCursor: false,
    };

    for (const evaluation of evaluations) {
      combined.matchedRules.push(...evaluation.matchedRules);
      combined.allowedActions.push(...evaluation.allowedActions);
      combined.deniedActions.push(...evaluation.deniedActions);

      if (!evaluation.shouldProceed) {
        combined.shouldProceed = false;
      }

      if (evaluation.requiresApproval) {
        combined.requiresApproval = true;
      }

      if (evaluation.shouldSaveToRAG) {
        combined.shouldSaveToRAG = true;
      }

      if (evaluation.shouldValidateResponse) {
        combined.shouldValidateResponse = true;
      }

      if (evaluation.shouldFallbackToCursor) {
        combined.shouldFallbackToCursor = true;
      }
    }

    return combined;
  }

  /**
   * Execute tools and generate response using proper LM Studio tool calling
   */
  private async executeToolsAndGenerateResponse(
    prompt: string,
    tools: MCPTool[],
    context: Record<string, any>,
  ): Promise<{ response: string; toolsUsed: string[] }> {
    const toolsUsed: string[] = [];
    let toolResults: string[] = [];

    // Convert MCP tools to LM Studio tool format
    const lmStudioTools = tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    // Create the tool calling prompt for LM Studio
    const toolCallingPrompt = `You are an intelligent MCP orchestrator. You have access to the following tools to help answer the user's request.

Available tools:
${tools.map((t) => `- ${t.name} (${t.serverName}): ${t.description}`).join("\n")}

User Request: "${prompt}"

Context: ${JSON.stringify(context, null, 2)}

If you need to use tools to answer this request, call them using the proper tool calling format. If you can answer directly without tools, provide a comprehensive response.

Remember: Only call tools if they are actually needed to answer the user's request.`;

    try {
      // Use LM Studio's tool calling mechanism
      const llmResponse = await this.generateLocalLLMResponseWithTools(
        toolCallingPrompt,
        lmStudioTools,
      );

      console.error(
        `Orchestrator: LLM response received - content length: ${llmResponse.content?.length || 0}, tool calls: ${llmResponse.toolCalls?.length || 0}`,
      );

      if (llmResponse.toolCalls) {
        console.error(
          `Orchestrator: Tool calls details:`,
          JSON.stringify(llmResponse.toolCalls, null, 2),
        );
      }

      // Check if the LLM made any tool calls
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        console.error(
          `Orchestrator: LLM made ${llmResponse.toolCalls.length} tool calls`,
        );

        // Execute the tool calls
        for (const toolCall of llmResponse.toolCalls) {
          try {
            const tool = tools.find((t) => t.name === toolCall.function.name);
            if (!tool) {
              console.error(
                `Orchestrator: Tool ${toolCall.function.name} not found in available tools`,
              );
              continue;
            }

            console.error(
              `🔧 ORCHESTRATOR: Executing tool call: ${toolCall.function.name}`,
            );
            console.error(
              `🔧 ORCHESTRATOR: Tool arguments:`,
              JSON.stringify(toolCall.function.arguments, null, 2),
            );

            // Call the real tool using the client manager
            const result = await this.clientManager.callTool(
              tool.serverName,
              tool.name,
              toolCall.function.arguments,
            );

            toolsUsed.push(tool.name);
            toolResults.push(`Tool ${tool.name}: ${JSON.stringify(result)}`);

            console.error(
              `✅ ORCHESTRATOR: Tool ${tool.name} executed successfully`,
            );
            console.error(
              `✅ ORCHESTRATOR: Tool result:`,
              JSON.stringify(result, null, 2),
            );
          } catch (error) {
            const errorMessage = (error as Error).message;
            console.error(
              `❌ ORCHESTRATOR ERROR: ${toolCall.function.name} - ${errorMessage}`,
            );
            toolResults.push(
              `❌ ORCHESTRATOR ERROR: ${toolCall.function.name} - ${errorMessage}`,
            );
          }
        }

        // Generate final response incorporating tool results
        const synthesisPrompt = `You are an intelligent MCP orchestrator. Based on the original request and the tool results, provide a comprehensive response.

Original Request: "${prompt}"

Tool Results:
${toolResults.join("\n")}

Provide a well-structured response that:
1. Directly addresses the original request
2. Incorporates insights from the tool results
3. Is clear and actionable
4. Maintains context and coherence

Response:`;

        const finalResponse =
          await this.generateLocalLLMResponse(synthesisPrompt);
        return { response: finalResponse, toolsUsed };
      } else {
        // No tool calls made, return the LLM's direct response
        console.error("Orchestrator: No tool calls made by LLM");
        return { response: llmResponse.content, toolsUsed: [] };
      }
    } catch (error) {
      console.error(
        "Orchestrator: Error in tool calling execution:",
        (error as Error).message,
      );
      // Fallback to direct response
      const fallbackResponse = await this.generateLocalLLMResponse(prompt);
      return { response: fallbackResponse, toolsUsed: [] };
    }
  }

  /**
   * Generate response using local LLM
   */
  private async generateLocalLLMResponse(prompt: string): Promise<string> {
    try {
      console.error("Orchestrator: Generating local LLM response...");

      // Use the actual LLM to generate response
      const result = await this.llm.complete({ prompt });
      const response = result.text || "No response generated";

      console.error(
        `Orchestrator: Local LLM response generated (${response.length} chars)`,
      );
      return response;
    } catch (error) {
      console.error(
        "Orchestrator: Local LLM generation failed:",
        (error as Error).message,
      );
      throw new Error(
        `Local LLM generation failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Generate response using local LLM with tool calling support
   * Uses direct OpenAI API calls to LM Studio for proper tool calling
   */
  private async generateLocalLLMResponseWithTools(
    prompt: string,
    tools: Array<{
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: any;
      };
    }>,
  ): Promise<{
    content: string;
    toolCalls?: Array<{
      function: {
        name: string;
        arguments: any;
      };
    }>;
  }> {
    try {
      console.error(
        "Orchestrator: Generating local LLM response with tools...",
      );
      console.error(
        `Orchestrator: Available tools: ${tools.map((t) => t.function.name).join(", ")}`,
      );

      // Import OpenAI client for direct API calls
      const { OpenAI } = await import("openai");
      const { getLMStudioConfig } = await import("../config/llm-config.js");

      const config = getLMStudioConfig();
      const openai = new OpenAI({
        baseURL: config.baseURL,
        apiKey: "lm-studio", // LM Studio doesn't require real API key
      });

      // Make direct API call to LM Studio with tools
      const completion = await openai.chat.completions.create({
        model: config.model,
        messages: [
          {
            role: "system",
            content: `You are an intelligent assistant with access to tools. When you need to use a tool, you MUST use the tool calling format provided by the API, not inline text simulation.

IMPORTANT: 
- DO NOT write <thought> or any other tags in your response
- DO NOT simulate tool execution in your text
- ONLY use the actual tool calling mechanism
- If you need to use sequential thinking, call the 'sequentialthinking' tool
- Return tool calls in the 'tool_calls' array, not in your text response

Example of correct tool calling:
If asked to think sequentially, you should respond with a tool call like:
{
  "tool_calls": [{
    "id": "call_1",
    "type": "function",
    "function": {
      "name": "sequentialthinking",
      "arguments": {
        "thought": "Starting my analysis...",
        "nextThoughtNeeded": true,
        "thoughtNumber": 1,
        "totalThoughts": 5
      }
    }
  }]
}`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        tools: tools,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2000,
      });

      const message = completion.choices[0]?.message;
      if (!message) {
        throw new Error("No response from LM Studio");
      }

      // Extract content and tool calls
      const content = message.content || "";
      const toolCalls =
        message.tool_calls?.map((tc: any) => ({
          function: {
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          },
        })) || [];

      console.error(
        `Orchestrator: LM Studio response - content: ${content.length} chars, tool calls: ${toolCalls.length}`,
      );

      return {
        content: content,
        toolCalls: toolCalls,
      };
    } catch (error) {
      console.error(
        "Orchestrator: Error generating LLM response with tools:",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Fallback to cursor (placeholder implementation)
   */
  private async fallbackToCursor(
    prompt: string,
    context: Record<string, any>,
  ): Promise<string> {
    // This would integrate with Cursor's API or use a different LLM
    return `Cursor Fallback Response for: ${prompt.substring(0, 100)}...`;
  }

  /**
   * Determine if response should be saved to RAG
   */
  private shouldSaveToRAG(
    prompt: string,
    response: string,
    ruleEvaluation?: RuleEvaluationResult,
  ): boolean {
    // Check rule evaluation first
    if (ruleEvaluation?.shouldSaveToRAG) {
      return true;
    }

    // Simple heuristics
    const importantKeywords = [
      "important",
      "save",
      "remember",
      "document",
      "note",
    ];
    const promptLower = prompt.toLowerCase();
    const responseLower = response.toLowerCase();

    return importantKeywords.some(
      (keyword) =>
        promptLower.includes(keyword) || responseLower.includes(keyword),
    );
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    discovery: any;
    connections: any;
    rules: any;
    validation: any;
  } {
    return {
      discovery: this.discoveryService.getDiscoveryStatus(),
      connections: this.clientManager.getConnectionStatus(),
      rules: {
        rulesCount: this.rulesEngine.getAllRules().length,
        enabled: this.options.enableRules,
      },
      validation: {
        enabled: this.options.enableValidation,
        stats: this.validationService.getValidationStats(),
      },
    };
  }

  /**
   * Update orchestrator options
   */
  updateOptions(newOptions: Partial<OrchestratorOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}
