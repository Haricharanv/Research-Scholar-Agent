"""
Unified LLM Provider Abstraction
Supports: Ollama (local), Groq, Google Gemini, OpenRouter
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
# Ollama (Local)
# ──────────────────────────────────────────────

class OllamaProvider(LLMProvider):
    name = "ollama"
    requires_api_key = False

    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url

    def generate(self, prompt: str, system: str = "", json_mode: bool = False, model: str = "phi3:mini") -> str:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
        }
        if system:
            payload["system"] = system
        if json_mode:
            payload["format"] = "json"

        try:
            resp = requests.post(f"{self.base_url}/api/generate", json=payload, timeout=120)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
        except requests.ConnectionError:
            return "[Error] Ollama is not running. Start it with `ollama serve`."
        except Exception as e:
            return f"[Error] Ollama: {str(e)}"

    def generate_stream(self, prompt: str, system: str = "", model: str = "phi3:mini") -> Generator[str, None, None]:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": True,
        }
        if system:
            payload["system"] = system

        try:
            with requests.post(f"{self.base_url}/api/generate", json=payload, stream=True, timeout=120) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        data = json.loads(line)
                        if "response" in data:
                            yield data["response"]
        except requests.ConnectionError:
            yield "[Error] Ollama is not running. Start it with `ollama serve`."
        except Exception as e:
            yield f"[Error] Ollama: {str(e)}"

    def list_models(self) -> List[Dict[str, str]]:
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            resp.raise_for_status()
            models = resp.json().get("models", [])
            return [{"id": m["name"], "name": m["name"]} for m in models]
        except Exception:
            return [
                {"id": "phi3:mini", "name": "Phi-3 Mini"},
                {"id": "llama3.2:3b", "name": "Llama 3.2 3B"},
            ]

    def is_available(self) -> bool:
        try:
            requests.get(f"{self.base_url}/api/tags", timeout=2)
            return True
        except Exception:
            return False


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
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B"},
        {"id": "gemma2-9b-it", "name": "Gemma 2 9B"},
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
            "contents": [{"parts": [{"text": prompt}]}],
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
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
            "contents": [{"parts": [{"text": prompt}]}],
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

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
# OpenRouter (Free Cloud — multi-model gateway)
# ──────────────────────────────────────────────

class OpenRouterProvider(LLMProvider):
    name = "openrouter"
    requires_api_key = True

    API_URL = "https://openrouter.ai/api/v1/chat/completions"

    # Free models on OpenRouter (updated May 2026)
    MODELS = [
        {"id": "deepseek/deepseek-v4-flash:free", "name": "DeepSeek V4 Flash (Free)"},
        {"id": "qwen/qwen3-coder:free", "name": "Qwen 3 Coder (Free)"},
        {"id": "google/gemma-4-31b-it:free", "name": "Gemma 4 31B (Free)"},
        {"id": "nvidia/nemotron-3-super-120b-a12b:free", "name": "Nemotron 3 Super 120B (Free)"},
        {"id": "moonshotai/kimi-k2.6:free", "name": "Kimi K2.6 (Free)"},
        {"id": "openai/gpt-oss-120b:free", "name": "GPT-OSS 120B (Free)"},
        {"id": "minimax/minimax-m2.5:free", "name": "MiniMax M2.5 (Free)"},
    ]

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY", "")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Research Scholar Agent",
        }

    def generate(self, prompt: str, system: str = "", json_mode: bool = False, model: str = "deepseek/deepseek-v4-flash:free") -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            resp = requests.post(self.API_URL, headers=self._headers(), json=payload, timeout=90)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except requests.HTTPError as e:
            error_detail = ""
            try:
                error_detail = e.response.json().get("error", {}).get("message", str(e))
            except Exception:
                error_detail = str(e)
            return f"[Error] OpenRouter API: {error_detail}"
        except Exception as e:
            return f"[Error] OpenRouter: {str(e)}"

    def generate_stream(self, prompt: str, system: str = "", model: str = "deepseek/deepseek-v4-flash:free") -> Generator[str, None, None]:
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
            with requests.post(self.API_URL, headers=self._headers(), json=payload, stream=True, timeout=90) as r:
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
            yield f"[Error] OpenRouter API: {error_detail}"
        except Exception as e:
            yield f"[Error] OpenRouter: {str(e)}"

    def list_models(self) -> List[Dict[str, str]]:
        return self.MODELS

    def is_available(self) -> bool:
        return bool(self.api_key)


# ──────────────────────────────────────────────
# Provider Registry
# ──────────────────────────────────────────────

class ProviderRegistry:
    """Manages all available LLM providers."""

    # Preferred order: cloud providers first, Ollama last
    PREFERRED_ORDER = ["groq", "gemini", "openrouter", "ollama"]

    def __init__(self):
        self.providers: Dict[str, LLMProvider] = {}
        self.active_provider_name: str = ""
        self.active_model: str = ""
        self._register_defaults()
        self._auto_select_provider()

    def _register_defaults(self):
        self.providers["ollama"] = OllamaProvider()
        self.providers["groq"] = GroqProvider()
        self.providers["gemini"] = GeminiProvider()
        self.providers["openrouter"] = OpenRouterProvider()

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
        # Fallback to ollama even if offline
        self.active_provider_name = "ollama"
        self.active_model = "phi3:mini"
        print("[ProviderRegistry] WARNING: No providers available, defaulting to ollama")

    def get_active(self) -> LLMProvider:
        return self.providers.get(self.active_provider_name, self.providers["ollama"])

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
        """Generate with automatic retry on rate-limit (429)."""
        import time
        provider = self.get_active()
        max_retries = 3
        for attempt in range(max_retries):
            result = provider.generate(prompt, system=system, json_mode=json_mode, model=self.active_model)
            if "429" in result and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)  # 2s, 4s
                print(f"[ProviderRegistry] Rate limited, retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
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

