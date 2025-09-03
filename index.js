#!/usr/bin/env node

import { LocalLLMProxyServer } from "./src/mcp/mcp-server.js";

// Start the server
const server = new LocalLLMProxyServer();
server.run().catch(console.error);
