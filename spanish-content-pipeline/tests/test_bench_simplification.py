"""Tests for bench_simplification benchmark."""
from benchmarks.bench_simplification import compute_deterministic_metrics
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def _make_simplified_chapter():
    return ChapterScene(
        chapter=1,
        scenes=[Scene(
            setting="cafe",
            description="A café",
            shots=[
                Shot(focus="door", image_prompt="test", sentences=[
                    ShotSentence(source="Maria abre la puerta.", sentence_index=0),
                    ShotSentence(source="El café es grande.", sentence_index=1),
                ]),
                Shot(focus="table", image_prompt="test", sentences=[
                    ShotSentence(source="Ella se sienta en la mesa pequeña cerca de la ventana grande.", sentence_index=2),
                ]),
            ],
        )],
    )


def test_compute_deterministic_metrics():
    chapter = _make_simplified_chapter()
    metrics = compute_deterministic_metrics(chapter, cefr_level="A2", lang="es")
    assert metrics["sentence_count"] == 3
    assert metrics["max_sentence_length_words"] >= 10  # The long sentence
    assert "avg_sentence_length_words" in metrics
    assert isinstance(metrics["sentences_exceeding_word_limit"], int)
