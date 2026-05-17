"""LangChain tools for deep agents.

Wraps existing search functionality into tool-callable functions
suitable for use with ``deepagents`` or LangChain tool binding.
"""

from __future__ import annotations

from langchain_core.tools import tool

from neobee.core.search import search as _search


@tool
async def web_search_tool(query: str, num_results: int = 5) -> str:
    """Search the web for the given query.

    Uses the configured search provider (DuckDuckGo, Tavily, or LLM-simulated).

    Args:
        query: The search query string.
        num_results: Number of results to return (default 5, max 10).

    Returns:
        Formatted search results with title, URL, and snippet for each result.
    """
    response = _search(query, num_results=min(num_results, 10))
    if not response.results:
        return "No search results found."

    lines: list[str] = [f"Search results for: {query}", ""]
    for i, r in enumerate(response.results, 1):
        lines.append(f"{i}. {r.title}")
        lines.append(f"   URL: {r.url}")
        lines.append(f"   {r.snippet}")
        lines.append("")
    return "\n".join(lines)


@tool
async def fetch_url_tool(url: str) -> str:
    """Fetch and extract the plain text content from a URL.

    Args:
        url: The full URL to fetch.

    Returns:
        Up to 5000 characters of extracted text content.
    """
    try:
        import httpx
        response = httpx.get(url, follow_redirects=True, timeout=30.0)
        response.raise_for_status()
    except Exception as e:
        return f"Failed to fetch URL: {e}"

    text = response.text
    # Simple HTML tag stripping
    import re
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 5000:
        text = text[:5000] + "\n\n[...content truncated at 5000 characters]"
    return text