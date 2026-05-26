import json

from pipeline.lemmatizer import TokenInfo
from pipeline.models import SentencePair
from pipeline.subtitle_processor import ProcessedEpisode, ProcessedSentence, _is_teachable_token
from pipeline.subtitle_word_extractor import extract_word_cards, _build_image_prompt, _slugify
from scripts.run_subtitle import _content_hash, limit_generation_episodes, _translations_match_episode


class FakeEnrichmentLLM:
    def __init__(self):
        self.calls = 0

    def complete_json(self, prompt: str, system: str | None = None):
        self.calls += 1
        enrichments = []
        for lemma, german, english, pos in [
            ("querer", "wollen", "want", "verb"),
            ("casa", "Haus", "house", "noun"),
            ("bonito", "schoen", "beautiful", "adjective"),
            ("comer", "essen", "eat", "verb"),
            ("manzana", "Apfel", "apple", "noun"),
        ]:
            if f'lemma="{lemma}"' in prompt:
                enrichments.append({
                    "lemma": lemma,
                    "german_hint": german,
                    "german_hint_general": "moegen" if lemma == "querer" else "",
                    "english_gloss": english,
                    "context_note": pos,
                    "cefr_level": "A1",
                    "image_prompt": "a small cozy house on a quiet street, no text" if lemma == "casa" else "",
                })

        class Response:
            content = json.dumps({"enrichments": enrichments})

        return Response()


def tok(text: str, lemma: str, pos: str) -> TokenInfo:
    return TokenInfo(text=text, lemma=lemma, pos=pos, morph="", sentence_index=0)


def sentence(
    episode: int,
    sentence_index: int,
    text: str,
    teaches_lemmas: list[str],
    tokens: list[TokenInfo],
) -> ProcessedSentence:
    return ProcessedSentence(
        id=f"e{episode:02d}_s{sentence_index:03d}",
        episode=episode,
        sentence_index=sentence_index,
        text=text,
        teaches_lemmas=teaches_lemmas,
        score=10.0 - sentence_index,
        tokens=tokens,
    )


def test_limit_generation_episodes_filters_and_caps_without_mutating_selection():
    ep1 = ProcessedEpisode(episode=1, title="Pilot", sentences=[
        sentence(1, 0, "Uno.", ["uno"], []),
        sentence(1, 1, "Dos.", ["dos"], []),
    ])
    ep2 = ProcessedEpisode(episode=2, title="Second", sentences=[
        sentence(2, 0, "Tres.", ["tres"], []),
    ])

    limited = limit_generation_episodes([ep1, ep2], episode_numbers=[1], max_cards_per_episode=1)

    assert len(limited) == 1
    assert limited[0].episode == 1
    assert [s.text for s in limited[0].sentences] == ["Uno."]
    assert len(ep1.sentences) == 2


def test_translations_match_episode_rejects_stale_cache():
    ep = ProcessedEpisode(episode=1, title="Pilot", sentences=[
        sentence(1, 0, "Quiero una casa bonita.", ["querer"], []),
    ])

    matching = [SentencePair(
        chapter=1,
        sentence_index=0,
        source="Quiero una casa bonita.",
        target="Ich moechte ein schoenes Haus.",
    )]
    stale = [SentencePair(
        chapter=1,
        sentence_index=0,
        source="Otra frase.",
        target="Ein anderer Satz.",
    )]

    assert _translations_match_episode(matching, ep) is True
    assert _translations_match_episode(stale, ep) is False


def test_content_hash_matches_audio_manifest_convention():
    assert _content_hash("Hola mundo.") == _content_hash("Hola mundo.")
    assert _content_hash("Hola mundo.") != _content_hash("Otra frase.")


def test_teachable_token_filter_keeps_imageable_content_words():
    assert _is_teachable_token(tok("marido", "marido", "NOUN")) is True
    assert _is_teachable_token(tok("bonita", "bonito", "ADJ")) is True
    assert _is_teachable_token(tok("que", "que", "SCONJ")) is False
    assert _is_teachable_token(tok("ésta", "este", "PRON")) is False
    assert _is_teachable_token(tok("25", "25", "NUM")) is False
    assert _is_teachable_token(tok("sí", "sí", "INTJ")) is False
    assert _is_teachable_token(tok("qué", "qué", "NOUN")) is False
    assert _is_teachable_token(tok("muy", "mucho", "ADV")) is False


def test_slugify_strips_accents_for_stable_asset_keys():
    assert _slugify("año") == "ano"
    assert _slugify("después") == "despues"
    assert _slugify("señal") == "senal"


def test_image_prompt_uses_word_gloss_and_context():
    prompt = _build_image_prompt(
        word_in_context="pintar",
        english_gloss="to paint",
        sentence="Hoy en la escuela tocaba pintar con los dedos.",
        pos="verb",
    )

    assert "paintbrush" in prompt
    assert "canvas" in prompt
    assert "Subtitle context" not in prompt
    assert "Hoy en la escuela" not in prompt
    assert "flashcard" not in prompt
    assert "Spanish word" not in prompt


def test_image_prompt_for_today_avoids_generic_people():
    prompt = _build_image_prompt(
        word_in_context="Hoy",
        english_gloss="today",
        sentence="Hoy en la escuela tocaba pintar con los dedos.",
        pos="adverb",
    )

    assert "morning sunlight" in prompt
    assert "calendar" not in prompt
    assert "Hoy" not in prompt


def test_image_prompt_overrides_text_prone_words():
    prompt = _build_image_prompt(
        word_in_context="señal",
        english_gloss="sign",
        sentence="Esa es la señal.",
        pos="noun",
    )

    assert "radio tower" in prompt
    assert "no signs" in prompt
    assert "señal" not in prompt


def test_word_extraction_uses_only_generation_episode_subset():
    ep1 = ProcessedEpisode(episode=1, title="Pilot", sentences=[
        sentence(
            1,
            0,
            "Quiero una casa bonita.",
            ["querer", "casa", "bonito"],
            [
                tok("Quiero", "querer", "VERB"),
                tok("casa", "casa", "NOUN"),
                tok("bonita", "bonito", "ADJ"),
            ],
        ),
    ])
    ep2 = ProcessedEpisode(episode=2, title="Second", sentences=[
        sentence(
            2,
            0,
            "Como una manzana.",
            ["comer", "manzana"],
            [
                tok("Como", "comer", "VERB"),
                tok("manzana", "manzana", "NOUN"),
            ],
        ),
    ])

    generation_episodes = limit_generation_episodes([ep1, ep2], episode_numbers=[1])
    cards = extract_word_cards(
        all_episodes=generation_episodes,
        translations={"ch01_s00": "Ich moechte ein schoenes Haus."},
        llm=FakeEnrichmentLLM(),
        verbose=False,
    )

    assert {card["episode"] for card in cards} == {1}
    assert {card["lemma"] for card in cards} == {"querer", "casa", "bonito"}
    assert all(card["sentence_translation"] == "Ich moechte ein schoenes Haus." for card in cards)
    assert all("_____" in card["sentence"] for card in cards)
    querer = next(card for card in cards if card["lemma"] == "querer")
    casa = next(card for card in cards if card["lemma"] == "casa")
    assert querer["german_hint"] == "wollen"
    assert querer["german_hint_general"] == "moegen"
    assert casa["image_prompt"] == "a small cozy house on a quiet street, no text"
