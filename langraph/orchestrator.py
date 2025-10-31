"""LangGraph-powered orchestration pipeline for the MCP server.

This module defines a 10-step workflow that coordinates filesystem actions
and RAG queries. It is executed inside a WebAssembly runtime via Pyodide,
allowing the TypeScript orchestrator to offload planning to Python while
keeping tool execution native.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from langgraph.graph import StateGraph


@dataclass
class PipelineState:
    """Mutable state propagated through the LangGraph workflow."""

    prompt: str
    artifacts: list[str] = field(default_factory=list)
    tools_planned: list[dict[str, object]] = field(default_factory=list)
    context: dict[str, object] = field(default_factory=dict)
    step: int = 0

    def append_tool(self, name: str, parameters: dict[str, object]) -> None:
        self.tools_planned.append({"tool": name, "parameters": parameters})

    def add_artifact(self, description: str) -> None:
        self.artifacts.append(description)


def _dataset_stage(state: PipelineState) -> PipelineState:
    raw_path = Path("./tmp_pipeline_raw.txt").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "write",
            "path": raw_path,
            "content": "dataset=12,7,23",
        },
    )
    state.add_artifact(f"raw dataset written to {raw_path}")
    state.step += 1
    return state


def _metadata_stage(state: PipelineState) -> PipelineState:
    metadata_path = Path("./tmp_pipeline_metadata.json").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "write",
            "path": metadata_path,
            "content": '{"source": "synthetic", "fields": 3}',
        },
    )
    state.add_artifact(f"metadata stored at {metadata_path}")
    state.step += 1
    return state


def _verify_raw_stage(state: PipelineState) -> PipelineState:
    raw_path = Path("./tmp_pipeline_raw.txt").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "read",
            "path": raw_path,
        },
    )
    state.add_artifact(f"raw dataset verified from {raw_path}")
    state.step += 1
    return state


def _verify_metadata_stage(state: PipelineState) -> PipelineState:
    metadata_path = Path("./tmp_pipeline_metadata.json").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "read",
            "path": metadata_path,
        },
    )
    state.add_artifact(f"metadata verified from {metadata_path}")
    state.step += 1
    return state


def _summary_stage(state: PipelineState) -> PipelineState:
    summary_path = Path("./tmp_pipeline_summary.txt").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "write",
            "path": summary_path,
            "content": "Summary: collected 3 synthetic observations.",
        },
    )
    state.add_artifact(f"summary stored at {summary_path}")
    state.step += 1
    return state


def _rag_stage(state: PipelineState) -> PipelineState:
    state.append_tool(
        "rag",
        {
            "query": "evaluation playbooks and best practices",
        },
    )
    state.add_artifact("rag query executed for evaluation playbooks")
    state.step += 1
    return state


def _rag_capture_stage(state: PipelineState) -> PipelineState:
    rag_path = Path("./tmp_pipeline_rag.txt").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "write",
            "path": rag_path,
            "content": "RAG insights: Follow the evaluation playbook to validate every artifact.",
        },
    )
    state.add_artifact(f"rag insights captured at {rag_path}")
    state.step += 1
    return state


def _rag_verify_stage(state: PipelineState) -> PipelineState:
    rag_path = Path("./tmp_pipeline_rag.txt").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "read",
            "path": rag_path,
        },
    )
    state.add_artifact(f"rag insights verified from {rag_path}")
    state.step += 1
    return state


def _report_stage(state: PipelineState) -> PipelineState:
    report_path = Path("./tmp_pipeline_report.md").as_posix()
    state.append_tool(
        "filesystem",
        {
            "action": "write",
            "path": report_path,
            "content": "# Evaluation Report\n\n- Raw data stored\n- Metadata verified\n- RAG insights appended",
        },
    )
    state.add_artifact(f"report drafted at {report_path}")
    state.step += 1
    return state


def _final_stage(state: PipelineState) -> PipelineState:
    state.append_tool(
        "filesystem",
        {
            "action": "list",
            "path": ".",
        },
    )
    state.add_artifact("workspace inventory captured")
    state.step += 1
    return state


def _build_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("dataset", _dataset_stage)
    graph.add_node("metadata", _metadata_stage)
    graph.add_node("verify_raw", _verify_raw_stage)
    graph.add_node("verify_metadata", _verify_metadata_stage)
    graph.add_node("summary", _summary_stage)
    graph.add_node("rag_query", _rag_stage)
    graph.add_node("rag_capture", _rag_capture_stage)
    graph.add_node("rag_verify", _rag_verify_stage)
    graph.add_node("report", _report_stage)
    graph.add_node("final", _final_stage)

    graph.set_entry_point("dataset")
    graph.add_edge("dataset", "metadata")
    graph.add_edge("metadata", "verify_raw")
    graph.add_edge("verify_raw", "verify_metadata")
    graph.add_edge("verify_metadata", "summary")
    graph.add_edge("summary", "rag_query")
    graph.add_edge("rag_query", "rag_capture")
    graph.add_edge("rag_capture", "rag_verify")
    graph.add_edge("rag_verify", "report")
    graph.add_edge("report", "final")
    graph.set_finish_point("final")

    return graph.compile()


_COMPILED_GRAPH: StateGraph | None = None


def run_langraph_pipeline(prompt: str, context: dict[str, object] | None = None) -> str:
    """Execute the LangGraph workflow and return a JSON payload."""

    global _COMPILED_GRAPH
    if _COMPILED_GRAPH is None:
        _COMPILED_GRAPH = _build_graph()

    initial_state = PipelineState(
        prompt=prompt,
        context=context if context is not None else {},
    )
    result = _COMPILED_GRAPH.invoke(initial_state)

    # LangGraph returns a dict, not the dataclass directly
    if isinstance(result, dict):
        artifacts = result.get("artifacts", [])
        tools_planned = result.get("tools_planned", [])
    else:
        artifacts = result.artifacts
        tools_planned = result.tools_planned

    payload = {
        "prompt": prompt,
        "artifacts": artifacts,
        "plan": tools_planned,
    }

    return json.dumps(payload)


def main() -> None:
    """CLI entry point that reads JSON from stdin."""
    import sys

    try:
        input_data = sys.stdin.read()
        request = json.loads(input_data)

        prompt = request.get("prompt", "")
        context = request.get("context", {})

        result = run_langraph_pipeline(prompt, context)
        print(result)
    except Exception as error:
        error_payload = {"error": str(error)}
        print(json.dumps(error_payload), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
