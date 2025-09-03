import { LLM } from "llamaindex";
import { MCPDiscoveryService } from "./mcp-discovery.js";
import { MCPClientManager, MCPTool } from "./mcp-client-manager.js";
import { RulesEngine, RuleEvaluationResult } from "./rules-engine.js";
import { ValidationService, ValidationResult } from "./validation-service.js";
import { RAGService } from "../rag/rag-service.js";
import { readFileSync } from "fs";
import { join } from "path";

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

  constructor(llm: LLM, ragService: RAGService, options: OrchestratorOptions = {}) {
    this.llm = llm;
    this.ragService = ragService;
    this.options = {
      enableValidation: true,
      enableRules: true,
      enableRAG: true,
      fallbackToCursor: true,
      autoConnectServers: true,
      ...options
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
      const discoveredCount = this.discoveryService.getAllDiscoveredServers().length;
      console.error(`Orchestrator: Discovered ${discoveredCount} MCP servers`);

      // Auto-connect to servers if enabled
      if (this.options.autoConnectServers && discoveredCount > 0) {
        const { successful, failed } = await this.clientManager.connectToAllDiscoveredServers();
        console.error(`Orchestrator: Connected to ${successful.length} servers, ${failed.length} failed`);
      }

      console.error("Orchestrator: Initialization complete");
    } catch (error) {
      console.error("Orchestrator: Initialization failed:", (error as Error).message);
      throw error;
    }
  }

  /**
   * Process a query with full orchestration
   */
  async processQuery(
    prompt: string,
    context: Record<string, any> = {}
  ): Promise<OrchestratorResult> {
    try {
      console.error("Orchestrator: Processing query:", prompt.substring(0, 100) + "...");

      // Step 1: Determine which tools to use
      // Use real available tools from connected MCP servers
      const availableTools = this.getAvailableTools();
      const selectedTools = await this.selectToolsForQuery(prompt, availableTools, context);

      // Step 2: Evaluate rules for tool usage
      let ruleEvaluation: RuleEvaluationResult | undefined;
      if (this.options.enableRules && selectedTools.length > 0) {
        ruleEvaluation = this.evaluateRulesForTools(selectedTools, prompt, context);
        
        if (!ruleEvaluation.shouldProceed) {
          return {
            response: "Tool usage denied by rules engine",
            toolsUsed: [],
            ruleEvaluation,
            usedLocalLLM: false,
            fallbackUsed: false,
            savedToRAG: false,
            metadata: { reason: "rules_denied" }
          };
        }
      }

      // Step 3: Execute tools and generate response
      const { response, toolsUsed } = await this.executeToolsAndGenerateResponse(
        prompt,
        selectedTools,
        context
      );

      // Step 4: Validate response
      let validationResult: ValidationResult | undefined;
      if (this.options.enableValidation) {
        validationResult = await this.validationService.validateResponse(
          prompt,
          response,
          context
        );
      }

      // Step 5: Decide on fallback
      let finalResponse = response;
      let fallbackUsed = false;
      if (validationResult?.shouldFallback && this.options.fallbackToCursor) {
        console.error("Orchestrator: Response validation failed, using fallback");
        finalResponse = await this.fallbackToCursor(prompt, context);
        fallbackUsed = true;
      }

      // Step 6: Save to RAG if needed
      let savedToRAG = false;
      if (this.options.enableRAG && this.shouldSaveToRAG(prompt, finalResponse, ruleEvaluation)) {
        try {
          await this.ragService.indexText(`Q: ${prompt}\nA: ${finalResponse}`);
          savedToRAG = true;
          console.error("Orchestrator: Response saved to RAG");
        } catch (error) {
          console.error("Orchestrator: Failed to save to RAG:", (error as Error).message);
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
          context
        }
      };

      if (validationResult) {
        result.validationResult = validationResult;
      }

      if (ruleEvaluation) {
        result.ruleEvaluation = ruleEvaluation;
      }

      return result;
    } catch (error) {
      console.error("Orchestrator: Error processing query:", (error as Error).message);
      
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
            metadata: { error: (error as Error).message, fallback: true }
          };
        } catch (fallbackError) {
          return {
            response: `Error: ${(error as Error).message}`,
            toolsUsed: [],
            usedLocalLLM: false,
            fallbackUsed: false,
            savedToRAG: false,
            metadata: { error: (error as Error).message, fallbackError: (fallbackError as Error).message }
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
   * Read orchestration rules from file
   */
  private readOrchestrationRules(): string {
    try {
      const rulesPath = join(process.cwd(), "mcp-orchestration-rules.txt");
      return readFileSync(rulesPath, "utf-8");
    } catch (error) {
      console.error("Orchestrator: Failed to read orchestration rules:", (error as Error).message);
      return "# Default orchestration rules\n- Use available tools based on prompt analysis";
    }
  }

  /**
   * Select appropriate tools for a query using orchestration rules
   */
  private async selectToolsForQuery(
    prompt: string,
    availableTools: MCPTool[],
    context: Record<string, any>
  ): Promise<MCPTool[]> {
    // Read orchestration rules
    const rules = this.readOrchestrationRules();
    
    // Use local LLM to select tools based on rules
    const selectionPrompt = `You are an MCP orchestrator. Select the appropriate tools to use based on the request and available tools.

Request: "${prompt}"

Available Tools:
${availableTools.map(t => `- ${t.name} (${t.serverName}): ${t.description}`).join('\n')}

Orchestration Rules:
${rules}

Context: ${JSON.stringify(context, null, 2)}

Select the most appropriate tools for this request. Return a JSON array of tool names to use.

Format: ["tool_name_1", "tool_name_2", ...]`;

    try {
      const response = await this.generateLocalLLMResponse(selectionPrompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const selectedToolNames = JSON.parse(jsonMatch[0]);
        return availableTools.filter(tool => selectedToolNames.includes(tool.name));
      }
    } catch (error) {
      console.error("Orchestrator: Failed to select tools using rules, using fallback:", (error as Error).message);
    }

    // Fallback to simple keyword matching
    const selectedTools: MCPTool[] = [];
    const promptLower = prompt.toLowerCase();

    for (const tool of availableTools) {
      const toolNameLower = tool.name.toLowerCase();
      const descriptionLower = tool.description.toLowerCase();

      if (
        promptLower.includes(toolNameLower) ||
        this.hasKeywordMatch(promptLower, descriptionLower) ||
        this.hasKeywordMatch(promptLower, toolNameLower)
      ) {
        selectedTools.push(tool);
      }
    }

    return selectedTools;
  }

  /**
   * Check for keyword matches between prompt and tool description
   */
  private hasKeywordMatch(prompt: string, text: string): boolean {
    const keywords = prompt.split(/\s+/).filter(word => word.length > 3);
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Get smart defaults for tool arguments based on tool name and context
   */
  private getSmartDefaults(tool: MCPTool, prompt: string, context: Record<string, any>): any {
    const toolName = tool.name.toLowerCase();
    
    // Smart defaults based on tool name patterns
    if (toolName.includes('sequential') || toolName.includes('thinking')) {
      return {
        thought: prompt,
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 3
      };
    }
    
    if (toolName.includes('create_entities') || toolName.includes('entities')) {
      return {
        entities: [{
          name: "MCP Orchestrator Project",
          entityType: "project",
          observations: [prompt]
        }]
      };
    }
    
    if (toolName.includes('resolve-library') || toolName.includes('library')) {
      return {
        libraryName: "mcp-orchestrator"
      };
    }
    
    if (toolName.includes('download') || toolName.includes('website')) {
      return {
        url: "https://example.com"
      };
    }
    
    if (toolName.includes('index') || toolName.includes('document')) {
      return {
        text_content: prompt
      };
    }
    
    if (toolName.includes('memory_bank') || toolName.includes('memory')) {
      return {
        projectName: "default",
        fileName: "analysis.md",
        content: prompt
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
    context: Record<string, any>
  ): RuleEvaluationResult {
    // Evaluate rules for each tool
    const evaluations = tools.map(tool => 
      this.rulesEngine.evaluateToolUsage(tool.name, tool.serverName, prompt, context)
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
      shouldFallbackToCursor: false
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
   * Execute tools and generate response
   */
  private async executeToolsAndGenerateResponse(
    prompt: string,
    tools: MCPTool[],
    context: Record<string, any>
  ): Promise<{ response: string; toolsUsed: string[] }> {
    const toolsUsed: string[] = [];
    let toolResults: string[] = [];

    // First, use local LLM to plan the tool execution strategy
    const planningPrompt = `You are an intelligent MCP orchestrator. Analyze this request and plan which tools to use and in what order.

Request: "${prompt}"

Available tools: ${tools.map(t => `${t.name} (${t.serverName}): ${t.description}`).join('\n')}

Context: ${JSON.stringify(context, null, 2)}

Provide a JSON plan with:
1. tools_to_use: array of tool names to call
2. execution_order: array showing the sequence
3. reasoning: why these tools are needed
4. expected_outcome: what the final result should be

Format: {"tools_to_use": [...], "execution_order": [...], "reasoning": "...", "expected_outcome": "..."}`;

    let executionPlan;
    try {
      const planResponse = await this.generateLocalLLMResponse(planningPrompt);
      
      // Try to extract JSON from the response (in case LLM adds extra text)
      const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        executionPlan = JSON.parse(jsonMatch[0]);
        console.error("Orchestrator: Local LLM execution plan:", executionPlan);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (error) {
      console.error("Orchestrator: Failed to get execution plan, using all tools:", (error as Error).message);
      executionPlan = {
        tools_to_use: tools.map(t => t.name),
        execution_order: tools.map(t => t.name),
        reasoning: "Fallback to using all available tools",
        expected_outcome: "Process request with available tools"
      };
    }

    // Execute tools based on the plan
    const toolsToExecute = tools.filter(tool => 
      executionPlan.tools_to_use.includes(tool.name)
    );

    for (const tool of toolsToExecute) {
      try {
        // Use local LLM to determine tool arguments with better context
        const toolArgsPrompt = `You are calling the tool "${tool.name}" from server "${tool.serverName}".

Original request: "${prompt}"
Tool description: "${tool.description}"
Tool input schema: ${JSON.stringify(tool.inputSchema, null, 2)}
Context: ${JSON.stringify(context, null, 2)}

Determine the appropriate arguments for this tool call. Make sure to match the required parameters from the input schema.
Return a JSON object with the arguments.

Format: {"argument_name": "value"}`;

        let toolArgs;
        try {
          const argsResponse = await this.generateLocalLLMResponse(toolArgsPrompt);
          
          // Try to extract JSON from the response
          const jsonMatch = argsResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            toolArgs = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in args response");
          }
        } catch (error) {
          console.error(`Orchestrator: Failed to determine args for ${tool.name}, using smart defaults`);
          // Use smart defaults based on tool name
          toolArgs = this.getSmartDefaults(tool, prompt, context);
        }

        // Call the real tool using the client manager
        const result = await this.clientManager.callTool(tool.serverName, tool.name, toolArgs);
        
        toolsUsed.push(tool.name);
        toolResults.push(`Tool ${tool.name}: ${JSON.stringify(result)}`);
      } catch (error) {
        console.error(`Orchestrator: Error executing tool ${tool.name}:`, (error as Error).message);
        toolResults.push(`Tool ${tool.name} failed: ${(error as Error).message}`);
      }
    }

    // Use local LLM to synthesize the final response
    const synthesisPrompt = `You are an intelligent MCP orchestrator. Synthesize a comprehensive response based on the original request and tool results.

Original Request: "${prompt}"

Tool Results:
${toolResults.join('\n')}

Execution Plan: ${JSON.stringify(executionPlan, null, 2)}

Provide a comprehensive, well-structured response that:
1. Directly addresses the original request
2. Incorporates insights from the tool results
3. Is clear and actionable
4. Maintains context and coherence

Response:`;

    const response = await this.generateLocalLLMResponse(synthesisPrompt);

    return { response, toolsUsed };
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
      
      console.error(`Orchestrator: Local LLM response generated (${response.length} chars)`);
      return response;
    } catch (error) {
      console.error("Orchestrator: Local LLM generation failed:", (error as Error).message);
      throw new Error(`Local LLM generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Fallback to cursor (placeholder implementation)
   */
  private async fallbackToCursor(prompt: string, context: Record<string, any>): Promise<string> {
    // This would integrate with Cursor's API or use a different LLM
    return `Cursor Fallback Response for: ${prompt.substring(0, 100)}...`;
  }

  /**
   * Determine if response should be saved to RAG
   */
  private shouldSaveToRAG(
    prompt: string,
    response: string,
    ruleEvaluation?: RuleEvaluationResult
  ): boolean {
    // Check rule evaluation first
    if (ruleEvaluation?.shouldSaveToRAG) {
      return true;
    }

    // Simple heuristics
    const importantKeywords = ["important", "save", "remember", "document", "note"];
    const promptLower = prompt.toLowerCase();
    const responseLower = response.toLowerCase();

    return importantKeywords.some(keyword => 
      promptLower.includes(keyword) || responseLower.includes(keyword)
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
        enabled: this.options.enableRules
      },
      validation: {
        enabled: this.options.enableValidation,
        stats: this.validationService.getValidationStats()
      }
    };
  }

  /**
   * Update orchestrator options
   */
  updateOptions(newOptions: Partial<OrchestratorOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}
