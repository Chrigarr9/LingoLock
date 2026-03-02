# tests/test_create_client.py
from pipeline.llm import LLMClient, GeminiClient, create_client


def test_create_client_openrouter():
    client = create_client(provider="openrouter", api_key="k", model="m")
    assert isinstance(client, LLMClient)


def test_create_client_google():
    client = create_client(provider="google", api_key="k", model="m")
    assert isinstance(client, GeminiClient)


def test_create_client_default_is_openrouter():
    client = create_client(provider="unknown", api_key="k", model="m")
    assert isinstance(client, LLMClient)
