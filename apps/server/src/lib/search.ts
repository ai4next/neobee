import { z } from 'zod';
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

export type SearchProvider = 'tavily' | 'duckduckgo' | 'llm' | 'mock';

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

class MockSearchTool implements SearchTool {
  private mockData: Map<string, SearchResult[]>;

  constructor() {
    this.mockData = new Map();
    this.initDefaultData();
  }

  private initDefaultData(): void {
    const defaultResults: SearchResult[] = [
      {
        title: 'Wikipedia - Main Page',
        url: 'https://en.wikipedia.org/wiki/Main_Page',
        content: 'The free encyclopedia that anyone can edit. Wikipedia is a multilingual free-content online encyclopedia.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'BBC News - Latest Headlines',
        url: 'https://www.bbc.com/news',
        content: 'BBC News is an operational business division of the British Broadcasting Corporation responsible for gathering and broadcasting news and world service.',
        publishedDate: '2026-05-01'
      },
      {
        title: 'GitHub',
        url: 'https://github.com',
        content: 'GitHub is where over 100 million developers shape the future of software, together. Contribute to open source projects and build your career.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org',
        content: 'The MDN Web Docs site provides information about Open Web technologies including HTML, CSS, JavaScript, and APIs for building web applications.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Stack Overflow',
        url: 'https://stackoverflow.com',
        content: 'Stack Overflow is a question and answer site for professional and enthusiast programmers. Get help with code, debug issues, and share knowledge.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Nature Journal',
        url: 'https://www.nature.com',
        content: 'Nature is a British weekly scientific journal publishing peer-reviewed research in all fields of science and technology.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'MIT Technology Review',
        url: 'https://www.technologyreview.com',
        content: 'MIT Technology Review is a magazine published by the Massachusetts Institute of Technology. It covers the latest developments in technology.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Reuters',
        url: 'https://www.reuters.com',
        content: 'Reuters is an international news agency providing breaking news, analysis, and market data to professionals and consumers worldwide.',
        publishedDate: '2026-05-01'
      },
      {
        title: 'The Verge',
        url: 'https://www.theverge.com',
        content: 'The Verge covers the intersection of technology, science, art, and culture. Your source for gadget reviews and tech news.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Hacker News',
        url: 'https://news.ycombinator.com',
        content: 'Hacker News is a social news website focusing on computer science and entrepreneurship. Run by Paul Graham and Y Combinator.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'arXiv',
        url: 'https://arxiv.org',
        content: 'arXiv is a free distribution service and an open-access archive for scholarly articles in the fields of physics, mathematics, and computer science.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Wired',
        url: 'https://www.wired.com',
        content: 'Wired reports on how technology is changing every aspect of our lives, from culture to business, science to design.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'TechCrunch',
        url: 'https://techcrunch.com',
        content: 'TechCrunch is a leading technology media property, dedicated to obsessively profiling startups, reviewing new internet products, and breaking tech news.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Scientific American',
        url: 'https://www.scientificamerican.com',
        content: 'Scientific American is an American popular science magazine providing authoritative articles on scientific discoveries and technology innovations.',
        publishedDate: '2026-01-01'
      },
      {
        title: 'Quora',
        url: 'https://www.quora.com',
        content: 'Quora is a question-and-answer website where questions are asked, answered, and edited by its community of experts and knowledge seekers.',
        publishedDate: '2026-01-01'
      }
    ];

    // 注册为默认结果，适用于没有精确匹配的查询
    this.mockData.set('__default__', defaultResults);
  }

  addMockResults(query: string, results: SearchResult[]): void {
    this.mockData.set(query.toLowerCase(), results);
  }

  async search(query: string, numResults: number = 10): Promise<SearchResponse> {
    const key = query.toLowerCase();
    let results = this.mockData.get(key);

    // 如果没有精确匹配，返回默认结果
    if (!results) {
      results = this.mockData.get('__default__') || [];
    }

    return {
      query,
      results: results.slice(0, numResults)
    };
  }

  clear(): void {
    this.mockData.clear();
    this.initDefaultData();
  }
}

class LLMSearchTool implements SearchTool {
  private fallbackContent: SearchResponse | null = null;

  async search(query: string, numResults: number = 10): Promise<SearchResponse> {
    return { results: [], query };
  }

  setFallbackResponse(response: SearchResponse): void {
    this.fallbackContent = response;
  }
}

let searchToolInstance: SearchTool | null = null;
let currentProvider: SearchProvider | null = null;
let mockSearchToolInstance: MockSearchTool | null = null;

export function getSearchTool(provider?: SearchProvider): SearchTool {
  const useProvider = provider || (process.env.SEARCH_PROVIDER as SearchProvider) || 'duckduckgo';

  if (!searchToolInstance || currentProvider !== useProvider) {
    if (useProvider === 'duckduckgo') {
      searchToolInstance = new DuckDuckGoSearchTool();
    } else if (useProvider === 'llm') {
      searchToolInstance = new LLMSearchTool();
    } else if (useProvider === 'mock') {
      if (!mockSearchToolInstance) {
        mockSearchToolInstance = new MockSearchTool();
      }
      searchToolInstance = mockSearchToolInstance;
    } else {
      searchToolInstance = new TavilySearchTool();
    }
    currentProvider = useProvider;
  }

  return searchToolInstance;
}

export function getMockSearchTool(): MockSearchTool {
  if (!mockSearchToolInstance) {
    mockSearchToolInstance = new MockSearchTool();
  }
  return mockSearchToolInstance;
}

export function setSearchProvider(provider: SearchProvider): void {
  searchToolInstance = null;
  currentProvider = provider;
  if (provider !== 'mock') {
    mockSearchToolInstance = null;
  }
}

// Helper to get LLM-based search as fallback
export async function searchWithLLMFallback(
  query: string,
  numResults: number = 8
): Promise<SearchResponse> {
  const primarySearch = getSearchTool();
  const results = await primarySearch.search(query, numResults);

  // If primary search returns empty results, use LLM
  if (results.results.length === 0) {
    const llmSearch = new LLMSearchTool();
    return llmSearch.search(query, numResults);
  }

  return results;
}
