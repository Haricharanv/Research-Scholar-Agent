"""
Unified LLM Provider Abstraction
Supports: Groq, Google Gemini
All cloud providers are FREE tier — no credit card required.
"""

import os
import json
import requests
from typing import Generator, Optional, Dict, List, Any
from abc import ABC, abstractmethod


# ──────────────────────────────────────────────
# Base Provider
# ──────────────────────────────────────────────

class LLMProvider(ABC):
    """Abstract base class for all LLM providers."""

    name: str = "base"
    requires_api_key: bool = True

    @abstractmethod
    def generate(self, prompt: str, system: str = "", json_mode: bool = False) -> str:
        """Synchronous generation — used for summarization."""
        ...

    @abstractmethod
    def generate_stream(self, prompt: str, system: str = "") -> Generator[str, None, None]:
        """Streaming generation — used for chat."""
        ...

    @abstractmethod
    def list_models(self) -> List[Dict[str, str]]:
        """Return available models for this provider."""
        ...

    def is_available(self) -> bool:
        """Check if provider is configured (has API key, etc.)."""
        return True





# ──────────────────────────────────────────────
# Groq (Free Cloud — blazing fast)
# ──────────────────────────────────────────────

class GroqProvider(LLMProvider):
    name = "groq"
    requires_api_key = True

    API_URL = "https://api.groq.com/openai/v1/chat/completions"

    # Free models on Groq
    MODELS = [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B"},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B (Fast)"},
        {"id": "qwen/qwen3-32b", "name": "Qwen 3 32B"},
        {"id": "meta-llama/llama-4-scout-17b-16e-instruct", "name": "Llama 4 Scout 17B"},
        {"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B"},
    ]

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY", "")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def generate(self, prompt: str, system: str = "", json_mode: bool = False, model: str = "llama-3.3-70b-versatile") -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            resp = requests.post(self.API_URL, headers=self._headers(), json=payload, timeout=60)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except requests.HTTPError as e:
            error_detail = ""
            try:
                error_detail = e.response.json().get("error", {}).get("message", str(e))
            except Exception:
                error_detail = str(e)
            return f"[Error] Groq API: {error_detail}"
        except Exception as e:
            return f"[Error] Groq: {str(e)}"

    def generate_stream(self, prompt: str, system: str = "", model: str = "llama-3.3-70b-versatile") -> Generator[str, None, None]:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }

        try:
            with requests.post(self.API_URL, headers=self._headers(), json=payload, stream=True, timeout=60) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        text = line.decode("utf-8")
                        if text.startswith("data: "):
                            text = text[6:]
                        if text.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(text)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
        except requests.HTTPError as e:
            error_detail = ""
            try:
                error_detail = e.response.json().get("error", {}).get("message", str(e))
            except Exception:
                error_detail = str(e)
            yield f"[Error] Groq API: {error_detail}"
        except Exception as e:
            yield f"[Error] Groq: {str(e)}"

    def list_models(self) -> List[Dict[str, str]]:
        return self.MODELS

    def is_available(self) -> bool:
        return bool(self.api_key)


# ──────────────────────────────────────────────
# Google Gemini (Free Cloud via AI Studio)
# ──────────────────────────────────────────────

class GeminiProvider(LLMProvider):
    name = "gemini"
    requires_api_key = True

    MODELS = [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
        {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash-Lite"},
    ]

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")

    def _url(self, model: str, stream: bool = False) -> str:
        action = "streamGenerateContent" if stream else "generateContent"
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:{action}?key={self.api_key}"

    def generate(self, prompt: str, system: str = "", json_mode: bool = False, model: str = "gemini-2.5-flash") -> str:
        payload: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        }
        if system:
            payload["systemInstruction"] = {"role": "user", "parts": [{"text": system}]}
        if json_mode:
            payload["generationConfig"] = {"responseMimeType": "application/json"}

        try:
            resp = requests.post(self._url(model, stream=False), json=payload, timeout=90)
            resp.raise_for_status()
            candidates = resp.json().get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                return "".join(p.get("text", "") for p in parts).strip()
            return "[Error] Gemini returned no candidates."
        except requests.HTTPError as e:
            error_detail = ""
            try:
                error_detail = e.response.json().get("error", {}).get("message", str(e))
            except Exception:
                error_detail = str(e)
            return f"[Error] Gemini API: {error_detail}"
        except Exception as e:
            return f"[Error] Gemini: {str(e)}"

    def generate_stream(self, prompt: str, system: str = "", model: str = "gemini-2.5-flash") -> Generator[str, None, None]:
        payload: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        }
        if system:
            payload["systemInstruction"] = {"role": "user", "parts": [{"text": system}]}

        try:
            # Gemini streaming returns newline-delimited JSON array chunks
            with requests.post(
                self._url(model, stream=True) + "&alt=sse",
                json=payload,
                stream=True,
                timeout=90,
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        text = line.decode("utf-8")
                        if text.startswith("data: "):
                            text = text[6:]
                        try:
                            data = json.loads(text)
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for p in parts:
                                    chunk = p.get("text", "")
                                    if chunk:
                                        yield chunk
                        except json.JSONDecodeError:
                            continue
        except requests.HTTPError as e:
            error_detail = ""
            try:
                error_detail = e.response.json().get("error", {}).get("message", str(e))
            except Exception:
                error_detail = str(e)
            yield f"[Error] Gemini API: {error_detail}"
        except Exception as e:
            yield f"[Error] Gemini: {str(e)}"

    def list_models(self) -> List[Dict[str, str]]:
        return self.MODELS

    def is_available(self) -> bool:
        return bool(self.api_key)





# ──────────────────────────────────────────────
# Provider Registry
# ──────────────────────────────────────────────

class ProviderRegistry:
    """Manages all available LLM providers."""

    # Preferred order: cloud providers
    PREFERRED_ORDER = ["gemini", "groq"]

    def __init__(self):
        self.providers: Dict[str, LLMProvider] = {}
        self.active_provider_name: str = ""
        self.active_model: str = ""
        self._register_defaults()
        self._auto_select_provider()

    def _register_defaults(self):
        self.providers["groq"] = GroqProvider()
        self.providers["gemini"] = GeminiProvider()

    def _auto_select_provider(self):
        """Auto-select the first available provider in preferred order."""
        for name in self.PREFERRED_ORDER:
            provider = self.providers.get(name)
            if provider and provider.is_available():
                self.active_provider_name = name
                models = provider.list_models()
                self.active_model = models[0]["id"] if models else ""
                print(f"[ProviderRegistry] Auto-selected: {name} ({self.active_model})")
                return
        # Fallback to gemini even if offline
        self.active_provider_name = "gemini"
        self.active_model = "gemini-2.5-flash"
        print("[ProviderRegistry] WARNING: No providers available, defaulting to gemini")

    def get_active(self) -> LLMProvider:
        return self.providers.get(self.active_provider_name, self.providers["gemini"])

    def set_active(self, provider_name: str, model: str = ""):
        if provider_name in self.providers:
            self.active_provider_name = provider_name
            if model:
                self.active_model = model
            else:
                # Set default model for the provider
                models = self.providers[provider_name].list_models()
                self.active_model = models[0]["id"] if models else ""

    def get_status(self) -> Dict[str, Any]:
        """Return all providers with their availability and models."""
        result = {}
        for name in self.PREFERRED_ORDER:
            provider = self.providers[name]
            available = provider.is_available()
            result[name] = {
                "name": name,
                "available": available,
                "requires_api_key": provider.requires_api_key,
                "models": provider.list_models() if available else [],
            }
        return result

    def generate(self, prompt: str, system: str = "", json_mode: bool = False) -> str:
        """Generate with automatic retry on rate-limit (429) or high demand (503)."""
        import time
        provider = self.get_active()
        max_retries = 3
        for attempt in range(max_retries):
            result = provider.generate(prompt, system=system, json_mode=json_mode, model=self.active_model)
            if ("[Error]" in result) and attempt < max_retries - 1:
                # Retry on rate limits or service unavailability
                if "429" in result or "503" in result or "high demand" in result.lower():
                    wait = 2 ** (attempt + 1)  # 2s, 4s
                    print(f"[ProviderRegistry] API unavailable, retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait)
                    continue
            return result
        return result

    def generate_stream(self, prompt: str, system: str = "") -> Generator[str, None, None]:
        """Stream with automatic retry on rate-limit (429)."""
        import time
        provider = self.get_active()
        max_retries = 3
        for attempt in range(max_retries):
            chunks = []
            hit_rate_limit = False
            for chunk in provider.generate_stream(prompt, system=system, model=self.active_model):
                if "429" in chunk and not chunks:
                    # Rate limited on first chunk — retry
                    hit_rate_limit = True
                    break
                chunks.append(chunk)
                yield chunk
            if not hit_rate_limit or attempt >= max_retries - 1:
                return
            wait = 2 ** (attempt + 1)
            print(f"[ProviderRegistry] Rate limited (stream), retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
            time.sleep(wait)

