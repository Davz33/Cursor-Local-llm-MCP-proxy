# MCP Orchestrator Feature

The MCP Orchestrator is a powerful feature that allows the local-llm-proxy to act as a coordinator for other MCP servers, providing intelligent tool orchestration, rules-based usage policies, and automatic fallback mechanisms.

## Features

### 🔍 MCP Discovery
- Automatically discovers MCP servers from Cursor's `mcp.json` configuration
- Supports multiple configuration file locations
- Provides detailed discovery status and error reporting

### 🔗 MCP Client Management
- Connects to other MCP servers as a client
- Manages tool availability and execution
- Handles connection failures gracefully
- Provides real-time connection status

### 📋 Rules Engine
- Configurable rules for tool usage policies
- Support for complex conditions and actions
- Priority-based rule evaluation
- Built-in safety and approval mechanisms

### ✅ Response Validation
- Multi-dimensional response validation (coherence, accuracy, completeness, safety)
- Confidence scoring for response quality
- Automatic fallback to Cursor when validation fails
- Configurable validation thresholds

### 🧠 Intelligent RAG Integration
- Automatic evaluation of whether to save responses to RAG
- Rules-based RAG storage decisions
- Context-aware information persistence

## Configuration

### Environment Variables

```bash
# Enable MCP Orchestrator
ENABLE_MCP_ORCHESTRATOR=true

# Optional: Custom cursor config path
CURSOR_CONFIG_PATH=/path/to/cursor/mcp.json

# Optional: Custom rules file path
MCP_RULES_PATH=/path/to/mcp-orchestrator-rules.json
```

### Rules Configuration

The orchestrator uses a JSON configuration file (`mcp-orchestrator-rules.json`) to define usage policies:

```json
{
  "version": "1.0.0",
  "rules": [
    {
      "id": "save-important-to-rag",
      "name": "Save Important Information to RAG",
      "description": "Save responses containing important information to RAG",
      "conditions": [
        {
          "type": "prompt_contains",
          "value": "important",
          "operator": "contains"
        }
      ],
      "actions": [
        {
          "type": "save_to_rag"
        },
        {
          "type": "log_usage"
        }
      ],
      "priority": 5,
      "enabled": true
    }
  ]
}
```

### Rule Conditions

- `tool_name`: Match tool name
- `server_name`: Match MCP server name
- `prompt_contains`: Check if prompt contains text
- `prompt_regex`: Match prompt with regex
- `context_has`: Check if context has property
- `always`: Always match

### Rule Actions

- `allow_tool`: Allow tool usage
- `deny_tool`: Deny tool usage
- `require_approval`: Require manual approval
- `log_usage`: Log tool usage
- `save_to_rag`: Save response to RAG
- `validate_response`: Validate response quality
- `fallback_to_cursor`: Fallback to Cursor on error

## Usage

### Basic Usage

```typescript
// Enable orchestrator in agentic service
const result = await agenticService.runAgenticQuery(prompt, {
  useOrchestrator: true,
  orchestratorOptions: {
    enableValidation: true,
    enableRules: true,
    enableRAG: true,
    fallbackToCursor: true
  }
});
```

### MCP Server Tools

The orchestrator exposes several new tools:

1. **orchestrator_status**: Get status of orchestrator and connected servers
2. **discover_mcp_servers**: Discover and connect to MCP servers
3. **list_orchestrated_tools**: List all available orchestrated tools

### Example MCP.json Configuration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {}
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {}
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Server    │    │   Orchestrator   │    │  Other MCPs     │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ Agentic     │ │◄──►│ │ Discovery    │ │◄──►│ │ Filesystem  │ │
│ │ Service     │ │    │ │ Service      │ │    │ │ Server      │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ RAG Service │ │◄──►│ │ Client       │ │◄──►│ │ Memory      │ │
│ │             │ │    │ │ Manager      │ │    │ │ Server      │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│                 │    │                  │    │                 │
└─────────────────┘    │ ┌──────────────┐ │    │ ┌─────────────┐ │
                       │ │ Rules        │ │◄──►│ │ Search      │ │
                       │ │ Engine       │ │    │ │ Server      │ │
                       │ └──────────────┘ │    │ └─────────────┘ │
                       │                  │    │                 │
                       │ ┌──────────────┐ │    └─────────────────┘
                       │ │ Validation   │ │
                       │ │ Service      │ │
                       │ └──────────────┘ │
                       └──────────────────┘
```

## Tool Calling Behavior

### Multi-Turn Tool Calling Pattern

The orchestrator implements a sophisticated multi-turn tool calling pattern that follows LM Studio's recommended approach:

1. **Tool Selection Phase**: The orchestrator analyzes the query and selects appropriate tools based on:
   - Keyword matching
   - Context analysis
   - Rules engine evaluation
   - Tool availability

2. **LLM Tool Calling Phase**: The LLM receives the selected tools and may:
   - Make actual tool calls through the API
   - Use a multi-turn conversation pattern
   - Follow the "default tool use" format for complex scenarios

3. **Tool Execution Phase**: Selected tools are executed and results are incorporated

### Tool Call Reporting

The system provides clear visibility into tool usage:

```
--- Local LLM Delegation Info ---
Tools Used: sequentialthinking
Used Local LLM: true
Fallback Used: false
Saved to RAG: true
Tools Selected by Orchestrator: resolve-library-id, sequentialthinking
Tools Actually Called: sequentialthinking
Validation Applied: Yes
Rules Applied: Yes
```

**Key Metrics:**
- **Tools Used**: Tools actually executed by the system
- **Tools Selected by Orchestrator**: Tools chosen based on query analysis
- **Tools Actually Called**: Tools the LLM decided to use (may differ from selected)

### Common Tool Calling Patterns

#### Sequential Thinking Tool
When complex analysis is needed, the system:
1. Selects the `sequentialthinking` tool
2. LLM makes actual tool calls with structured arguments
3. Results are incorporated into the final response

#### Multi-Tool Scenarios
For complex queries requiring multiple tools:
1. Orchestrator selects relevant tools
2. LLM may use them in sequence or parallel
3. Results are synthesized into a coherent response

### Troubleshooting Tool Calls

If tools aren't being called as expected:

1. **Check System Prompt**: Ensure the LLM understands tool calling format
2. **Verify Tool Selection**: Review orchestrator logs for tool selection logic
3. **Examine LLM Response**: Look for inline tool simulation vs actual API calls
4. **Review Multi-Turn Flow**: Complex tools may require multiple conversation turns

## Benefits

1. **Unified Tool Access**: Access all MCP tools through a single interface
2. **Intelligent Orchestration**: Automatic tool selection based on context
3. **Safety & Compliance**: Rules-based usage policies and validation
4. **Fallback Reliability**: Automatic fallback to Cursor when needed
5. **Persistent Learning**: Smart RAG integration for knowledge retention
6. **Easy Configuration**: Simple JSON-based configuration

## Development

### Building

```bash
npm run build
```

### Running with Orchestrator

```bash
ENABLE_MCP_ORCHESTRATOR=true npm run dev
```

### Testing

```bash
# Test orchestrator status
npm run test:orchestrator

# Test MCP discovery
npm run test:discovery
```

## Troubleshooting

### Common Issues

1. **Orchestrator not enabled**: Set `ENABLE_MCP_ORCHESTRATOR=true`
2. **MCP servers not discovered**: Check `mcp.json` file location and format
3. **Connection failures**: Verify MCP server commands and environment variables
4. **Rules not applied**: Check rules file syntax and priority settings

### Debug Mode

```bash
DEBUG=mcp-orchestrator:* npm run dev
```

## Future Enhancements

- [ ] Web UI for rules management
- [ ] Advanced tool selection algorithms
- [ ] Performance metrics and analytics
- [ ] Plugin system for custom validators
- [ ] Distributed orchestration support
- [ ] Real-time monitoring dashboard
