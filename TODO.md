# TODO - Development Roadmap

This document tracks the development roadmap for the Local LLM MCP Proxy project.

## 🚀 Immediate Priority (Next 1-2 weeks)

### Examples & Documentation
- [ ] **Add runnable examples in the repo**
- [ ] **Create sample mcp.json in /examples** showing exact path, env vars, and minimal Cursor setup
- [ ] **Create end-to-end smoke script** that builds, starts MCP server, and calls endpoints against running LM Studio
- [ ] **Add concrete LM Studio model-name examples** and common model pitfalls to docs
- [ ] **Create explicit "Quick debugging" section**: confirm LM Studio endpoint, validate model names, confirm MCP tool visibility in Cursor

### CI/CD & Testing
- [ ] **Set up CI pipeline** with GitHub Actions for lint, typecheck, build, and tests on push/PR
- [ ] **Add unit tests** for core orchestrator logic, tool routing, and fallback scoring
- [ ] **Strengthen TypeScript types** for MCP messages, tool descriptors, and config parsing

## 🏗️ Important (Next 2-4 weeks)

### Containerization & Distribution
- [ ] **Provide Dockerfile and docker-compose example** that runs LM Studio + MCP server for local testing and CI
- [ ] **Consider small release asset** (tarball/dist) for users who want to avoid building locally

### Observability & Health
- [ ] **Add /health and /metrics endpoints** (Prometheus metrics) for uptime, request latency, request counts, error rates, and queue lengths
- [ ] **Add structured logging** with levels (info/warn/error/debug) and request IDs to trace MCP calls

### Robustness & Error Handling
- [ ] **Validate incoming MCP requests early** with clear error responses
- [ ] **Add retry/backoff** where code calls LM Studio or other network services
- [ ] **Add graceful shutdown handling** for in-flight requests and safe persistence flushes

## 🔬 RAG & Model Tuning (As you test)

### Chunking and Retrieval
- [ ] **Use consistent text chunking** with overlap (512–1,000 token chunks, ~100–200 token overlap) and store chunk metadata (source, position, timestamp)
- [ ] **Keep provenance in responses**: when returning retrieved context, include source id + chunk reference and similarity score

### Embeddings & Index
- [ ] **Batch-create embeddings** for indexing to avoid rate limits
- [ ] **Evaluate different embedding models** and similarity metrics (cosine vs. dot product) and choose a default; expose it in config
- [ ] **Offer adapters for multiple vector stores** (FAISS/Annoy/on-disk HNSW, Weaviate, Milvus) and document tradeoffs

### Confidence/fallback heuristics
- [ ] **Implement numeric confidence score** and clear rules for falling back to cloud LLMs
- [ ] **Add heuristics to detect "I don't know"** or hallucinations (contradictions, low overlap with retrieved docs) and trigger validation/fallback
- [ ] **Make thresholds configurable** per environment and per task type

## ⚡ Performance & Cost (Practical knobs)

- [ ] **Use quantized models / GGUF** where possible (note in README which formats were tested)
- [ ] **Expose max_tokens, temperature, and streaming flags** in configs and default to conservative values
- [ ] **Enable streaming for long responses** and chunked streaming to the client for better UX
- [ ] **Cache embeddings and recent search results**; use LRU with TTL for memory control

## 🏛️ Architecture & Developer Ergonomics

- [ ] **Modularize tools**: clear plug-in interface for adding/removing tools (math, filesystem, Sonar web search)
- [ ] **Add tool discovery integration test** to ensure tool registration and routing logic works
- [ ] **Add CONTRIBUTING.md, issue templates, and PR templates** to make community contributions easier

## 🔒 Security and Safety

- [ ] **Sanitize and validate** any filesystem or shell tool inputs
- [ ] **Rate limit external API calls** and add safe defaults for web tools (time limits, result caps)
- [ ] **Consider adding optional content filters** or "safety" checks before returning RAG-augmented outputs

## 🌟 Nice-to-have / Future Ideas

### Advanced Features
- [ ] **Prompts and prompt versioning**: store prompt templates and allow quick A/B testing
- [ ] **Multi-agent workflows and handoff examples** (small demo that chains tools)
- [ ] **Performance benchmarking scripts** to capture latency and memory usage for different model sizes and quantization modes
- [ ] **Small web UI for inspecting vector index contents** and recent queries (useful for debugging RAG)

## 📊 Progress Tracking

### Completed ✅
- [x] Real LLM integration with LlamaIndex.TS
- [x] Dynamic tool calling capabilities
- [x] MCP server integration
- [x] Filesystem tool implementation
- [x] JSON parsing and error recovery
- [x] Basic error handling and logging
- [x] Version 2.0.0 release

### In Progress 🔄
- [ ] (None currently)

### Blocked 🚫
- [ ] (None currently)

## 🎯 Milestones

### Milestone 1: Foundation (Week 1-2)
- [ ] Complete examples and documentation
- [ ] Set up CI/CD pipeline
- [ ] Add basic unit tests

### Milestone 2: Production Ready (Week 3-4)
- [ ] Containerization
- [ ] Observability and health checks
- [ ] Robust error handling

### Milestone 3: Advanced Features (Week 5-8)
- [ ] Enhanced RAG capabilities
- [ ] Performance optimizations
- [ ] Security improvements

### Milestone 4: Ecosystem (Week 9+)
- [ ] Plugin architecture
- [ ] Community tools
- [ ] Advanced UI/UX

## 📝 Notes

- Items marked with **bold** are high priority
- Items are organized by estimated timeline and importance
- Check off items as they are completed
- Add new items as they are discovered
- Update priorities based on user feedback and requirements

---

*Last updated: January 2025*
*Version: 2.0.0*