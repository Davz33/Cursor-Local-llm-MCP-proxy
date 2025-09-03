# Enhanced Local LLM Proxy MCP Server with LlamaIndex.TS

A powerful MCP (Model Context Protocol) server that enhances local LLM capabilities with agentic behavior, RAG (Retrieval-Augmented Generation), and tool integration using LlamaIndex.TS.

## 🚀 Features

### 🧠 Agentic Capabilities
- **Math Tool**: Performs basic mathematical operations (add, subtract, multiply, divide)
- **Weather Tool**: Provides mock weather information for cities
- **File System Tool**: Read, write, and list files and directories
- **RAG System**: Document indexing and querying with natural language

### 🔍 RAG (Retrieval-Augmented Generation)
- Index documents from files or direct text input
- Query indexed documents with natural language
- Source attribution for responses
- Persistent document storage during session

### 🛠 Available MCP Tools
1. `generate_text` - Generate text with agentic capabilities
2. `chat_completion` - Chat completion with tool integration
3. `rag_query` - Query indexed documents using RAG
4. `index_document` - Index documents for RAG queries

### 🌐 LM Studio Integration
- OpenAI-compatible API integration
- Support for Quen3 and other local models
- Configurable base URL and model selection
- Environment variable configuration

## 📦 Installation

```bash
npm install
```

## 🚀 Usage

### 1. Start LM Studio
1. Download and install [LM Studio](https://lmstudio.ai/)
2. Load your preferred model (e.g., Qwen3, Llama, etc.)
3. Start the server on `http://localhost:1234/v1`

### 2. Configure Environment (Optional)
```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"
export LM_STUDIO_MODEL="qwen3-coder-30b-a3b-instruct"
```

### 3. Start the MCP Server

**Production:**
```bash
npm start
```

**Development (with hot reload):**
```bash
npm run dev
```

## 🔧 Configuration

The server can be configured using environment variables:

- `LM_STUDIO_BASE_URL`: LM Studio API endpoint (default: `http://localhost:1234/v1`)
- `LM_STUDIO_MODEL`: Model name in LM Studio (default: `qwen3`)

## 📋 API Examples

### Basic Text Generation
```json
{
  "name": "generate_text",
  "arguments": {
    "prompt": "Explain quantum computing in simple terms",
    "use_agentic": true,
    "max_tokens": 500,
    "temperature": 0.7
  }
}
```

### Chat Completion
```json
{
  "name": "chat_completion",
  "arguments": {
    "messages": [
      {"role": "user", "content": "What's the weather in San Francisco?"}
    ],
    "use_agentic": true,
    "max_tokens": 300
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

## 🧪 Testing

The server includes comprehensive testing capabilities:

```bash
# Test basic functionality
npm start

# Test with validation enabled
npm run start:with-validation

# Development mode with hot reload
npm run dev
```

## 🏗 Architecture

### Modular Structure
```
src/
├── config/
│   └── llm-config.js          # LLM and embedding model configuration
├── rag/
│   └── rag-service.js         # RAG functionality and document indexing
├── agentic/
│   └── agentic-service.js     # Agentic LLM interactions with tools
├── tools/
│   └── agentic-tools.js       # Tool definitions (math, filesystem, RAG)
└── mcp/
    └── mcp-server.js          # MCP server implementation
```

### Core Components
- **MCP Server**: Handles Model Context Protocol communication
- **LlamaIndex.TS Integration**: Modern v0.11.28 with Settings API
- **LM Studio Adapter**: OpenAI-compatible API integration
- **RAG Service**: Document indexing and querying with HuggingFace embeddings
- **Agentic Service**: Tool-integrated LLM interactions
- **Modular Tools**: Extensible tool architecture

### Tool Architecture
```javascript
const tool = {
  name: "tool_name",
  description: "Tool description",
  execute: async (params) => {
    // Tool implementation
  }
};
```

## 🔍 RAG Workflow

1. **Document Indexing**: Documents are processed and stored in a vector index
2. **Query Processing**: Natural language queries are converted to vector searches
3. **Context Retrieval**: Relevant document chunks are retrieved
4. **Response Generation**: LLM generates responses using retrieved context
5. **Source Attribution**: Responses include source document information

## 🚨 Troubleshooting

### Common Issues
1. **Connection Refused**: Ensure LM Studio server is running
2. **Model Not Found**: Verify model name in LM Studio
3. **Port Conflicts**: Change LM Studio port if needed
4. **Memory Issues**: Reduce model size or increase system memory

### Debug Mode
```bash
DEBUG=* npm start
```

## 📈 Performance Tips

- Use quantized models for better performance
- Adjust `max_tokens` based on your needs
- Enable streaming for long responses
- Use RAG for document-heavy queries
- Monitor memory usage with large documents

## 🔮 Future Enhancements

- [ ] Multi-agent workflows with handoffs
- [ ] Advanced streaming with real-time updates
- [ ] Persistent document storage across sessions
- [ ] Custom tool development framework
- [ ] Performance monitoring and metrics
- [ ] Integration with more LLM providers

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the LM Studio configuration guide
