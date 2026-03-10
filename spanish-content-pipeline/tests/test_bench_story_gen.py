"""Tests for bench_story_gen benchmark."""
import json
from pathlib import Path
from unittest.mock import MagicMock

from benchmarks.bench_story_gen import run_story_gen_benchmark, compute_deterministic_metrics
from pipeline.models import ChapterScene


def _make_chapter_scene():
    return {
        "scenes": [{
            "setting": "cafe",
            "description": "A café",
            "shots": [
                {
                    "focus": "door",
                    "image_prompt": "PROTAGONIST enters",
                    "sentences": [
                        {"source": "Maria abrió la puerta.", "sentence_index": 0},
                        {"source": "«¡Hola!», dijo Sofia.", "sentence_index": 1},
                    ],
                },
                {
                    "focus": "table",
                    "image_prompt": "coffee on table",
                    "sentences": [
                        {"source": "Ella se sentó.", "sentence_index": 2},
                    ],
                },
            ],
        }],
    }


def test_compute_deterministic_metrics():
    data = _make_chapter_scene()
    cs = ChapterScene(chapter=1, **data)
    metrics = compute_deterministic_metrics(cs, protagonist_name="Maria", secondary_characters=["Sofia"])
    assert metrics["sentence_count"] == 3
    assert metrics["shot_count"] == 2
    assert metrics["scene_count"] == 1
    assert metrics["dialogue_count"] >= 1  # «¡Hola!»
    assert metrics["protagonist_mentions"] >= 1
    assert metrics["character_mentions"]["Sofia"] >= 1
