"""One-shot: compress existing output/ assets in place and update manifests.

Walks every successful entry in audio_manifest.json / image_manifest.json,
re-encodes files in legacy formats (WAV/MP3/PNG/JPEG) to the pipeline's target
formats (m4a/webp), removes the originals, and rewrites the manifest so its
`file` paths point to the new extensions. Idempotent — running it twice does
nothing the second time.

Usage:
    uv run python scripts/compress_existing_assets.py [deck_id ...]

Without arguments, processes every deck under output/.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow `from pipeline.asset_compressor import ...` when invoked from any cwd.
SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PIPELINE_ROOT))

from pipeline.asset_compressor import (  # noqa: E402
    AUDIO_TARGET_EXT,
    IMAGE_TARGET_EXT,
    normalize_audio,
    normalize_image,
)

OUTPUT_ROOT = PIPELINE_ROOT / "output"


def _process_manifest(
    manifest_path: Path,
    asset_key: str,
    target_ext: str,
    normalizer,
) -> tuple[int, int, int]:
    """Returns (total, upgraded, skipped) counts."""
    if not manifest_path.exists():
        return (0, 0, 0)

    data = json.loads(manifest_path.read_text())
    entries = data.get(asset_key, {})
    deck_dir = manifest_path.parent

    total = upgraded = skipped = 0
    for key, entry in entries.items():
        total += 1
        if entry.get("status") != "success" or not entry.get("file"):
            skipped += 1
            continue

        abs_path = deck_dir / entry["file"]
        if not abs_path.exists():
            skipped += 1
            continue

        if abs_path.suffix.lower() == target_ext:
            skipped += 1
            continue

        new_path = normalizer(abs_path)
        new_rel = new_path.relative_to(deck_dir).as_posix()
        entry["file"] = new_rel
        upgraded += 1

    if upgraded:
        manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    return (total, upgraded, skipped)


def process_deck(deck_id: str) -> None:
    deck_dir = OUTPUT_ROOT / deck_id
    if not deck_dir.is_dir():
        print(f"[skip] {deck_id}: no output directory at {deck_dir}")
        return

    print(f"\n=== {deck_id} ===")

    audio_manifest = deck_dir / "audio_manifest.json"
    a_total, a_upgraded, a_skipped = _process_manifest(
        audio_manifest, "audio", AUDIO_TARGET_EXT, normalize_audio
    )
    print(f"  audio:  {a_upgraded} upgraded / {a_skipped} skipped / {a_total} total")

    image_manifest = deck_dir / "image_manifest.json"
    i_total, i_upgraded, i_skipped = _process_manifest(
        image_manifest, "images", IMAGE_TARGET_EXT, normalize_image
    )
    print(f"  images: {i_upgraded} upgraded / {i_skipped} skipped / {i_total} total")


def main() -> None:
    if len(sys.argv) > 1:
        decks = sys.argv[1:]
    else:
        decks = sorted(p.name for p in OUTPUT_ROOT.iterdir() if p.is_dir())
        print(f"Processing all decks under {OUTPUT_ROOT}: {decks}")

    for deck_id in decks:
        process_deck(deck_id)


if __name__ == "__main__":
    main()
