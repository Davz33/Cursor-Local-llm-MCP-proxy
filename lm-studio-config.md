# LM Studio Configuration for Enhanced MCP Server

## Setup Instructions

### 1. Install and Start LM Studio
1. Download LM Studio from [https://lmstudio.ai/](https://lmstudio.ai/)
2. Install and launch LM Studio
3. Download the Quen3 model (or your preferred model)

### 2. Start LM Studio Server
1. In LM Studio, go to the "Server" tab
2. Select your Quen3 model
3. Click "Start Server"
4. Note the server URL (default: `http://localhost:1234/v1`)

### 3. Configure Environment Variables (Optional)
```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"
export LM_STUDIO_MODEL="qwen3"
```

### 4. Test the Connection
```bash
curl -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3",
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "max_tokens": 100
  }'
```

## Enhanced MCP Server Features

### 🧠 Agentic Capabilities
- **Math Tool**: Performs basic mathematical operations
- **Weather Tool**: Provides mock weather information
- **File System Tool**: Read, write, and list files
- **RAG System**: Document indexing and querying

### 🔍 RAG (Retrieval-Augmented Generation)
- Index documents from files or direct text
- Query indexed documents with natural language
- Source attribution for responses
- Persistent document storage

### 🚀 Streaming Support
- Real-time response streaming
- Event-driven architecture
- Progress tracking

### 🛠 Available MCP Tools
1. `generate_text` - Generate text with agentic capabilities
2. `chat_completion` - Chat completion with tools
3. `rag_query` - Query indexed documents
4. `index_document` - Index documents for RAG

## Usage Examples

### Basic Text Generation
```json
{
  "name": "generate_text",
  "arguments": {
    "prompt": "Explain quantum computing in simple terms",
    "use_agentic": true,
    "max_tokens": 500
  }
}
```

### RAG Document Indexing
```json
{
  "name": "index_document",
  "arguments": {
    "file_path": "/path/to/document.txt"
  }
}
```

### RAG Query
```json
{
  "name": "rag_query",
  "arguments": {
    "query": "What are the main concepts discussed?",
    "max_tokens": 300
  }
}
```

## Troubleshooting

### Common Issues
1. **Connection Refused**: Ensure LM Studio server is running
2. **Model Not Found**: Verify model name in LM Studio
3. **Port Conflicts**: Change LM Studio port if needed
4. **Memory Issues**: Reduce model size or increase system memory

### Debug Mode
Run with debug logging:
```bash
DEBUG=* npm start
```

## Performance Tips
- Use quantized models for better performance
- Adjust `max_tokens` based on your needs
- Enable streaming for long responses
- Use RAG for document-heavy queries
