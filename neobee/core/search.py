from __future__ import annotations

from typing import Optional

import httpx
from duckduckgo_search import DDGS
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from neobee.core.config import get_config
from neobee.core.llm import get_llm


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str


class SearchResponse(BaseModel):
    results: list[SearchResult] = Field(default_factory=list)


# ── DuckDuckGo ───────────────────────────────────────────────────────────────

def search_duckduckgo(query: str, num_results: int = 5) -> SearchResponse:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num_results))
        return SearchResponse(
            results=[
                SearchResult(title=r.get("title", ""), url=r.get("href", ""), snippet=r.get("body", ""))
                for r in results[:num_results] if r.get("title")
            ]
        )
    except Exception:
        return SearchResponse(results=[])


# ── Tavily ───────────────────────────────────────────────────────────────────

def search_tavily(query: str, api_key: str, num_results: int = 5) -> SearchResponse:
    try:
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={"api_key": api_key, "query": query, "max_results": num_results, "include_answer": False},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return SearchResponse(
            results=[
                SearchResult(title=r.get("title", ""), url=r.get("url", ""), snippet=r.get("content", ""))
                for r in data.get("results", [])[:num_results]
            ]
        )
    except Exception:
        return SearchResponse(results=[])


# ── LLM-based "search" (simulated) ───────────────────────────────────────────

class LLMSearchOutput(BaseModel):
    results: list[SearchResult] = Field(default_factory=list)


def search_llm(query: str, num_results: int = 5) -> SearchResponse:
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a search simulator. Given a user query, generate {num_results} realistic simulated search results with title, URL, and snippet."),
        ("human", "{query}"),
    ])
    chain = prompt | get_llm("default").with_structured_output(LLMSearchOutput)
    try:
        result = chain.invoke({"query": query, "num_results": num_results})
        return SearchResponse(results=result.results[:num_results])
    except Exception:
        return SearchResponse(results=[])


# ── Factory ──────────────────────────────────────────────────────────────────

def search(query: str, provider: Optional[str] = None, api_key: Optional[str] = None, num_results: int = 5) -> SearchResponse:
    """Perform a search using the configured or specified provider."""
    if provider is None:
        cfg = get_config()
        provider = cfg.search_provider
        api_key = api_key or cfg.search_api_key

    if provider == "tavily":
        if not api_key:
            return SearchResponse(results=[])
        return search_tavily(query, api_key, num_results)
    elif provider == "llm":
        return search_llm(query, num_results)
    else:
        return search_duckduckgo(query, num_results)