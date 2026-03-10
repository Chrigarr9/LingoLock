"""Tests for benchmarks.common module."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from benchmarks.common import (
    BenchmarkResult,
    load_bench_config,
    save_result,
    model_slug,
)


def test_model_slug_normalizes_slashes():
    assert model_slug("deepseek/deepseek-v3.2") == "deepseek--deepseek-v3.2"


def test_model_slug_normalizes_dots_and_colons():
    assert model_slug("qwen/qwen3-235b-a22b-thinking-2507") == "qwen--qwen3-235b-a22b-thinking-2507"


def test_load_bench_config(tmp_path):
    cfg = tmp_path / "bench.yaml"
    cfg.write_text("""
models:
  story_generation:
    - { provider: openrouter, model: "test/model-a", temperature: 0.8 }
    - { provider: openrouter, model: "test/model-b", temperature: 0.3 }
  translation:
    - { provider: openrouter, model: "test/model-c", temperature: 0.3 }
""")
    config = load_bench_config(cfg)
    assert len(config["models"]["story_generation"]) == 2
    assert config["models"]["translation"][0]["model"] == "test/model-c"


def test_save_result_creates_directory_and_file(tmp_path):
    result = BenchmarkResult(
        task="story_gen",
        model="test/model-a",
        provider="openrouter",
        temperature=0.8,
        input_fixture="test_chapter.yaml",
        duration_seconds=1.5,
        usage={"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300},
        raw_output="test output",
        parsed_output={"scenes": []},
        deterministic_metrics={"sentence_count": 5},
    )
    save_result(result, tmp_path)

    slug = "test--model-a"
    dirs = list((tmp_path / "story_gen" / slug).iterdir())
    assert len(dirs) == 1
    assert dirs[0].suffix == ".json"

    saved = json.loads(dirs[0].read_text())
    assert saved["task"] == "story_gen"
    assert saved["deterministic_metrics"]["sentence_count"] == 5


def test_benchmark_result_timestamp_auto_set():
    result = BenchmarkResult(
        task="test", model="m", provider="p", temperature=0.0,
        input_fixture="f", duration_seconds=0.0,
        usage={}, raw_output="", parsed_output=None,
        deterministic_metrics={},
    )
    assert result.timestamp
