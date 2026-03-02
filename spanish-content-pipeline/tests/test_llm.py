# tests/test_llm.py
import json

import httpx
import pytest

from pipeline.llm import LLMClient, LLMResponse


def make_mock_response(content: str, status: int = 200) -> httpx.Response:
    body = {
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
    }
    return httpx.Response(status, json=body)


class MockTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response):
        self._response = response

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self._response


def test_llm_client_returns_text():
    mock = make_mock_response("Hola, soy Charlotte.")
    client = LLMClient(
        api_key="test-key",
        model="test/model",
        transport=MockTransport(mock),
    )
    result = client.complete("Write a greeting")
    assert result.content == "Hola, soy Charlotte."
    assert result.usage.total_tokens == 30


def test_llm_client_returns_json():
    data = [{"spanish": "Hola", "german": "Hallo"}]
    mock = make_mock_response(json.dumps(data))
    client = LLMClient(
        api_key="test-key",
        model="test/model",
        transport=MockTransport(mock),
    )
    result = client.complete_json("Translate", response_schema=None)
    assert result.parsed == data


def test_llm_client_retries_on_500():
    """Client should retry on server errors up to max_retries."""
    call_count = 0

    class RetryTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return httpx.Response(500, json={"error": "server error"})
            return make_mock_response("Success")

    client = LLMClient(
        api_key="test-key",
        model="test/model",
        max_retries=3,
        transport=RetryTransport(),
    )
    result = client.complete("Test retry")
    assert result.content == "Success"
    assert call_count == 3


def test_llm_client_raises_after_max_retries():
    class AlwaysFailTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"error": "server error"})

    client = LLMClient(
        api_key="test-key",
        model="test/model",
        max_retries=2,
        transport=AlwaysFailTransport(),
    )
    with pytest.raises(httpx.HTTPStatusError):
        client.complete("Will fail")
