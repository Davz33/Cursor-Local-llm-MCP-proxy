import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { MCPTool } from "./mcp-client-manager.js";

export interface MCPRule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  enabled: boolean;
}

export interface RuleCondition {
  type: "tool_name" | "server_name" | "prompt_contains" | "prompt_regex" | "context_has" | "always";
  value: string;
  operator?: "equals" | "contains" | "starts_with" | "ends_with" | "regex";
}

export interface RuleAction {
  type: "allow_tool" | "deny_tool" | "require_approval" | "log_usage" | "save_to_rag" | "validate_response" | "fallback_to_cursor";
  value?: string;
  parameters?: Record<string, any>;
}

export interface MCPRulesConfig {
  version: string;
  rules: MCPRule[];
  defaultActions: {
    onToolUse: RuleAction[];
    onResponse: RuleAction[];
    onError: RuleAction[];
  };
}

export interface RuleEvaluationResult {
  matchedRules: MCPRule[];
  allowedActions: RuleAction[];
  deniedActions: RuleAction[];
  shouldProceed: boolean;
  requiresApproval: boolean;
  shouldSaveToRAG: boolean;
  shouldValidateResponse: boolean;
  shouldFallbackToCursor: boolean;
}

/**
 * Rules Engine for managing MCP tool usage policies
 */
export class RulesEngine {
  private configPath: string;
  private config: MCPRulesConfig | null = null;
  private defaultConfig: MCPRulesConfig;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), "mcp-orchestrator-rules.json");
    this.defaultConfig = this.createDefaultConfig();
  }

  /**
   * Load rules configuration from file
   */
  async loadRules(): Promise<void> {
    try {
      const configContent = await readFile(this.configPath, "utf-8");
      this.config = JSON.parse(configContent);
      console.error("Rules Engine: Loaded rules configuration");
    } catch (error) {
      console.error("Rules Engine: Failed to load rules, using default:", (error as Error).message);
      this.config = this.defaultConfig;
      await this.saveRules(); // Save default config
    }
  }

  /**
   * Save rules configuration to file
   */
  async saveRules(): Promise<void> {
    if (!this.config) {
      this.config = this.defaultConfig;
    }

    try {
      await writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      console.error("Rules Engine: Saved rules configuration");
    } catch (error) {
      console.error("Rules Engine: Failed to save rules:", (error as Error).message);
    }
  }

  /**
   * Evaluate rules for tool usage
   */
  evaluateToolUsage(
    toolName: string,
    serverName: string,
    prompt: string,
    context: Record<string, any> = {}
  ): RuleEvaluationResult {
    if (!this.config) {
      return this.createDefaultResult();
    }

    const matchedRules: MCPRule[] = [];
    const allowedActions: RuleAction[] = [];
    const deniedActions: RuleAction[] = [];

    // Evaluate each rule
    for (const rule of this.config.rules) {
      if (!rule.enabled) continue;

      if (this.evaluateRuleConditions(rule, toolName, serverName, prompt, context)) {
        matchedRules.push(rule);
        
        // Process rule actions
        for (const action of rule.actions) {
          if (action.type === "allow_tool") {
            allowedActions.push(action);
          } else if (action.type === "deny_tool") {
            deniedActions.push(action);
          } else {
            allowedActions.push(action);
          }
        }
      }
    }

    // Sort by priority (higher priority first)
    matchedRules.sort((a, b) => b.priority - a.priority);

    // Determine final actions
    const shouldProceed = deniedActions.length === 0 || allowedActions.some(a => a.type === "allow_tool");
    const requiresApproval = allowedActions.some(a => a.type === "require_approval");
    const shouldSaveToRAG = allowedActions.some(a => a.type === "save_to_rag");
    const shouldValidateResponse = allowedActions.some(a => a.type === "validate_response");
    const shouldFallbackToCursor = allowedActions.some(a => a.type === "fallback_to_cursor");

    return {
      matchedRules,
      allowedActions,
      deniedActions,
      shouldProceed,
      requiresApproval,
      shouldSaveToRAG,
      shouldValidateResponse,
      shouldFallbackToCursor
    };
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateRuleConditions(
    rule: MCPRule,
    toolName: string,
    serverName: string,
    prompt: string,
    context: Record<string, any>
  ): boolean {
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, toolName, serverName, prompt, context)) {
        return false; // All conditions must be true
      }
    }
    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: RuleCondition,
    toolName: string,
    serverName: string,
    prompt: string,
    context: Record<string, any>
  ): boolean {
    const operator = condition.operator || "equals";

    switch (condition.type) {
      case "tool_name":
        return this.compareValues(toolName, condition.value, operator);
      
      case "server_name":
        return this.compareValues(serverName, condition.value, operator);
      
      case "prompt_contains":
        return this.compareValues(prompt, condition.value, operator);
      
      case "prompt_regex":
        try {
          const regex = new RegExp(condition.value, "i");
          return regex.test(prompt);
        } catch {
          return false;
        }
      
      case "context_has":
        return context.hasOwnProperty(condition.value);
      
      case "always":
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: string, expected: string, operator: string): boolean {
    switch (operator) {
      case "equals":
        return actual === expected;
      case "contains":
        return actual.toLowerCase().includes(expected.toLowerCase());
      case "starts_with":
        return actual.toLowerCase().startsWith(expected.toLowerCase());
      case "ends_with":
        return actual.toLowerCase().endsWith(expected.toLowerCase());
      case "regex":
        try {
          const regex = new RegExp(expected, "i");
          return regex.test(actual);
        } catch {
          return false;
        }
      default:
        return actual === expected;
    }
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): MCPRulesConfig {
    return {
      version: "1.0.0",
      rules: [
        {
          id: "default-allow-all",
          name: "Allow All Tools",
          description: "Default rule to allow all tool usage",
          conditions: [{ type: "always", value: "true" }],
          actions: [
            { type: "allow_tool" },
            { type: "log_usage" },
            { type: "validate_response" }
          ],
          priority: 1,
          enabled: true
        },
        {
          id: "save-important-to-rag",
          name: "Save Important Information to RAG",
          description: "Save responses containing important information to RAG",
          conditions: [
            { type: "prompt_contains", value: "important", operator: "contains" },
            { type: "prompt_contains", value: "save", operator: "contains" }
          ],
          actions: [
            { type: "save_to_rag" },
            { type: "log_usage" }
          ],
          priority: 5,
          enabled: true
        },
        {
          id: "fallback-on-error",
          name: "Fallback to Cursor on Error",
          description: "Fallback to Cursor when local LLM fails",
          conditions: [
            { type: "context_has", value: "error" }
          ],
          actions: [
            { type: "fallback_to_cursor" },
            { type: "log_usage" }
          ],
          priority: 10,
          enabled: true
        }
      ],
      defaultActions: {
        onToolUse: [
          { type: "log_usage" }
        ],
        onResponse: [
          { type: "validate_response" }
        ],
        onError: [
          { type: "fallback_to_cursor" }
        ]
      }
    };
  }

  /**
   * Create default evaluation result
   */
  private createDefaultResult(): RuleEvaluationResult {
    return {
      matchedRules: [],
      allowedActions: [],
      deniedActions: [],
      shouldProceed: true,
      requiresApproval: false,
      shouldSaveToRAG: false,
      shouldValidateResponse: true,
      shouldFallbackToCursor: false
    };
  }

  /**
   * Add a new rule
   */
  addRule(rule: MCPRule): void {
    if (!this.config) {
      this.config = this.defaultConfig;
    }
    this.config.rules.push(rule);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    if (!this.config) return false;
    
    const index = this.config.rules.findIndex(rule => rule.id === ruleId);
    if (index !== -1) {
      this.config.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getAllRules(): MCPRule[] {
    return this.config?.rules || [];
  }

  /**
   * Get rule by ID
   */
  getRuleById(ruleId: string): MCPRule | undefined {
    return this.config?.rules.find(rule => rule.id === ruleId);
  }

  /**
   * Update a rule
   */
  updateRule(ruleId: string, updatedRule: Partial<MCPRule>): boolean {
    if (!this.config) return false;
    
    const index = this.config.rules.findIndex(rule => rule.id === ruleId);
    if (index !== -1) {
      const existingRule = this.config.rules[index];
      if (existingRule) {
        this.config.rules[index] = { 
          id: ruleId,
          name: existingRule.name,
          description: existingRule.description,
          conditions: existingRule.conditions,
          actions: existingRule.actions,
          priority: existingRule.priority,
          enabled: existingRule.enabled,
          ...updatedRule
        };
        return true;
      }
    }
    return false;
  }
}
