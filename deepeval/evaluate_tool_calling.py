#!/usr/bin/env python3

"""DeepEval-based regression suite for validating dynamic tool calling."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from deepeval.test_case import LLMTestCase, ToolCall

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from deepeval_utils.local_metrics import (  # noqa: E402
    LocalStepEfficiencyMetric,
    LocalToolCorrectnessMetric,
    StepExpectations,
)

RUNNER_PATH = PROJECT_ROOT / "deepeval" / "run-agentic-query.js"


def build_tool_call(name: str, parameters: Optional[Dict[str, Any]] = None) -> ToolCall:
    """Create a ToolCall instance with compatibility fallback for older DeepEval versions."""

    try:
        return ToolCall(name=name, parameters=parameters or {})
    except TypeError:
        return ToolCall(name=name, arguments=parameters or {})


def run_agentic_query(
    prompt: str,
    *,
    index_texts: Optional[Iterable[str]] = None,
    max_tokens: int = 500,
    temperature: float = 0.7,
    use_real_llm: bool = False,
) -> Dict[str, Any]:
    """Invoke the Node.js runner and return the parsed JSON payload."""

    payload = {
        "prompt": prompt,
        "maxTokens": max_tokens,
        "temperature": temperature,
        "useRealLLM": use_real_llm,
    }

    if index_texts:
        payload["indexTexts"] = list(index_texts)

    completed = subprocess.run(
        ["node", str(RUNNER_PATH)],
        input=json.dumps(payload),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )

    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        message = stderr or stdout or "Agent runner failed without output"
        raise RuntimeError(f"Agent runner failed: {message}")

    raw_output = completed.stdout.strip()
    if not raw_output:
        raise RuntimeError("Agent runner returned empty output")

    try:
        return json.loads(raw_output)
    except json.JSONDecodeError:
        match = re.findall(r"({\s*\"prompt\".*})", raw_output, flags=re.DOTALL)
        if match:
            candidate = match[-1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"Failed to parse agent output: {raw_output}"
                ) from exc
        raise RuntimeError(f"Failed to parse agent output: {raw_output}")


@dataclass
class Scenario:
    name: str
    prompt: str
    expected_tools: List[Dict[str, Any]]
    index_texts: Optional[List[str]] = None
    use_real_llm: bool = True


SCENARIOS: List[Scenario] = [
    Scenario(
        name="Math tool selection",
        prompt="Calculate 15 + 27 using the math tool",
        expected_tools=[
            {"name": "math", "parameters": {"operation": "add", "a": 15, "b": 27}}
        ],
    ),
    Scenario(
        name="Directory listing",
        prompt="List the contents of the current directory",
        expected_tools=[
            {"name": "filesystem", "parameters": {"action": "list", "path": "."}}
        ],
    ),
    Scenario(
        name="RAG lookup",
        prompt="Search for information about tool calling patterns",
        expected_tools=[
            {"name": "rag", "parameters": {"query": "tool calling patterns"}}
        ],
        index_texts=[
            "Tool calling patterns describe how agents select and sequence tool invocations to satisfy user requests."
        ],
    ),
]


def build_trace(prompt: str, agent_output: Dict[str, Any]) -> Dict[str, Any]:
    trace: Dict[str, Any] = {
        "name": "agentic_service",
        "type": "agent",
        "input": {"input": prompt},
        "output": agent_output.get("response", ""),
        "children": [],
    }

    tool_results_by_name = {}
    metadata = agent_output.get("metadata") or {}
    for result in metadata.get("toolResults", []):
        tool_results_by_name[result.get("toolName")] = result.get("result")

    for call in agent_output.get("toolCalls", []):
        trace["children"].append(
            {
                "name": call.get("name"),
                "type": "tool",
                "input": {"inputParameters": call.get("parameters", {})},
                "output": tool_results_by_name.get(call.get("name")),
                "children": [],
            }
        )

    return trace


def main() -> int:
    if not RUNNER_PATH.exists():
        raise SystemExit(
            f"Runner script not found at {RUNNER_PATH}. Build the project before running DeepEval tests."
        )

    available_tools = [build_tool_call(name) for name in ["math", "filesystem", "rag"]]
    failures: List[str] = []

    for scenario in SCENARIOS:
        agent_output = run_agentic_query(
            scenario.prompt,
            index_texts=scenario.index_texts,
            use_real_llm=scenario.use_real_llm,
        )

        tools_called = [
            build_tool_call(call.get("name", ""), call.get("parameters"))
            for call in agent_output.get("toolCalls", [])
            if call.get("name")
        ]

        expected_tools = [
            build_tool_call(tool["name"], tool.get("parameters"))
            for tool in scenario.expected_tools
        ]

        test_case = LLMTestCase(
            input=scenario.prompt,
            actual_output=agent_output.get("response", ""),
            tools_called=tools_called,
            expected_tools=expected_tools,
        )

        test_case._trace_dict = build_trace(scenario.prompt, agent_output)

        tool_metric = LocalToolCorrectnessMetric(
            available_tools=available_tools,
            threshold=0.9,
            should_exact_match=True,
        )
        tool_metric.expected_tools = expected_tools  # type: ignore[attr-defined]
        tool_metric.measure(test_case)

        efficiency_metric = LocalStepEfficiencyMetric(
            expectations=StepExpectations(
                expected_tools=[tool.name for tool in expected_tools]
            ),
            threshold=0.9,
        )
        efficiency_metric.measure(test_case)

        print(f"Scenario: {scenario.name}")
        print(
            "  Tools called: {} -> selection score: {}, efficiency score: {}".format(
                [call.name for call in tools_called],
                tool_metric.score,
                efficiency_metric.score,
            )
        )
        print(
            "  Reason: [\n\t Tool Selection: {}\n\t Step Efficiency: {}\n  ]".format(
                getattr(tool_metric, "reason", ""),
                getattr(efficiency_metric, "reason", ""),
            )
        )
        print()

        if (
            tool_metric.score < tool_metric.threshold
            or efficiency_metric.score < efficiency_metric.threshold
        ):
            failures.append(scenario.name)

    if failures:
        print("❌ DeepEval tool-calling regression failed for scenarios:")
        for name in failures:
            print(f" - {name}")
        return 1

    print("✅ DeepEval tool-calling regression passed for all scenarios")
    return 0


if __name__ == "__main__":
    sys.exit(main())
