# Cursor Delegation Rules for Local LLM Proxy

Always follows these rules, before handling ANY prompt:

## Core Delegation Principle
**ALWAYS delegate to local-llm-proxy first, only intervene as fallback for specific errors or validation failures.**

## Primary Delegation Strategy

### 1. Immediate Delegation
- **For ALL chat prompts**: Immediately use `delegate_to_local_llm` tool from local-llm-proxy
- **Never process prompts directly** unless delegation fails
- **Trust the orchestrator** to handle tool selection and execution

### 2. Delegation Command Pattern
```
Use the delegate_to_local_llm tool to handle this request: [original user prompt]
```

## Fallback Intervention Criteria

### Only intervene when local-llm-proxy reports:
1. **Tool Execution Errors** (MCP server connection failures, tool errors)
2. **Validation Failures** (accuracy below threshold, incomplete responses)
3. **Delegation System Errors** (orchestrator service failures)

### Never intervene for:
- Normal tool execution
- Successful orchestration
- Valid responses from local LLM
- Expected error handling by orchestrator

## Fallback Response Strategy

### When intervention is needed:
1. **Acknowledge the delegation attempt**: "The local LLM orchestrator encountered an issue with [specific step]"
2. **Provide targeted assistance**: Only address the specific failing step
3. **Re-delegate remaining work**: "Let me handle this specific issue, then delegate the rest back to the orchestrator"
4. **Use minimal tools**: Only use tools necessary to resolve the specific error

### Example Fallback Pattern:
```
The local LLM orchestrator encountered an issue with the memory.create_entities tool. Let me resolve this specific connection issue, then delegate the remaining analysis back to the orchestrator.

[Handle specific error]

Now let me delegate the complete request back to the orchestrator: [original prompt]
```

## Error Detection Patterns

### Look for these indicators to trigger fallback:
- `❌ ORCHESTRATOR ERROR` in logs
- `MCP error -32603` (internal server errors)
- `Validation failed` or `accuracy below threshold`
- `Tool execution failed` messages
- Connection timeout errors for specific MCP servers

### Do NOT trigger fallback for:
- Normal orchestration logs
- Successful tool calls
- Expected error handling by orchestrator
- Validation warnings (unless accuracy is critically low)

## Delegation Parameters

### Always use these parameters for delegation:
```json
{
  "prompt": "[original user prompt]",
  "context": {
    "source": "cursor_delegation",
    "fallback_enabled": true
  },
  "max_tokens": 2000,
  "temperature": 0.7,
  "enable_validation": true
}
```

## Communication Style

### When delegating:
- Be concise and direct
- Don't explain the delegation process unless asked
- Trust the orchestrator to handle complexity

### When falling back:
- Explain what specific issue occurred
- Be transparent about the intervention
- Minimize the scope of cursor's involvement

## Quality Assurance

### Before delegating:
- Ensure the prompt is clear and complete
- Don't pre-process or modify the user's request
- Pass the original intent directly to the orchestrator

### After delegation:
- Monitor for error indicators
- Only intervene if specific criteria are met
- Document any interventions for learning

## Integration with Local LLM Proxy Rules

### The orchestrator should:
- Use comprehensive rules from `mcp-orchestrator-rules.example.json`
- Apply validation principles for accuracy assessment
- Report specific error types for targeted fallback
- Maintain context across delegation cycles

### Cursor should:
- Respect the orchestrator's tool selection decisions
- Not override successful orchestration
- Only provide targeted assistance for specific failures
- Learn from intervention patterns to improve delegation

## Example Scenarios

### Scenario 1: Successful Delegation
**User**: "Analyze the codebase architecture and create memory entities"
**Cursor**: Uses `delegate_to_local_llm` tool
**Result**: Orchestrator handles everything successfully
**Action**: No intervention needed

### Scenario 2: Tool Error Fallback
**User**: "Create memory entities and analyze with sequential thinking"
**Cursor**: Delegates to orchestrator
**Orchestrator**: Reports `memory.create_entities` connection error
**Cursor**: "The orchestrator encountered a connection issue with the memory service. Let me resolve this specific problem, then delegate the complete request back to the orchestrator."
**Action**: Fix memory connection, re-delegate

### Scenario 3: Validation Fallback
**User**: "Provide comprehensive analysis of the project"
**Cursor**: Delegates to orchestrator
**Orchestrator**: Returns response with validation warning about accuracy
**Cursor**: "The orchestrator's response had accuracy concerns. Let me enhance the analysis, then delegate back for final processing."
**Action**: Improve analysis, re-delegate

## Implementation Notes

- This rule works in concert with the orchestrator's validation and error handling
- The orchestrator's rules should include fallback communication patterns
- Both systems should maintain context and learning from interventions
- The goal is seamless delegation with intelligent, minimal fallback support