"""Compare image models using prompts from image_prompts.json.

Usage:
  uv run python scripts/compare_images_flux.py
  uv run python scripts/compare_images_flux.py --model black-forest-labs/FLUX.1-krea-dev
  uv run python scripts/compare_images_flux.py --model black-forest-labs/FLUX.1.1-pro
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

TOGETHER_API_KEY = os.environ.get("TOGETHER_API_KEY")
if not TOGETHER_API_KEY:
    print("Error: TOGETHER_API_KEY not set")
    sys.exit(1)

parser = argparse.ArgumentParser()
parser.add_argument(
    "--model",
    default="black-forest-labs/FLUX.1-schnell",
    help="Together.ai model ID to use for generation",
)
args = parser.parse_args()

# Derive a filesystem-safe directory name from the model slug
model_slug = args.model.split("/")[-1].lower().replace(".", "-")
PIPELINE_DIR = Path("output/es-de-buenos-aires")
PROMPTS_FILE = PIPELINE_DIR / "image_prompts.json"
OUT_DIR = PIPELINE_DIR / f"images_{model_slug}"
OUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"Model:  {args.model}")
print(f"Output: {OUT_DIR}\n")

prompts = json.loads(PROMPTS_FILE.read_text())["sentences"]
print(f"Found {len(prompts)} image prompts\n")

client = httpx.Client(timeout=120.0)

for p in prompts:
    ch = str(p["chapter"]).zfill(2)
    si = str(p["sentence_index"]).zfill(2)
    key = f"ch{ch}_s{si}"
    out_path = OUT_DIR / f"{key}.webp"

    if out_path.exists():
        print(f"  {key} — already exists, skipping")
        continue

    print(f"  Generating {key}...", end=" ", flush=True)
    response = client.post(
        "https://api.together.xyz/v1/images/generations",
        json={
            "model": args.model,
            "prompt": p["prompt"],
            "width": 768,
            "height": 512,
            "response_format": "b64_json",
        },
        headers={"Authorization": f"Bearer {TOGETHER_API_KEY}"},
    )
    if response.status_code != 200:
        print(f"FAILED ({response.status_code}: {response.text[:100]})")
        continue

    img_bytes = base64.b64decode(response.json()["data"][0]["b64_json"])
    out_path.write_bytes(img_bytes)
    print(f"saved → {out_path.name}")

print(f"\nDone. Output saved to: {OUT_DIR}/")
print(f"Compare against Gemini: {PIPELINE_DIR}/images/")
