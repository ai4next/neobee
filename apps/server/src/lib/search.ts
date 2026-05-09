import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';
import { getLLM } from './llm.js';

export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  publishedDate: z.string().optional()
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  query: z.string()
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export type SearchProvider = 'tavily' | 'duckduckgo' | 'llm';

export interface SearchTool {
  search(query: string, numResults?: number): Promise<SearchResponse>;
}

class TavilySearchTool implements SearchTool {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    if (!this.apiKey) {
      console.warn('TAVILY_API_KEY not set, search will return empty results');
    }
  }

  async search(query: string, numResults: number = 10): Promise<SearchResponse> {
    if (!this.apiKey) {
      return { results: [], query };
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          max_results: numResults
        })
      });

      if (!response.ok) {
        console.error('Tavily search failed:', response.status);
        return { results: [], query };
      }

      const data = await response.json();

      return {
        query,
        results: (data.results || []).map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          content: r.content || '',
          publishedDate: r.published_date
        }))
      };
    } catch (error) {
      console.error('Tavily search error:', error);
      return { results: [], query };
    }
  }
}

class DuckDuckGoSearchTool implements SearchTool {
  private tool: DuckDuckGoSearch;

  constructor(maxResults: number = 10) {
    this.tool = new DuckDuckGoSearch({ maxResults });
  }

  async search(query: string, numResults: number = 10): Promise<SearchResponse> {
    try {
      if (numResults !== 10) {
        this.tool = new DuckDuckGoSearch({ maxResults: numResults });
      }

      const results = await this.tool.invoke(query);
      const parsed = JSON.parse(results);

      return {
        query,
        results: parsed.map((r: any) => ({
          title: r.title || '',
          url: r.link || r.url || '',
          content: r.snippet || r.content || ''
        }))
      };
    } catch (error) {
      console.error('DuckDuckGo search error:', error);
      return { results: [], query };
    }
  }
}

class LLMSearchTool implements SearchTool {
  private fallbackContent: SearchResponse | null = null;

  async search(query: string, numResults: number = 10): Promise<SearchResponse> {
    try {
      const llm = getLLM();
      const schema = z.object({
        results: z.array(z.object({
          title: z.string().describe('Title of the search result'),
          url: z.string().describe('URL or web address of the source'),
          content: z.string().describe('A 2-3 sentence content summary or excerpt'),
          publishedDate: z.string().optional().describe('Publication or last updated date if known')
        })).describe('Search results generated from LLM knowledge')
      });

      const prompt = PromptTemplate.fromTemplate(
        `You are a search engine. Based on your training data, generate realistic search results for the given query.

Query: {query}
Number of results needed: {numResults}

Only include information you are confident about. If you lack knowledge about the topic, return an empty results array.`
      );

      const chain = prompt.pipe(llm.withStructuredOutput(schema));
      const result = await chain.invoke({ query, numResults: String(numResults) }) as { results: SearchResult[] };

      return {
        query,
        results: (result.results || []).slice(0, numResults)
      };
    } catch (error) {
      console.error('LLM search error:', error);
      if (this.fallbackContent) {
        return this.fallbackContent;
      }
      return { results: [], query };
    }
  }

  setFallbackResponse(response: SearchResponse): void {
    this.fallbackContent = response;
  }
}

let searchToolInstance: SearchTool | null = null;
let currentProvider: string | null = null;

export function getSearchTool(provider?: SearchProvider, apiKey?: string): SearchTool {
  const useProvider = provider || (process.env.SEARCH_PROVIDER as SearchProvider) || 'duckduckgo';
  const cacheKey = `${useProvider}:${apiKey || ''}`;

  if (!searchToolInstance || currentProvider !== cacheKey) {
    if (useProvider === 'duckduckgo') {
      searchToolInstance = new DuckDuckGoSearchTool();
    } else if (useProvider === 'llm') {
      searchToolInstance = new LLMSearchTool();
    } else {
      searchToolInstance = new TavilySearchTool(apiKey);
    }
    currentProvider = cacheKey;
  }

  return searchToolInstance;
}
