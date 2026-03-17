"""LLM clients for OpenRouter and Google Gemini with retry and JSON mode support."""

import json
import re
import sys
import time
from dataclasses import dataclass

import httpx
import json_repair

# Allow arbitrarily large integers in JSON responses from LLMs.
# Python 3.11+ limits int↔str conversion to 4300 digits (CVE-2020-10735),
# but models occasionally return huge numbers in JSON output.
sys.set_int_max_str_digits(0)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"



@dataclass
class Usage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float | None = None
    generation_id: str | None = None


@dataclass
class LLMResponse:
    content: str
    usage: Usage
    parsed: dict | list | None = None


def _parse_json_robust(text: str) -> dict | list:
    """Parse JSON from LLM output, handling thinking tags, markdown fences, etc."""
    if not text or not text.strip():
        raise ValueError("LLM returned empty content — cannot parse JSON")

    # Strip <think>...</think> blocks (Qwen 3.5, DeepSeek R1, etc.)
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Strip markdown code fences
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Deterministic repair: fix trailing commas, unquoted keys, missing delimiters, etc.
    try:
        repaired = json_repair.loads(cleaned)
        if isinstance(repaired, (dict, list)):
            return repaired
    except Exception:
        pass

    # Fallback: extract outermost JSON object by brace-matching
    start = cleaned.find("{")
    if start == -1:
        raise json.JSONDecodeError(
            f"No JSON object found in LLM output (first 200 chars): {text[:200]}", text, 0
        )
    depth = 0
    in_string = False
    escape_next = False
    end = start
    for i, ch in enumerate(cleaned[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    return json.loads(cleaned[start : end + 1])


class LLMClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_retries: int = 3,
        transport: httpx.BaseTransport | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._max_retries = max_retries
        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _call(self, messages: list[dict], response_format: dict | None = None) -> LLMResponse:
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(OPENROUTER_URL, json=payload, headers=headers)
            if response.status_code == 429:
                # Rate-limited — back off using Retry-After header or exponential delay
                retry_after = int(response.headers.get("retry-after", 2 * (attempt + 1)))
                last_error = response
                if attempt < self._max_retries - 1:
                    time.sleep(retry_after)
                    continue
            if response.status_code < 500:
                response.raise_for_status()
                break
            last_error = response
            if attempt < self._max_retries - 1:
                time.sleep(1 * (attempt + 1))
        else:
            if last_error:
                last_error.raise_for_status()

        data = response.json()
        if "choices" not in data or not data["choices"]:
            error_msg = data.get("error", {}).get("message", str(data))
            raise RuntimeError(f"OpenRouter returned no choices: {error_msg}")
        message = data["choices"][0]["message"]
        content = message.get("content") or ""
        # Thinking models may put output in reasoning_content or reasoning field
        if not content:
            content = message.get("reasoning_content") or message.get("reasoning") or ""
        generation_id = data.get("id")
        usage_data = data.get("usage", {})
        # OpenRouter returns cost inline in the usage object
        cost_usd = usage_data.get("cost")
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
            cost_usd=cost_usd,
            generation_id=generation_id,
        )
        return LLMResponse(content=content, usage=usage)

    def complete(self, prompt: str, system: str | None = None) -> LLMResponse:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return self._call(messages)

    def complete_json(
        self, prompt: str, system: str | None = None, response_schema: dict | None = None
    ) -> LLMResponse:
        response_format = {"type": "json_object"}
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        last_err = None
        for attempt in range(self._max_retries):
            result = self._call(messages, response_format=response_format)
            try:
                result.parsed = _parse_json_robust(result.content)
                return result
            except (json.JSONDecodeError, ValueError) as e:
                last_err = e
                if attempt < self._max_retries - 1:
                    time.sleep(1 * (attempt + 1))
        raise last_err


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiClient:
    """Direct Google Gemini API client with the same interface as LLMClient."""

    def __init__(
        self,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_retries: int = 3,
        transport: httpx.BaseTransport | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._max_retries = max_retries
        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _call(
        self,
        contents: list[dict],
        system_instruction: dict | None = None,
        generation_config: dict | None = None,
    ) -> LLMResponse:
        url = f"{GEMINI_BASE_URL}/{self._model}:generateContent"

        payload: dict = {"contents": contents}
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        gen_config = {"temperature": self._temperature}
        if generation_config:
            gen_config.update(generation_config)
        payload["generationConfig"] = gen_config

        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(url, json=payload, headers=headers)
            if response.status_code < 500:
                response.raise_for_status()
                break
            last_error = response
            if attempt < self._max_retries - 1:
                time.sleep(1 * (attempt + 1))
        else:
            if last_error:
                last_error.raise_for_status()

        data = response.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage_data = data.get("usageMetadata", {})
        usage = Usage(
            prompt_tokens=usage_data.get("promptTokenCount", 0),
            completion_tokens=usage_data.get("candidatesTokenCount", 0),
            total_tokens=usage_data.get("totalTokenCount", 0),
        )
        return LLMResponse(content=content, usage=usage)

    def complete(self, prompt: str, system: str | None = None) -> LLMResponse:
        system_instruction = None
        if system:
            system_instruction = {"parts": [{"text": system}]}
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        return self._call(contents, system_instruction=system_instruction)

    def complete_json(
        self, prompt: str, system: str | None = None, response_schema: dict | None = None
    ) -> LLMResponse:
        system_instruction = None
        if system:
            system_instruction = {"parts": [{"text": system}]}
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        generation_config = {"responseMimeType": "application/json"}
        last_err = None
        for attempt in range(self._max_retries):
            result = self._call(
                contents,
                system_instruction=system_instruction,
                generation_config=generation_config,
            )
            try:
                result.parsed = _parse_json_robust(result.content)
                return result
            except (json.JSONDecodeError, ValueError) as e:
                last_err = e
                if attempt < self._max_retries - 1:
                    time.sleep(1 * (attempt + 1))
        raise last_err


def create_client(
    provider: str,
    api_key: str,
    model: str,
    temperature: float = 0.7,
    max_retries: int = 3,
    transport: httpx.BaseTransport | None = None,
) -> LLMClient | GeminiClient:
    """Factory: create the right LLM client based on provider name."""
    if provider == "google":
        return GeminiClient(
            api_key=api_key,
            model=model,
            temperature=temperature,
            max_retries=max_retries,
            transport=transport,
        )
    # Default to OpenRouter for "openrouter" or any other value
    return LLMClient(
        api_key=api_key,
        model=model,
        temperature=temperature,
        max_retries=max_retries,
        transport=transport,
    )
