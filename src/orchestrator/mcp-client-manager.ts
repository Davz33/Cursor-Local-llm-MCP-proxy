import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, ChildProcess } from "child_process";
import { DiscoveredMCPServer, MCPDiscoveryService } from "./mcp-discovery.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

export interface MCPClientConnection {
  serverName: string;
  client: Client;
  process: ChildProcess | null;
  tools: MCPTool[];
  isConnected: boolean;
  lastError?: string;
}

/**
 * MCP Client Manager for connecting to and managing other MCP servers
 */
export class MCPClientManager {
  private connections: Map<string, MCPClientConnection> = new Map();
  private discoveryService: MCPDiscoveryService;

  constructor(discoveryService: MCPDiscoveryService) {
    this.discoveryService = discoveryService;
  }

  /**
   * Connect to a discovered MCP server
   */
  async connectToServer(serverName: string): Promise<boolean> {
    try {
      const discoveredServer = this.discoveryService.getDiscoveredServer(serverName);
      if (!discoveredServer) {
        throw new Error(`Server ${serverName} not found in discovered servers`);
      }

      console.error(`MCP Client Manager: Connecting to server ${serverName}`);

      // Create MCP client transport (handles process spawning)
      const transport = new StdioClientTransport({
        command: discoveredServer.config.command,
        args: discoveredServer.config.args || []
      });

      const client = new Client({
        name: "local-llm-proxy-orchestrator",
        version: "1.0.0"
      });

      // Connect the client
      await client.connect(transport);

      // List available tools
      const toolsResponse = await client.listTools();
      const tools: MCPTool[] = toolsResponse.tools.map(tool => ({
        name: tool.name,
        description: tool.description || "No description available",
        inputSchema: tool.inputSchema,
        serverName
      }));

      // Create connection object
      const connection: MCPClientConnection = {
        serverName,
        client,
        process: null as any, // Transport handles process management
        tools,
        isConnected: true
      };

      this.connections.set(serverName, connection);
      this.discoveryService.updateServerStatus(serverName, "connected");

      console.error(`MCP Client Manager: Successfully connected to ${serverName} with ${tools.length} tools`);

      return true;
    } catch (error) {
      console.error(`MCP Client Manager: Failed to connect to ${serverName}:`, (error as Error).message);
      this.discoveryService.updateServerStatus(serverName, "error", (error as Error).message);
      return false;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectFromServer(serverName: string): Promise<boolean> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return false;
    }

    try {
      await connection.client.close();
      connection.isConnected = false;
      this.connections.delete(serverName);
      this.discoveryService.updateServerStatus(serverName, "discovered");
      return true;
    } catch (error) {
      console.error(`MCP Client Manager: Error disconnecting from ${serverName}:`, (error as Error).message);
      return false;
    }
  }

  /**
   * Get all available tools from connected servers
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = [];
    for (const connection of this.connections.values()) {
      if (connection.isConnected) {
        allTools.push(...connection.tools);
      }
    }
    return allTools;
  }

  /**
   * Get tools from a specific server
   */
  getToolsFromServer(serverName: string): MCPTool[] {
    const connection = this.connections.get(serverName);
    return connection?.isConnected ? connection.tools : [];
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const connection = this.connections.get(serverName);
    if (!connection || !connection.isConnected) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    try {
      // Log orchestrator tool calls
      console.error(`🎯 ORCHESTRATOR TOOL CALL: ${serverName}.${toolName}`);
      console.error(`🎯 ORCHESTRATOR ARGS:`, JSON.stringify(args, null, 2));
      
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args
      });

      console.error(`🎯 ORCHESTRATOR RESULT: ${serverName}.${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ ORCHESTRATOR ERROR: ${serverName}.${toolName} failed:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): Record<string, {
    isConnected: boolean;
    toolCount: number;
    lastError?: string;
  }> {
    const status: Record<string, any> = {};
    for (const [serverName, connection] of this.connections.entries()) {
      status[serverName] = {
        isConnected: connection.isConnected,
        toolCount: connection.tools.length,
        lastError: connection.lastError
      };
    }
    return status;
  }

  /**
   * Connect to all discovered servers
   */
  async connectToAllDiscoveredServers(): Promise<{
    successful: string[];
    failed: string[];
  }> {
    const discoveredServers = this.discoveryService.getAllDiscoveredServers();
    const successful: string[] = [];
    const failed: string[] = [];

    for (const server of discoveredServers) {
      if (server.status === "discovered") {
        const connected = await this.connectToServer(server.name);
        if (connected) {
          successful.push(server.name);
        } else {
          failed.push(server.name);
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Disconnect from all servers
   */
  async disconnectFromAllServers(): Promise<void> {
    const serverNames = Array.from(this.connections.keys());
    for (const serverName of serverNames) {
      await this.disconnectFromServer(serverName);
    }
  }

  /**
   * Get server by tool name
   */
  getServerByToolName(toolName: string): string | undefined {
    for (const [serverName, connection] of this.connections.entries()) {
      if (connection.isConnected && connection.tools.some(tool => tool.name === toolName)) {
        return serverName;
      }
    }
    return undefined;
  }

  /**
   * Check if a tool is available
   */
  isToolAvailable(toolName: string): boolean {
    return this.getServerByToolName(toolName) !== undefined;
  }
}
