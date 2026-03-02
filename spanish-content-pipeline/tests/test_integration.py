# tests/test_integration.py
from pathlib import Path

from pipeline.coverage_checker import load_frequency_data


def test_real_frequency_data_loads():
    """Verify the downloaded FrequencyWords file can be loaded."""
    freq_path = Path(__file__).parent.parent / "data" / "frequency" / "es_50k.txt"
    if not freq_path.exists():
        import pytest
        pytest.skip("Frequency data not downloaded yet")

    data = load_frequency_data(freq_path)
    assert len(data) > 40000  # Should be ~50k entries
    assert "de" in data
    assert "estar" in data
    assert data["de"] < data["estar"]  # "de" is more frequent
