"""Compress audio (WAV/MP3 → AAC/m4a) and images (PNG/JPEG → WebP) via ffmpeg.

Speech-quality AAC at 32kbps mono is indistinguishable from PCM for vocabulary
audio and is ~10x smaller. WebP at quality 80 matches PNG visually for content
imagery and is ~12x smaller. Both formats are natively supported by iOS
AVPlayer / expo-audio, so no app-side decoder change is needed.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

AUDIO_TARGET_EXT = ".m4a"
AUDIO_BITRATE = "32k"
AUDIO_SOURCE_EXTS = {".wav", ".mp3"}

IMAGE_TARGET_EXT = ".webp"
IMAGE_QUALITY = "80"
IMAGE_SOURCE_EXTS = {".png", ".jpg", ".jpeg"}


class CompressionError(RuntimeError):
    """Raised when ffmpeg fails. Surface to caller — never silently fall back."""


def _require_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise CompressionError(
            "ffmpeg is required for asset compression but was not found in PATH. "
            "Install with: apt install ffmpeg (Linux) or brew install ffmpeg (macOS)."
        )


def _run_ffmpeg(args: list[str], src: Path) -> None:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise CompressionError(
            f"ffmpeg failed for {src} (exit {result.returncode}):\n{result.stderr.strip()}"
        )


def compress_audio(src: Path, dst: Path | None = None) -> Path:
    """Encode src as AAC/m4a at 32kbps mono. Returns destination path.

    Idempotent: skips re-encoding if dst exists and is at least as new as src.
    """
    _require_ffmpeg()
    if dst is None:
        dst = src.with_suffix(AUDIO_TARGET_EXT)
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime and dst != src:
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    _run_ffmpeg([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(src),
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        "-ac", "1",
        str(dst),
    ], src)
    return dst


def compress_image(src: Path, dst: Path | None = None) -> Path:
    """Encode src as WebP at quality 80. Returns destination path.

    Idempotent: skips re-encoding if dst exists and is at least as new as src.
    """
    _require_ffmpeg()
    if dst is None:
        dst = src.with_suffix(IMAGE_TARGET_EXT)
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime and dst != src:
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    _run_ffmpeg([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(src),
        "-c:v", "libwebp",
        "-quality", IMAGE_QUALITY,
        str(dst),
    ], src)
    return dst


def normalize_audio(src: Path) -> Path:
    """Ensure src is in target format; encode and remove the original if not.

    Returns the path of the canonical (possibly newly-created) audio file.
    Used by audio_generator after writing fresh TTS output, and by the resume
    pass to upgrade legacy WAV/MP3 files in place.
    """
    if src.suffix.lower() == AUDIO_TARGET_EXT:
        return src
    if src.suffix.lower() not in AUDIO_SOURCE_EXTS:
        return src  # Unknown format — leave it alone, don't lose data
    dst = compress_audio(src)
    if dst != src and src.exists():
        src.unlink()
    return dst


def normalize_image(src: Path) -> Path:
    """Ensure src is in target format; encode and remove the original if not."""
    if src.suffix.lower() == IMAGE_TARGET_EXT:
        return src
    if src.suffix.lower() not in IMAGE_SOURCE_EXTS:
        return src
    dst = compress_image(src)
    if dst != src and src.exists():
        src.unlink()
    return dst
