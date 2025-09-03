# Cursor Rules for Local LLM Proxy MCP Server

Add these rules to your Cursor user rules to ensure proper usage of the local-llm-proxy MCP server:

## Rule 1: Always Gather Context Before Using Local LLM

When using the local-llm-proxy MCP server, ALWAYS gather relevant context first:

```markdown
- When using local-llm-proxy MCP server, always gather context from available MCP servers before calling the tools
- Use memory MCP to search for relevant memories: `mcp_memory_search_nodes({query: "search terms"})`
- Use context7 MCP to get documentation: `mcp_context7_get-library-docs({context7CompatibleLibraryID: "/library", topic: "topic"})`
- Read relevant files when discussing code: `read_file("path/to/file")`
- Structure context properly with past_chats, files, memory, context7_docs, and custom_context
```

## Rule 2: Use the Correct Tool for Context

```markdown
- Use `generate_with_context` for automatic context gathering with context_sources parameter
- Use `generate_text` or `chat_completion` when you have manually gathered context
- NEVER use context_sources parameter with generate_text or chat_completion tools
- ALWAYS use the context parameter with manually gathered context data
```

## Rule 3: Context Structure Requirements

```markdown
- Context must be structured as: {past_chats: [], files: [], memory: [], context7_docs: [], custom_context: ""}
- past_chats: Array of {role: "user|assistant", content: "message"} objects
- files: Array of {path: "file/path", content: "file content"} objects  
- memory: Array of memory strings
- context7_docs: Array of documentation strings
- custom_context: Single string with additional context
```

## Rule 4: Context Gathering Strategy

```markdown
- For code questions: Include relevant files + memory + context7 docs
- For general questions: Use memory + context7 docs
- For follow-up questions: Include past_chats + memory
- For project-specific questions: Include files + memory + custom_context
- Always check what MCP servers are available before gathering context
```

## Rule 5: Error Handling

```markdown
- If context gathering fails, fall back to basic generation without context
- If local LLM fails, the server will automatically fall back to Cursor agent
- Always handle MCP server errors gracefully
- Log context gathering attempts for debugging
```

## Example Implementation

```markdown
Before calling local-llm-proxy, implement this pattern:

1. Gather context from available MCP servers
2. Structure context according to schema
3. Use appropriate tool (generate_with_context vs generate_text)
4. Handle errors gracefully
5. Fall back to basic generation if needed

Example:
```javascript
// Gather context
const memories = await mcp_memory_search_nodes({query: prompt});
const docs = await mcp_context7_get-library-docs({...});
const files = await read_file("relevant/file.js");

// Structure context
const context = {
  past_chats: recentChats,
  files: [{path: "file.js", content: files}],
  memory: memories.map(m => m.observations).flat(),
  context7_docs: [docs],
  custom_context: "Additional project context"
};

// Use appropriate tool
const result = await mcp_local-llm-proxy_generate_text({
  prompt: prompt,
  context: context,
  max_tokens: 1000
});
```

