"""Tests for vocabulary_planner.py."""
from pipeline.vocabulary_planner import (
    MUST_INCLUDE_CATEGORIES,
    VocabularyPlan,
    plan_vocabulary,
)


def test_must_include_categories_exist():
    """Core categories are defined."""
    assert "days" in MUST_INCLUDE_CATEGORIES
    assert "months" in MUST_INCLUDE_CATEGORIES
    assert "numbers_1_20" in MUST_INCLUDE_CATEGORIES
    assert "pronouns" in MUST_INCLUDE_CATEGORIES
    assert "colors" in MUST_INCLUDE_CATEGORIES


def test_plan_vocabulary_distributes_categories_to_a1_chapters():
    """Must-include A1 categories are assigned to A1 chapters."""
    chapters = [
        {"title": "Ch1", "cefr_level": "A1", "context": "Packing", "vocab_focus": ["clothing"]},
        {"title": "Ch2", "cefr_level": "A1", "context": "At airport", "vocab_focus": ["airport"]},
        {"title": "Ch3", "cefr_level": "A2", "context": "Shopping", "vocab_focus": ["food"]},
    ]

    plans = plan_vocabulary(
        chapters=chapters,
        target_language="Spanish",
    )

    # All A1 categories should be assigned to A1 chapters (1 or 2), not A2
    all_categories_assigned = set()
    for ch_num, plan in plans.items():
        for cat in plan.must_include_categories:
            all_categories_assigned.add(cat)

    # At least days, months, pronouns should be assigned
    assert "days" in all_categories_assigned
    assert "months" in all_categories_assigned
    assert "pronouns" in all_categories_assigned

    # A2 chapter should not get A1 must-include categories
    a2_categories = plans.get(3, VocabularyPlan()).must_include_categories
    for cat_name in a2_categories:
        assert MUST_INCLUDE_CATEGORIES[cat_name]["cefr"] != "A1"


def test_plan_vocabulary_generates_teaching_scenes():
    """Chapters with must-include categories get teaching scene suggestions."""
    chapters = [
        {"title": "Apartment Tour", "cefr_level": "A1", "context": "Looking around the apartment",
         "vocab_focus": ["rooms"]},
    ]

    plans = plan_vocabulary(chapters=chapters, target_language="Spanish")

    # Should have at least one teaching scene
    all_scenes = []
    for plan in plans.values():
        all_scenes.extend(plan.teaching_scenes)

    assert len(all_scenes) > 0
    # Teaching scenes should mention the target language
    assert any("Spanish" in s or "spanish" in s.lower() for s in all_scenes)
