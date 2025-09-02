# Local LLM Proxy MCP Server

This MCP server implements speculative decoding with your local LLM, trying the local model first and falling back to other models when needed.

## Features

- **Speculative Decoding**: Tries local LLM first at `http://127.0.0.1:1234`
- **Response Validation**: Validates local LLM responses for quality
- **LLM-Based Validation**: Uses the local LLM itself to assess response quality
- **Response Refinement**: Automatically refines responses based on validation feedback
- **Context Integration**: Leverages past chats, files, memory, and documentation for enhanced responses
- **Automatic Context Gathering**: Can automatically gather context from available MCP servers
- **Automatic Fallback**: Falls back to Cursor agent when local response is inadequate
- **OpenAI-Compatible**: Works with standard OpenAI API endpoints

## Local LLM Endpoints

The server expects your local LLM to expose these endpoints:

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completions
- `POST /v1/completions` - Text completions  
- `POST /v1/embeddings` - Text embeddings

## Available Tools

### `generate_text`
Generate text using local LLM with fallback to other models.

**Parameters:**
- `prompt` (string, required): The text prompt to generate from
- `context` (object, optional): Context information to enhance the response
  - `past_chats` (array): Previous chat messages for context
  - `files` (array): Relevant file contents with path and content
  - `memory` (array): Relevant memory entries
  - `context7_docs` (array): Context7 documentation snippets
  - `custom_context` (string): Any additional context information
- `max_tokens` (number, optional): Maximum tokens to generate (default: 1000)
- `temperature` (number, optional): Temperature for generation (default: 0.7)
- `use_local_first` (boolean, optional): Try local LLM first (default: true)

### `chat_completion`
Chat completion using local LLM with fallback.

**Parameters:**
- `messages` (array, required): Array of chat messages
- `context` (object, optional): Context information to enhance the response (same structure as above)
- `max_tokens` (number, optional): Maximum tokens to generate (default: 1000)
- `temperature` (number, optional): Temperature for generation (default: 0.7)

### `generate_with_context`
Generate text with automatic context gathering from available MCP servers.

**Parameters:**
- `prompt` (string, required): The text prompt to generate from
- `context_sources` (array, optional): Available MCP servers to gather context from
  - Options: `['memory', 'context7', 'files', 'chat_history']`
  - Default: `['memory', 'context7']`
- `max_tokens` (number, optional): Maximum tokens to generate (default: 1000)
- `temperature` (number, optional): Temperature for generation (default: 0.7)

## Response Validation

The server validates local LLM responses using a two-tier approach:

### Basic Validation
1. **Non-empty response**: Response must not be empty
2. **Minimum length**: Response must be at least 10 characters
3. **Error detection**: Checks for common error indicators

### LLM-Based Validation (Optional)
When enabled, uses the local LLM itself to assess:
1. **Relevance**: Does the response address the user's prompt?
2. **Completeness**: Is the response complete and informative?
3. **Accuracy**: Does the response appear factually correct?
4. **Clarity**: Is the response clear and well-structured?
5. **Helpfulness**: Would this response be helpful to the user?

### Response Refinement
If validation fails, the server can automatically refine the response by:
1. Using validation feedback to generate improvement suggestions
2. Asking the local LLM to improve the response based on feedback
3. Re-validating the refined response

## Context Integration

The server can leverage various sources of context to provide more accurate and relevant responses:

### Context Sources
- **Past Chats**: Previous conversation history for continuity
- **Files**: Relevant file contents from the current project
- **Memory**: Persistent memory entries from the memory MCP server
- **Context7 Docs**: Documentation snippets from the Context7 MCP server
- **Custom Context**: Any additional context information

### Context Processing
- Context is automatically formatted and integrated into prompts
- For text generation: Context is appended to the prompt
- For chat completion: Context is added as system message or appended to user message
- Context is also used during response refinement for better improvements

### Automatic Context Gathering
The `generate_with_context` tool can automatically gather context from available MCP servers:
- Memory MCP: Retrieves relevant memories
- Context7 MCP: Gets relevant documentation
- File system: Accesses relevant files
- Chat history: Includes recent conversations

## Fallback Behavior

When the local LLM fails or produces inadequate responses, the server:

1. Logs the failure reason
2. Returns a special fallback indicator to Cursor
3. Cursor agent handles the request using its standard capabilities
4. Returns metadata indicating the fallback was used

## Installation

1. Install dependencies:
```bash
cd /Users/dav/coding/tools/mcp_servers/local-llm-proxy
npm install
```

2. The server is already configured in your `mcp.json` file

## Usage

The server will automatically be available in Cursor when you restart the MCP connection. You can use it by calling the available tools through the MCP interface.

## Configuration

The server can be configured through environment variables:

### Basic Configuration
- `LOCAL_LLM_URL`: URL of your local LLM (default: http://127.0.0.1:1234)

### LLM Validation Configuration
- `LLM_VALIDATION_ENABLED`: Enable LLM-based validation (default: false)
- `USE_LOCAL_VALIDATOR`: Use local LLM for validation (default: true)
- `MAX_REFINEMENT_RETRIES`: Maximum number of refinement attempts (default: 2)

### Example Configuration
```bash
# Basic mode (no validation)
LLM_VALIDATION_ENABLED=false

# With local LLM validation
LLM_VALIDATION_ENABLED=true
USE_LOCAL_VALIDATOR=true
```

**Note**: No external API keys are needed! The fallback is handled by the Cursor agent itself.

## Extending the Server

To add more sophisticated validation or fallback models:

1. Modify the `validateResponse()` method for better quality assessment
2. Update the `tryFallbackModels()` method to integrate with actual LLM providers
3. Add more tools by extending the `ListToolsRequestSchema` handler

## Troubleshooting

- Ensure your local LLM is running on port 1234
- Check that the local LLM exposes the required endpoints
- Verify the MCP server has network access to your local LLM
- Check the console logs for detailed error messages