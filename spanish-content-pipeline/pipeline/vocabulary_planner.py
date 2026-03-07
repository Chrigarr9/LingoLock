"""Pass 0b: Plan vocabulary distribution across chapters before story generation.

Distributes must-include structural vocabulary (days, months, numbers, pronouns)
and high-frequency content words across chapters by CEFR level and topical fit.
Generates teaching scene suggestions that get injected into story generation prompts.
"""

from pydantic import BaseModel


MUST_INCLUDE_CATEGORIES: dict[str, dict] = {
    "pronouns": {
        "description": "Personal pronouns (I, you, he, she, we, they, it)",
        "cefr": "A1",
    },
    "days": {
        "description": "Days of the week (Monday through Sunday)",
        "cefr": "A1",
    },
    "months": {
        "description": "Months of the year (January through December)",
        "cefr": "A1",
    },
    "numbers_1_20": {
        "description": "Cardinal numbers 1 through 20",
        "cefr": "A1",
    },
    "colors": {
        "description": "Basic colors (red, blue, green, yellow, black, white, brown, orange, pink, purple)",
        "cefr": "A1",
    },
    "family": {
        "description": "Family members (mother, father, brother, sister, son, daughter, grandmother, grandfather)",
        "cefr": "A1",
    },
    "weather": {
        "description": "Weather terms (sun, rain, cloud, wind, hot, cold, warm)",
        "cefr": "A1",
    },
    "time_expressions": {
        "description": "Time of day, today, tomorrow, yesterday, now, always, never, sometimes, early, late",
        "cefr": "A1",
    },
    "body_parts": {
        "description": "Basic body parts (head, hand, eye, mouth, leg, arm, foot, hair, face)",
        "cefr": "A1",
    },
}


# Templates for teaching scenes. {protagonist} and {companion} are replaced at runtime.
TEACHING_SCENE_TEMPLATES: dict[str, str | None] = {
    "days": (
        "In one scene, {companion} and {protagonist} plan the week together. "
        "{companion} teaches {protagonist} the {target_language} words for Monday through Sunday "
        "while looking at a calendar or planner on the wall."
    ),
    "months": (
        "{companion} asks {protagonist} about her birthday and favorite season. "
        "They discuss months and seasons, mentioning at least six months by name."
    ),
    "numbers_1_20": (
        "During a shopping or payment scene, {protagonist} counts items or money, "
        "using numbers from 1 to 20 naturally in conversation."
    ),
    "colors": (
        "{companion} points at objects around the room and asks {protagonist} what color each is. "
        "They name at least six colors."
    ),
    "weather": (
        "{protagonist} and {companion} check the weather forecast together "
        "and discuss what to wear, mentioning sun, rain, wind, hot, and cold."
    ),
    "body_parts": (
        "{protagonist} is doing a stretching exercise or pointing at a picture. "
        "{companion} names body parts and {protagonist} repeats them."
    ),
    "family": (
        "{protagonist} shows {companion} photos on her phone and talks about her family — "
        "mother, father, brother, sister. {companion} talks about hers too."
    ),
    "time_expressions": (
        "The characters discuss their daily routines — what time they wake up, "
        "what they do in the morning, afternoon, and evening. "
        "They use words like today, tomorrow, yesterday, always, sometimes, never."
    ),
    "pronouns": None,  # Pronouns are woven naturally — no special scene needed
}


class VocabularyPlan(BaseModel):
    """Per-chapter vocabulary plan."""
    must_include_categories: list[str] = []
    teaching_scenes: list[str] = []
    mandatory_words: list[str] = []  # Specific words the LLM must use


def plan_vocabulary(
    chapters: list[dict],
    target_language: str,
    protagonist_name: str = "the protagonist",
    companion_name: str = "her friend",
) -> dict[int, VocabularyPlan]:
    """Distribute must-include vocabulary categories across chapters by CEFR level.

    Args:
        chapters: List of chapter defs (dict with title, cefr_level, context, vocab_focus).
        target_language: e.g. "Spanish".
        protagonist_name: For teaching scene templates.
        companion_name: For teaching scene templates.

    Returns:
        Dict mapping chapter number (1-indexed) -> VocabularyPlan.
    """
    plans: dict[int, VocabularyPlan] = {}

    # Group chapters by CEFR level
    cefr_chapters: dict[str, list[int]] = {}
    for idx, ch in enumerate(chapters):
        cefr = ch.get("cefr_level", "A1")
        cefr_chapters.setdefault(cefr, []).append(idx + 1)

    # Assign each must-include category to a chapter at the matching CEFR level
    categories_to_assign = list(MUST_INCLUDE_CATEGORIES.items())
    for cat_name, cat_info in categories_to_assign:
        target_cefr = cat_info["cefr"]
        eligible = cefr_chapters.get(target_cefr, [])
        if not eligible:
            # Fall back to any chapter
            eligible = list(range(1, len(chapters) + 1))

        # Pick the chapter with fewest assignments so far (spread evenly)
        best_ch = min(
            eligible,
            key=lambda ch: len(plans.get(ch, VocabularyPlan()).must_include_categories),
        )

        if best_ch not in plans:
            plans[best_ch] = VocabularyPlan()

        plans[best_ch].must_include_categories.append(cat_name)

        # Generate teaching scene if template exists
        template = TEACHING_SCENE_TEMPLATES.get(cat_name)
        if template:
            scene = template.format(
                protagonist=protagonist_name,
                companion=companion_name,
                target_language=target_language,
            )
            plans[best_ch].teaching_scenes.append(scene)

    return plans
