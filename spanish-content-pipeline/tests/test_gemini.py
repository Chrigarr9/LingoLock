# tests/test_gemini.py
import json

import httpx
import pytest

from pipeline.llm import GeminiClient, LLMResponse


def make_gemini_response(text: str, status: int = 200) -> httpx.Response:
    body = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": text}],
                    "role": "model",
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 10,
            "candidatesTokenCount": 20,
            "totalTokenCount": 30,
        },
    }
    return httpx.Response(status, json=body)


class MockTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response):
        self._response = response

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self._response


def test_gemini_client_returns_text():
    mock = make_gemini_response("Hola, soy Charlotte.")
    client = GeminiClient(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        transport=MockTransport(mock),
    )
    result = client.complete("Write a greeting")
    assert result.content == "Hola, soy Charlotte."
    assert result.usage.total_tokens == 30


def test_gemini_client_returns_json():
    data = [{"spanish": "Hola", "german": "Hallo"}]
    mock = make_gemini_response(json.dumps(data))
    client = GeminiClient(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        transport=MockTransport(mock),
    )
    result = client.complete_json("Translate", response_schema=None)
    assert result.parsed == data


def test_gemini_client_sends_correct_url():
    """Verify the request goes to the correct Gemini endpoint."""
    captured_request = None

    class CapturingTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            nonlocal captured_request
            captured_request = request
            return make_gemini_response("ok")

    client = GeminiClient(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        transport=CapturingTransport(),
    )
    client.complete("Hello")

    assert captured_request is not None
    url = str(captured_request.url)
    assert "generativelanguage.googleapis.com" in url
    assert "gemini-2.5-flash-lite" in url
    assert "generateContent" in url


def test_gemini_client_sends_system_instruction():
    """Verify system prompt is sent as systemInstruction."""
    captured_body = None

    class CapturingTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            nonlocal captured_body
            captured_body = json.loads(request.content)
            return make_gemini_response("ok")

    client = GeminiClient(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        transport=CapturingTransport(),
    )
    client.complete("Hello", system="You are a translator")

    assert captured_body is not None
    assert "systemInstruction" in captured_body
    assert captured_body["systemInstruction"]["parts"][0]["text"] == "You are a translator"


def test_gemini_client_retries_on_500():
    call_count = 0

    class RetryTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return httpx.Response(500, json={"error": "server error"})
            return make_gemini_response("Success")

    client = GeminiClient(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        max_retries=3,
        transport=RetryTransport(),
    )
    result = client.complete("Test retry")
    assert result.content == "Success"
    assert call_count == 3


def test_gemini_client_raises_after_max_retries():
    class AlwaysFailTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"error": "server error"})

    client = GeminiClient(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        max_retries=2,
        transport=AlwaysFailTransport(),
    )
    with pytest.raises(httpx.HTTPStatusError):
        client.complete("Will fail")
