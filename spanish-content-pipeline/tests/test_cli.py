# tests/test_cli.py
import subprocess
import sys


def test_run_all_help():
    """Verify the CLI entry point is importable and shows help."""
    result = subprocess.run(
        [sys.executable, "-m", "scripts.run_all", "--help"],
        capture_output=True,
        text=True,
        cwd=".",  # from spanish-content-pipeline/
    )
    assert result.returncode == 0
    assert "--config" in result.stdout
