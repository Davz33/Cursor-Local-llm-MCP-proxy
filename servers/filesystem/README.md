# MCP Filesystem Server

A Model Context Protocol (MCP) server that provides secure filesystem operations.

## Features

- **Secure Access**: Only allows access to specified directories
- **File Operations**: Read, write, create, and delete files
- **Directory Operations**: List, create, and delete directories
- **File Information**: Get detailed information about files and directories
- **Permission Checking**: Validates file permissions and access rights
- **Confirmation Prompts**: Requires explicit confirmation for destructive operations (modify/delete)

## Available Tools

- `list_directory` - List contents of a directory
- `read_file` - Read file contents
- `write_file` - Write content to a file
- `create_directory` - Create a new directory
- `delete_file` - Delete a file
- `delete_directory` - Delete an empty directory
- `get_file_info` - Get detailed information about a file or directory

## Usage

### Command Line

```bash
# Allow access to current directory
npx mcp-server-filesystem .

# Allow access to multiple directories
npx mcp-server-filesystem /path/to/dir1 /path/to/dir2

# Enable verbose logging
npx mcp-server-filesystem . --verbose
```

### MCP Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/path/to/servers/filesystem/dist/index.js", "/allowed/path"],
      "env": {}
    }
  }
}
```

## Security

The server enforces strict directory access controls. Only paths within the specified allowed directories can be accessed. This prevents unauthorized access to sensitive system files.

### Confirmation Requirements

For safety, destructive operations require explicit confirmation:

- **File Overwrite**: When writing to an existing file, you must set `confirm: true` to overwrite
- **File Deletion**: When deleting a file, you must set `confirm: true` to proceed
- **Directory Deletion**: When deleting a directory, you must set `confirm: true` to proceed

Example:
```json
{
  "name": "write_file",
  "arguments": {
    "path": "existing-file.txt",
    "content": "New content",
    "confirm": true
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build the server
npm run build

# Watch for changes
npm run watch
```

## License

MIT
