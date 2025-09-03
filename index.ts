#!/usr/bin/env node

import { LocalLLMProxyServer } from "./src/mcp/mcp-server.js";

// Start the server
async function startServer() {
  const server = new LocalLLMProxyServer();
  await server.initialize();
  await server.run();
}

startServer().catch(console.error);
