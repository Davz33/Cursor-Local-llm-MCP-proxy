# Release Notes v2.2.0 - Pixi Regression Suite & Documentation Refresh

## ✨ Highlights

- Documented the Pixi-based DeepEval regression harness and removed the legacy `requirements.txt` flow.
- Added explicit LM Studio system-prompt setup steps, including preset path `~/.lmstudio/config-presets/<preset>.json`.
- Clarified that LM Studio's native tool-calling array stays empty because tool invocations are embedded in the assistant `content` payload.
- Recorded successful manual tests with `openai/gpt-oss-120b`, `qwen2.5-coder-32b-instruct`, and `qwen3-coder-32b-instruct` inside LM Studio.

## 📚 Documentation Updates

- README now lists the supported models, Pixi instructions, and the expected logging behavior in LM Studio.
- Added a dedicated "Install the System Prompt in LM Studio" section referencing `prompts/agentic-system-prompt.md`.
- Updated DeepEval instructions to use `pixi install` and `pixi run evaluate-tool-calling` for deterministic local metrics.

## 🧪 Testing

- DeepEval regression suite executed via Pixi with deterministic local metrics (`pixi run evaluate-tool-calling`).
- Manual tool-calling checks with the models listed above to confirm consistent behavior.

## 🔐 Security

- Repository scanned with TruffleHog prior to tagging; no secrets detected.


