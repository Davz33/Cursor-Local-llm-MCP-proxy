# Commit message generation

Generate structured git commit messages from local diffs using LM Studio (or any OpenAI-compatible local server). The MCP tool runs git locally, sends a trimmed diff to your local model, and returns a subject and body that match recent commits in the repository.

## Prerequisites

1. Build the server: `npm run build`
2. LM Studio (or compatible server) listening on your configured URL
3. `local-llm-proxy` registered in Cursor `mcp.json` (see [`.cursor/mcp.json.example`](.cursor/mcp.json.example))

## MCP tool: `generate_commit_message`

Collects a git diff, recent commit subjects for style, and asks the local LLM for JSON with `subject`, `body`, and `commit_message`.

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `repo_path` | process cwd | Path to the git repository |
| `diff_scope` | `staged` | `staged`, `unstaged`, `all` (vs HEAD), or `branch` |
| `base_branch` | `main` | Base for `diff_scope: branch` (`master` if `main` missing) |
| `include_recent_commits` | `true` | Include recent subjects so the model matches repo tone |
| `max_diff_chars` | `48000` | Cap diff size sent to the model (use `12000` for speed) |
| `max_tokens` | (LLM default) | Reserved for future per-call limits |
| `temperature` | (LLM default) | Reserved for future per-call limits |

### Example (MCP call)

```json
{
  "name": "generate_commit_message",
  "arguments": {
    "repo_path": "/path/to/repo",
    "diff_scope": "staged",
    "include_recent_commits": true,
    "max_diff_chars": 12000
  }
}
```

### Response

Plain text: the commit message first, then a metadata block (subject, branch, diff scope, files changed, diff stat).

The service strips any `Co-authored-by` lines from model output.

### Untracked files

`git diff` does not include untracked files. Stage new files before calling with `diff_scope: staged`, or use `unstaged` / `all` only for tracked changes.

## Cursor shortcut: `/cmtmsg`

A manual Agent skill is included in this repo. Cursor reserves `/commit` for its own skill, so this project uses **`/cmtmsg`**.

**Repo copy:** [`.cursor/skills/commit-message/SKILL.md`](.cursor/skills/commit-message/SKILL.md)

**Install globally (symlink to this repo):**

```bash
mkdir -p ~/.cursor/skills
ln -sfn "/path/to/local-llm-proxy/.cursor/skills/commit-message" ~/.cursor/skills/commit-message
```

In Agent chat, type `/cmtmsg`. The skill instructs the agent to call `generate_commit_message` and not run `git commit` unless you ask.

Examples:

- `/cmtmsg` — staged changes
- `/cmtmsg unstaged` — working tree only
- `/cmtmsg branch` — current branch vs `main`

## MCP configuration

Set the model and endpoint in `mcp.json` under `local-llm-proxy.env`. Cursor injects these as environment variables when the server starts.

```json
{
  "mcpServers": {
    "local-llm-proxy": {
      "command": "node",
      "args": ["/path/to/local-llm-proxy/dist/index.js"],
      "autoApprove": ["generate_commit_message"],
      "env": {
        "LOCAL_LLM_URL": "http://127.0.0.1:1234/v1",
        "LM_STUDIO_MODEL": "meta-llama-3.1-8b-instruct"
      }
    }
  }
}
```

| Variable | Purpose |
|----------|---------|
| `LOCAL_LLM_URL` | OpenAI-compatible base URL (preferred) |
| `LM_STUDIO_BASE_URL` | Alias for `LOCAL_LLM_URL` |
| `LM_STUDIO_MODEL` | Model id as shown in LM Studio |

Restart the MCP server in Cursor after changing env values.

Optional CLI permission (Cursor CLI): add `Mcp(local-llm-proxy:generate_commit_message)` to `~/.cursor/cli-config.json` under `permissions.allow`.

## Performance (LM Studio)

Commit messages need a small context window, not the model maximum.

- Load the model with **8k–16k context** instead of 131k+
- Use `max_diff_chars: 12000` and `diff_scope: staged` when possible
- Smaller quantized models (e.g. 8B Q4) are often enough for this task

Typical latency on an 8B model with a modest staged diff: about **5–15 seconds**.

## Implementation

| File | Role |
|------|------|
| `src/services/git-commit-service.ts` | Git subprocess, prompt, LLM call, response parsing |
| `src/mcp/mcp-server.ts` | MCP tool registration and handler |

## Related rules

- Do not add `Co-authored-by` trailers (project and user rules)
- Set git author/committer appropriately for your remote; the tool does not commit for you
