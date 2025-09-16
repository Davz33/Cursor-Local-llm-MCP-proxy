#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from "chalk";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  unlinkSync,
  rmdirSync,
  existsSync,
  accessSync,
  constants,
} from "fs";
import { join, resolve, dirname, basename, extname } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface FilesystemServerOptions {
  allowedDirectories: string[];
  verbose?: boolean;
}

class FilesystemServer {
  private allowedDirectories: string[];
  private verbose: boolean;

  constructor(options: FilesystemServerOptions) {
    this.allowedDirectories = options.allowedDirectories;
    this.verbose = options.verbose || false;

    console.error(
      `📁 Filesystem Server: Allowed directories: ${this.allowedDirectories.join(", ")}`,
    );
  }

  private isPathAllowed(path: string): boolean {
    const resolvedPath = resolve(path);

    // Check if the path is within any allowed directory
    return this.allowedDirectories.some((allowedDir) => {
      const resolvedAllowedDir = resolve(allowedDir);
      return resolvedPath.startsWith(resolvedAllowedDir);
    });
  }

  private validatePath(path: string): void {
    if (!this.isPathAllowed(path)) {
      throw new Error(
        `Access denied: Path "${path}" is not within allowed directories`,
      );
    }
  }

  private readDirectory(path: string): {
    name: string;
    type: "file" | "directory";
    size?: number;
    modified?: string;
  }[] {
    this.validatePath(path);

    if (!existsSync(path)) {
      throw new Error(`Directory does not exist: ${path}`);
    }

    const stats = statSync(path);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${path}`);
    }

    const entries = readdirSync(path);
    const result = [];

    for (const entry of entries) {
      const fullPath = join(path, entry);
      try {
        const entryStats = statSync(fullPath);
        result.push({
          name: entry,
          type: (entryStats.isDirectory() ? "directory" : "file") as
            | "file"
            | "directory",
          size: entryStats.isFile() ? entryStats.size : undefined,
          modified: entryStats.mtime.toISOString(),
        });
      } catch (error) {
        // Skip entries we can't access
        if (this.verbose) {
          console.error(`⚠️ Cannot access ${fullPath}: ${error}`);
        }
      }
    }

    return result.sort((a, b) => {
      // Directories first, then files, both alphabetically
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private readFile(path: string): string {
    this.validatePath(path);

    if (!existsSync(path)) {
      throw new Error(`File does not exist: ${path}`);
    }

    const stats = statSync(path);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${path}`);
    }

    return readFileSync(path, "utf-8");
  }

  private writeFile(path: string, content: string): void {
    this.validatePath(path);

    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, content, "utf-8");
  }

  private createDirectory(path: string): void {
    this.validatePath(path);

    if (existsSync(path)) {
      throw new Error(`Directory already exists: ${path}`);
    }

    mkdirSync(path, { recursive: true });
  }

  private deleteFile(path: string): void {
    this.validatePath(path);

    if (!existsSync(path)) {
      throw new Error(`File does not exist: ${path}`);
    }

    const stats = statSync(path);
    if (stats.isDirectory()) {
      throw new Error(
        `Path is a directory, use delete_directory instead: ${path}`,
      );
    }

    unlinkSync(path);
  }

  private deleteDirectory(path: string): void {
    this.validatePath(path);

    if (!existsSync(path)) {
      throw new Error(`Directory does not exist: ${path}`);
    }

    const stats = statSync(path);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${path}`);
    }

    // Check if directory is empty
    const entries = readdirSync(path);
    if (entries.length > 0) {
      throw new Error(`Directory is not empty: ${path}`);
    }

    rmdirSync(path);
  }

  private getFileInfo(path: string): {
    name: string;
    type: "file" | "directory";
    size: number;
    modified: string;
    permissions: string;
    exists: boolean;
  } {
    this.validatePath(path);

    if (!existsSync(path)) {
      return {
        name: basename(path),
        type: "file",
        size: 0,
        modified: "",
        permissions: "",
        exists: false,
      };
    }

    const stats = statSync(path);
    const permissions = this.getPermissions(stats.mode);

    return {
      name: basename(path),
      type: stats.isDirectory() ? "directory" : "file",
      size: stats.size,
      modified: stats.mtime.toISOString(),
      permissions,
      exists: true,
    };
  }

  private getPermissions(mode: number): string {
    const permissions = [
      mode & constants.S_IRUSR ? "r" : "-",
      mode & constants.S_IWUSR ? "w" : "-",
      mode & constants.S_IXUSR ? "x" : "-",
      mode & constants.S_IRGRP ? "r" : "-",
      mode & constants.S_IWGRP ? "w" : "-",
      mode & constants.S_IXGRP ? "x" : "-",
      mode & constants.S_IROTH ? "r" : "-",
      mode & constants.S_IWOTH ? "w" : "-",
      mode & constants.S_IXOTH ? "x" : "-",
    ].join("");

    return permissions;
  }

  public processToolCall(
    toolName: string,
    args: any,
  ): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      if (this.verbose) {
        console.error(
          `🔧 Filesystem Server: Executing ${toolName} with args:`,
          JSON.stringify(args, null, 2),
        );
      }

      let result: any;

      switch (toolName) {
        case "list_directory":
          result = this.readDirectory(args.path);
          break;

        case "read_file":
          result = this.readFile(args.path);
          break;

        case "write_file":
          this.writeFile(args.path, args.content);
          result = { success: true, message: `File written to ${args.path}` };
          break;

        case "create_directory":
          this.createDirectory(args.path);
          result = {
            success: true,
            message: `Directory created at ${args.path}`,
          };
          break;

        case "delete_file":
          this.deleteFile(args.path);
          result = { success: true, message: `File deleted: ${args.path}` };
          break;

        case "delete_directory":
          this.deleteDirectory(args.path);
          result = {
            success: true,
            message: `Directory deleted: ${args.path}`,
          };
          break;

        case "get_file_info":
          result = this.getFileInfo(args.path);
          break;

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`❌ Filesystem Server Error:`, error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                status: "failed",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  }
}

const FILESYSTEM_TOOLS: Tool[] = [
  {
    name: "list_directory",
    description: "List the contents of a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the directory to list",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "create_directory",
    description: "Create a new directory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the directory to create",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to delete",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_directory",
    description: "Delete an empty directory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the directory to delete",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "get_file_info",
    description: "Get information about a file or directory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file or directory to get info about",
        },
      },
      required: ["path"],
    },
  },
];

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("allowed-directories", {
    type: "array",
    description: "Directories that the server is allowed to access",
    default: [process.cwd()],
  })
  .option("verbose", {
    type: "boolean",
    description: "Enable verbose logging",
    default: false,
  })
  .help()
  .parseSync();

const allowedDirectories = (argv["allowed-directories"] as string[]).map(
  (dir) => resolve(dir),
);

const server = new Server(
  {
    name: "filesystem-server",
    version: "0.6.2",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const filesystemServer = new FilesystemServer({
  allowedDirectories,
  verbose: argv.verbose as boolean,
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: FILESYSTEM_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return filesystemServer.processToolCall(
    request.params.name,
    request.params.arguments,
  );
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error(`Allowed directories: ${allowedDirectories.join(", ")}`);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
