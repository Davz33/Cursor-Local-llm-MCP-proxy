import { readFile, access } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface DiscoveredMCPServer {
  name: string;
  config: MCPServerConfig;
  status: "discovered" | "connected" | "error";
  error?: string;
}

/**
 * MCP Discovery Service for finding and reading MCP configurations
 */
export class MCPDiscoveryService {
  private cursorConfigPath: string;
  private discoveredServers: Map<string, DiscoveredMCPServer> = new Map();

  constructor() {
    // Default cursor config path - can be overridden
    this.cursorConfigPath = join(homedir(), ".cursor", "mcp.json");
  }

  /**
   * Set custom cursor config path
   */
  setCursorConfigPath(path: string): void {
    this.cursorConfigPath = path;
  }

  /**
   * Discover MCP servers from cursor configuration
   */
  async discoverMCPServers(): Promise<DiscoveredMCPServer[]> {
    try {
      console.error(
        "MCP Discovery: Looking for cursor config at:",
        this.cursorConfigPath,
      );

      // Check if cursor config exists
      await access(this.cursorConfigPath);

      // Read and parse the configuration
      const configContent = await readFile(this.cursorConfigPath, "utf-8");
      const config: MCPConfig = JSON.parse(configContent);

      console.error(
        "MCP Discovery: Found config with servers:",
        Object.keys(config.mcpServers || {}),
      );

      // Convert to discovered servers
      const servers: DiscoveredMCPServer[] = [];

      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          const discoveredServer: DiscoveredMCPServer = {
            name,
            config: serverConfig,
            status: "discovered",
          };

          servers.push(discoveredServer);
          this.discoveredServers.set(name, discoveredServer);
        }
      }

      return servers;
    } catch (error) {
      console.error(
        "MCP Discovery: Error discovering servers:",
        (error as Error).message,
      );

      // Return empty array if config doesn't exist or is invalid
      return [];
    }
  }

  /**
   * Get discovered server by name
   */
  getDiscoveredServer(name: string): DiscoveredMCPServer | undefined {
    return this.discoveredServers.get(name);
  }

  /**
   * Get all discovered servers
   */
  getAllDiscoveredServers(): DiscoveredMCPServer[] {
    return Array.from(this.discoveredServers.values());
  }

  /**
   * Update server status
   */
  updateServerStatus(
    name: string,
    status: DiscoveredMCPServer["status"],
    error?: string,
  ): void {
    const server = this.discoveredServers.get(name);
    if (server) {
      server.status = status;
      if (error) {
        server.error = error;
      }
    }
  }

  /**
   * Check if cursor config exists
   */
  async hasCursorConfig(): Promise<boolean> {
    try {
      await access(this.cursorConfigPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cursor config path
   */
  getCursorConfigPath(): string {
    return this.cursorConfigPath;
  }

  /**
   * Discover MCP servers from alternative locations
   */
  async discoverFromAlternativeLocations(): Promise<DiscoveredMCPServer[]> {
    const alternativePaths = [
      join(process.cwd(), "mcp.json"),
      join(process.cwd(), ".cursor", "mcp.json"),
      join(homedir(), ".config", "cursor", "mcp.json"),
      join(homedir(), "Library", "Application Support", "Cursor", "mcp.json"), // macOS
    ];

    for (const path of alternativePaths) {
      try {
        await access(path);
        console.error("MCP Discovery: Found alternative config at:", path);
        this.cursorConfigPath = path;
        return await this.discoverMCPServers();
      } catch {
        // Continue to next path
      }
    }

    return [];
  }

  /**
   * Get discovery status summary
   */
  getDiscoveryStatus(): {
    hasConfig: boolean;
    configPath: string;
    discoveredCount: number;
    connectedCount: number;
    errorCount: number;
  } {
    const servers = this.getAllDiscoveredServers();
    return {
      hasConfig: servers.length > 0,
      configPath: this.cursorConfigPath,
      discoveredCount: servers.filter((s) => s.status === "discovered").length,
      connectedCount: servers.filter((s) => s.status === "connected").length,
      errorCount: servers.filter((s) => s.status === "error").length,
    };
  }
}
