from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from deepeval.metrics.step_efficiency.step_efficiency import StepEfficiencyMetric
from deepeval.metrics.tool_correctness.tool_correctness import (
    ToolCall,
    ToolCorrectnessMetric,
    ToolSelectionScore,
)
from deepeval.models import DeepEvalBaseLLM


class _StaticLLM(DeepEvalBaseLLM):
    """A deterministic LLM stub to satisfy DeepEval interfaces without API calls."""

    def __init__(self, model_name: str) -> None:
        super().__init__(model_name=model_name)

    def load_model(self, *args, **kwargs):  # type: ignore[override]
        return self

    def get_model_name(self, *args, **kwargs) -> str:  # type: ignore[override]
        return self.model_name or "static-llm"

    def generate(self, *args, **kwargs):  # type: ignore[override]
        raise NotImplementedError("Static model should not be used directly")

    async def a_generate(self, *args, **kwargs):  # type: ignore[override]
        raise NotImplementedError("Static model should not be used directly")


class LocalToolCorrectnessMetric(ToolCorrectnessMetric):
    """Deterministic tool correctness metric that avoids remote LLM usage."""

    def __init__(self, *args, **kwargs) -> None:  # type: ignore[override]
        super().__init__(*args, model=_StaticLLM("static-tool-selection"), **kwargs)

    def _compute_selection_score(
        self,
        tools_called: List[ToolCall],
        available_tools: Optional[List[ToolCall]],
    ) -> ToolSelectionScore:
        if not available_tools:
            return ToolSelectionScore(
                score=1.0,
                reason="No available tools catalogue provided; assuming selection is valid.",
            )

        available_names = {tool.name for tool in available_tools}
        called_names = [tool.name for tool in tools_called]
        unknown_tools = sorted(
            {name for name in called_names if name not in available_names}
        )

        if unknown_tools:
            return ToolSelectionScore(
                score=0.0,
                reason=f"Agent invoked unsupported tools: {', '.join(unknown_tools)}.",
            )

        if self.should_exact_match and hasattr(self, "expected_tools"):
            expected_names = {tool.name for tool in self.expected_tools}
            missing = sorted(expected_names - set(called_names))
            extra = sorted(set(called_names) - expected_names)
            if missing or extra:
                details: List[str] = []
                if missing:
                    details.append(f"missing {', '.join(missing)}")
                if extra:
                    details.append(f"extra {', '.join(extra)}")
                return ToolSelectionScore(
                    score=0.0,
                    reason=f"Tool selection mismatch: {'; '.join(details)}.",
                )

        return ToolSelectionScore(
            score=1.0,
            reason="Tool selection matches expectation.",
        )

    def _get_tool_selection_score(  # type: ignore[override]
        self,
        user_input: str,
        tools_called: List[ToolCall],
        available_tools: List[ToolCall],
    ) -> ToolSelectionScore:
        return self._compute_selection_score(tools_called, available_tools)

    async def _a_get_tool_selection_score(  # type: ignore[override]
        self,
        user_input: str,
        tools_called: List[ToolCall],
        available_tools: List[ToolCall],
    ) -> ToolSelectionScore:
        return self._compute_selection_score(tools_called, available_tools)


@dataclass
class StepExpectations:
    expected_tools: List[str]


class LocalStepEfficiencyMetric(StepEfficiencyMetric):
    """Deterministic efficiency metric that evaluates tool steps without LLM calls."""

    def __init__(self, *, expectations: StepExpectations, **kwargs) -> None:
        super().__init__(
            model=_StaticLLM("static-step-efficiency"), async_mode=False, **kwargs
        )
        self.expectations = expectations

    def _score_trace(self, trace: Dict) -> ToolSelectionScore:  # type: ignore[override]
        children = trace.get("children", []) if isinstance(trace, dict) else []
        tool_sequence = [child.get("name") for child in children]
        expected = self.expectations.expected_tools

        if tool_sequence == expected:
            return ToolSelectionScore(
                score=1.0,
                reason="Execution matched expected minimal tool sequence.",
            )

        missing = [name for name in expected if name not in tool_sequence]
        extra = [name for name in tool_sequence if name not in expected]
        details: List[str] = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if extra:
            details.append(f"extra {', '.join(extra)}")
        if not details and tool_sequence != expected:
            details.append("tool order differed from expectation")

        return ToolSelectionScore(
            score=0.0,
            reason=f"Trace deviated from expected sequence: {'; '.join(details)}.",
        )

    def _get_score(self, task: str, test_case):  # type: ignore[override]
        return self._score_trace(test_case._trace_dict or {})

    async def _a_get_score(self, task: str, test_case):  # type: ignore[override]
        return self._score_trace(test_case._trace_dict or {})

    def _extract_task_from_trace(self, test_case) -> str:  # type: ignore[override]
        trace = test_case._trace_dict or {}
        input_section = trace.get("input", {}) if isinstance(trace, dict) else {}
        return input_section.get("input", "")

    async def _a_extract_task_from_trace(self, test_case) -> str:  # type: ignore[override]
        return self._extract_task_from_trace(test_case)
