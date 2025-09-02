# Cursor Agent Guide for Local LLM Proxy MCP Server

This guide explains how the Cursor agent should properly use the local-llm-proxy MCP server with context integration.

## Available Tools

### 1. `generate_text` - Basic text generation
```json
{
  "prompt": "Your question or request",
  "context": {
    "past_chats": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
    "files": [{"path": "file/path", "content": "file content..."}],
    "memory": ["memory entry 1", "memory entry 2"],
    "context7_docs": ["doc snippet 1", "doc snippet 2"],
    "custom_context": "Additional context information"
  },
  "max_tokens": 1000,
  "temperature": 0.7
}
```

### 2. `chat_completion` - Chat-style completion
```json
{
  "messages": [
    {"role": "user", "content": "Your question"}
  ],
  "context": {
    "past_chats": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
    "files": [{"path": "file/path", "content": "file content..."}],
    "memory": ["memory entry 1", "memory entry 2"],
    "context7_docs": ["doc snippet 1", "doc snippet 2"],
    "custom_context": "Additional context information"
  },
  "max_tokens": 1000,
  "temperature": 0.7
}
```

### 3. `generate_with_context` - Automatic context gathering
```json
{
  "prompt": "Your question or request",
  "context_sources": ["memory", "context7", "files", "chat_history"],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

## How to Gather Context

### From Memory MCP Server
```javascript
// Use memory MCP to get relevant memories
const memories = await mcp_memory_search_nodes({query: "relevant search terms"});
const context = {
  memory: memories.map(m => m.observations).flat()
};
```

### From Context7 MCP Server
```javascript
// Use context7 MCP to get documentation
const docs = await mcp_context7_get-library-docs({
  context7CompatibleLibraryID: "/library/name",
  topic: "relevant topic"
});
const context = {
  context7_docs: [docs]
};
```

### From Files
```javascript
// Read relevant files
const files = [
  {path: "src/main.js", content: await read_file("src/main.js")},
  {path: "package.json", content: await read_file("package.json")}
];
const context = {
  files: files
};
```

### From Chat History
```javascript
// Include recent conversation context
const context = {
  past_chats: [
    {role: "user", content: "Previous user message"},
    {role: "assistant", content: "Previous assistant response"}
  ]
};
```

## Best Practices

### 1. Always Use Context When Available
- Gather relevant context from available MCP servers
- Include file contents when discussing code
- Use memory for persistent information
- Include documentation when explaining concepts

### 2. Context Structure
- `past_chats`: Array of {role, content} objects
- `files`: Array of {path, content} objects
- `memory`: Array of memory strings
- `context7_docs`: Array of documentation strings
- `custom_context`: Single string with additional info

### 3. Context Gathering Strategy
1. **For code questions**: Include relevant files + memory + docs
2. **For general questions**: Use memory + context7 docs
3. **For follow-up questions**: Include past_chats + memory
4. **For project-specific questions**: Include files + memory + custom_context

### 4. Example Context Gathering Function
```javascript
async function gatherContextForPrompt(prompt, availableServers) {
  const context = {
    past_chats: [],
    files: [],
    memory: [],
    context7_docs: [],
    custom_context: ''
  };

  // Gather from memory if available
  if (availableServers.includes('memory')) {
    try {
      const memories = await mcp_memory_search_nodes({query: prompt});
      context.memory = memories.map(m => m.observations).flat();
    } catch (e) { console.log('Memory not available'); }
  }

  // Gather from context7 if available
  if (availableServers.includes('context7')) {
    try {
      const docs = await mcp_context7_get-library-docs({
        context7CompatibleLibraryID: "/relevant/library",
        topic: "relevant topic"
      });
      context.context7_docs = [docs];
    } catch (e) { console.log('Context7 not available'); }
  }

  // Gather relevant files
  if (prompt.includes('code') || prompt.includes('file')) {
    try {
      const relevantFiles = await findRelevantFiles(prompt);
      context.files = await Promise.all(relevantFiles.map(async (file) => ({
        path: file,
        content: await read_file(file)
      })));
    } catch (e) { console.log('Files not available'); }
  }

  return context;
}
```

## Common Mistakes to Avoid

1. **Don't use `context_sources` with `generate_text`** - Use `generate_with_context` instead
2. **Don't pass empty context objects** - Only include context if you have actual data
3. **Don't forget to structure context properly** - Follow the exact schema
4. **Don't ignore available MCP servers** - Always check what's available and use them

## Example Usage

```javascript
// Good: Using generate_with_context for automatic gathering
const result = await mcp_local-llm-proxy_generate_with_context({
  prompt: "How do I implement authentication in this React app?",
  context_sources: ["memory", "context7", "files"],
  max_tokens: 1000
});

// Good: Using generate_text with manually gathered context
const context = await gatherContextForPrompt(prompt, availableServers);
const result = await mcp_local-llm-proxy_generate_text({
  prompt: "How do I implement authentication in this React app?",
  context: context,
  max_tokens: 1000
});

// Bad: Using context_sources with generate_text
const result = await mcp_local-llm-proxy_generate_text({
  prompt: "How do I implement authentication?",
  context_sources: ["memory", "context7"] // ❌ Wrong tool for this
});
```
