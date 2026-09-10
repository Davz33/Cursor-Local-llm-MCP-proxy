---
name: cmtmsg
description: Generate a git commit message from local changes using local-llm-proxy and LM Studio.
disable-model-invocation: true
---

# Generate commit message

Use the local LLM proxy to draft a commit message from git changes in the current workspace.

## Install globally (once)

This file is the repo example. Cursor loads skills from `~/.cursor/skills/`:

```bash
mkdir -p ~/.cursor/skills
ln -sfn "/path/to/local-llm-proxy/.cursor/skills/commit-message" ~/.cursor/skills/commit-message
```

Replace the path with your clone of this repository. Then type `/cmtmsg` in Agent chat.

## Configure LM Studio in mcp.json

Set the model id and API base in your Cursor MCP config (`~/.cursor/mcp.json` or project `.cursor/mcp.json`). See `.cursor/mcp.json.example` in this repo.

```json
"local-llm-proxy": {
  "command": "node",
  "args": ["/path/to/local-llm-proxy/dist/index.js"],
  "autoApprove": ["generate_commit_message"],
  "env": {
    "LOCAL_LLM_URL": "http://127.0.0.1:1234/v1",
    "LM_STUDIO_MODEL": "meta-llama-3.1-8b-instruct"
  }
}
```

Supported env keys (first match wins):

| Variable | Purpose |
|----------|---------|
| `LOCAL_LLM_URL` | OpenAI-compatible base URL (preferred) |
| `LM_STUDIO_BASE_URL` | Alias for `LOCAL_LLM_URL` |
| `LM_STUDIO_MODEL` | Model id as shown in LM Studio |

Restart the MCP server in Cursor after changing env values.

## Steps

1. Call MCP tool `generate_commit_message` on server `local-llm-proxy`.
2. Arguments:
   - `repo_path`: absolute workspace root
   - `diff_scope`: `staged` by default; use `unstaged`, `all`, or `branch` if the user asks
   - `include_recent_commits`: `true`
   - `max_diff_chars`: `12000` (faster; omit only if the user asks for full diff)
   - `base_branch`: `main` when `diff_scope` is `branch`
3. Print the returned commit message first (subject + body). Then show file list / diff stat if useful.
4. Do **not** run `git commit`, `git add`, or `git push` unless the user explicitly asks.
5. Follow git identity rules: never cursoragent/Cursor as author; never add `Co-authored-by` trailers.

## Examples

- `/cmtmsg` → staged changes in current repo
- `/cmtmsg unstaged` → working tree only
- `/cmtmsg branch` → commits on current branch vs `main`
