"""Shared utilities for benchmark scripts."""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class BenchmarkResult(BaseModel):
    """Standard result format for all benchmark runs."""
    task: str
    model: str
    provider: str
    temperature: float
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
    input_fixture: str
    duration_seconds: float
    usage: dict
    cost_estimate_usd: float | None = None
    raw_output: str
    parsed_output: dict | list | None
    deterministic_metrics: dict
    error: str | None = None


def model_slug(model_name: str) -> str:
    """Convert model name to filesystem-safe directory name."""
    return model_name.replace("/", "--")


def load_bench_config(path: Path) -> dict:
    """Load benchmark config YAML."""
    with open(path) as f:
        return yaml.safe_load(f)


def save_result(result: BenchmarkResult, results_dir: Path) -> Path:
    """Save a benchmark result to results/<task>/<model-slug>/run_<timestamp>.json."""
    slug = model_slug(result.model)
    task_dir = results_dir / result.task / slug
    task_dir.mkdir(parents=True, exist_ok=True)

    filename = f"run_{result.timestamp.replace(':', '-')}.json"
    path = task_dir / filename
    path.write_text(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    return path


def run_with_timing(fn):
    """Call fn(), return (result, duration_seconds)."""
    start = time.monotonic()
    result = fn()
    duration = time.monotonic() - start
    return result, duration
