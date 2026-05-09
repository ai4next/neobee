import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { ResearchBrief, ResearchProgress, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';
import { getSearchTool } from '../lib/search.js';
import type { SearchProvider } from '../lib/search.js';

// ====== STAGE 1: Intent Parsing & Query Generation (LLM-1) ======
const QueryGenerationSchema = z.object({
  primaryQuery: z.string().describe('Main search query for broad information retrieval'),
  subQueries: z.preprocess(
    (val) => {
      if (typeof val === 'string') return val.split('\n').map(s => s.trim()).filter(Boolean);
      return val;
    },
    z.array(z.string()).describe('Sub-queries to cover different aspects of the topic')
  ),
  searchStrategy: z.string().describe('Overall search strategy explanation')
});

// ====== STAGE 2: Fact Extraction & Gap Identification (LLM-2) ======
const FactExtractionSchema = z.object({
  facts: z.array(z.object({
    fact: z.string().describe('A verifiable piece of information extracted from search results'),
    source: z.string().describe('The source of the fact'),
  })).describe('Extracted verifiable facts with source attribution'),
  knowledgeGaps: z.array(z.string()).describe('Identified knowledge gaps in the research'),
  keyEntities: z.array(z.string()).describe('Important entities, organizations, or terms mentioned'),
});

// ====== STAGE 3: Analysis & Synthesis (LLM-3) ======
const AnalysisSchema = z.object({
  topicFrame: z.string().describe('Concise framing of the opportunity space'),
  keyFacts: z.array(z.string()).describe('Key facts that define this space'),
  openQuestions: z.array(z.string()).describe('Important open questions remaining'),
  signalsSummary: z.array(z.string()).describe('Signals or trends to consider'),
  sourceRefs: z.array(z.string()).describe('Relevant reference names or URLs')
});

// ====== PROMPTS ======
const prompts = {
  queryGeneration: `Analyze the topic "{topic}" and generate search queries.

Background context: {additionalInfo}

Generate:
- 1 primary query
- 3-5 sub-queries
- A search strategy`,

  factExtraction: `Extract factual information from the search results about "{topic}".

Search Results:
{searchResults}

Output:
- All verifiable facts with source attribution
- Knowledge gaps where information is missing or contradictory
- Key entities, organizations, or concepts

Be critical - distinguish facts from opinions, flag low-confidence information.`,

  analysis: `Analyze the research findings for "{topic}" and synthesize a comprehensive brief.

Facts gathered:
{facts}

Knowledge gaps identified:
{knowledgeGaps}

use {language}
Output:
- A concise framing of the opportunity space
- Key facts, open questions, signals, and source references`
};

export interface DeepResearchChainCallbacks {
  onProgress?: (progress: ResearchProgress) => void;
}

interface DeepResearchChainRunParams {
  session: SessionRecord;
  callbacks?: DeepResearchChainCallbacks;
  searchProvider?: SearchProvider;
  searchApiKey?: string;
}

interface ResearchFindings {
  facts: { fact: string; source: string; sourceUrl?: string; confidence: 'high' | 'medium' | 'low' }[];
  knowledgeGaps: { gap: string; whyItMatters?: string }[];
  searchQueries: { primary: string; sub: string[] };
  searchResults: { title: string; url: string; content: string }[];
}

export class DeepResearchChain {
  emitProgress(callbacks: DeepResearchChainCallbacks | undefined, stage: ResearchProgress['stage'], message: string) {
    if (callbacks?.onProgress) {
      callbacks.onProgress({
        stage,
        message,
        timestamp: new Date().toISOString()
      });
    }
  }

  private createChain(schema: z.ZodSchema, promptTemplate: string) {
    const llm = getLLM().withStructuredOutput(schema);
    return PromptTemplate.fromTemplate(promptTemplate).pipe(llm);
  }

  private formatSearchResults(results: { title: string; url: string; content: string }[]): string {
    return results.map(r => `[${r.title}](${r.url})\n${r.content}`).join('\n\n---\n\n');
  }

  async run({ session, callbacks, searchProvider, searchApiKey }: DeepResearchChainRunParams): Promise<ResearchBrief> {
    const lang = getLanguageParam(session);
    const outputLang = lang === 'zh' ? 'Chinese' : 'English';

    const findings: ResearchFindings = {
      facts: [],
      knowledgeGaps: [],
      searchQueries: { primary: '', sub: [] },
      searchResults: []
    };

    const searchTool = getSearchTool(searchProvider, searchApiKey);

    // ====== STAGE 1: Intent Parsing & Query Generation (LLM-1) ======
    this.emitProgress(callbacks, 'initializing', lang === 'zh' ? '正在解析研究意图...' : 'Parsing research intent...');

    const queryChain = this.createChain(QueryGenerationSchema, prompts.queryGeneration);
    const queryGen = await queryChain.invoke({
      topic: session.topic,
      additionalInfo: session.additionalInfo || (lang === 'zh' ? '无' : 'None'),
    }) as { primaryQuery: string; subQueries: string[]; searchStrategy: string };

    findings.searchQueries = {
      primary: queryGen.primaryQuery,
      sub: queryGen.subQueries
    };

    // ====== STAGE 2: First Round Web Search - Broad Information Retrieval (Search-1) ======
    this.emitProgress(callbacks, 'gathering_facts', lang === 'zh' ? '进行第一轮广域搜索...' : 'Performing first round broad search...');

    const allQueries = [queryGen.primaryQuery, ...queryGen.subQueries];
    const searchPromises = allQueries.map(q => searchTool.search(q, 5));
    const searchResponses = await Promise.all(searchPromises);

    for (const response of searchResponses) {
      findings.searchResults.push(...response.results);
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    findings.searchResults = findings.searchResults.filter(r => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    // ====== STAGE 3: Fact Extraction & Gap Identification (LLM-2) ======
    this.emitProgress(callbacks, 'analyzing', lang === 'zh' ? '抽取事实并识别知识缺口...' : 'Extracting facts and identifying gaps...');

    const factChain = this.createChain(FactExtractionSchema, prompts.factExtraction);
    const factExtraction = await factChain.invoke({
      topic: session.topic,
      searchResults: this.formatSearchResults(findings.searchResults)
    }) as {
      facts: { fact: string; source: string; sourceUrl?: string; confidence: 'high' | 'medium' | 'low' }[];
      knowledgeGaps: { gap: string; whyItMatters?: string }[];
      keyEntities: string[];
    };

    findings.facts = factExtraction.facts;
    findings.knowledgeGaps = factExtraction.knowledgeGaps;

    // ====== STAGE 4: Second Round Targeted Search for Gaps (Search-2) ======
    if (findings.knowledgeGaps.length > 0) {
      this.emitProgress(callbacks, 'gathering_facts', lang === 'zh' ? '针对缺口进行靶向搜索...' : 'Performing targeted search for gaps...');

      const gapQueries = findings.knowledgeGaps.slice(0, 5).map(g => g.gap);
      const gapSearchPromises = gapQueries.map(q => searchTool.search(q, 5));
      const gapResponses = await Promise.all(gapSearchPromises);

      for (const response of gapResponses) {
        // Avoid too many results - take top 3 per gap
        findings.searchResults.push(...response.results.slice(0, 3));
      }

      // Re-extract facts from gap search results
      const updatedFactChain = this.createChain(FactExtractionSchema, prompts.factExtraction);
      const updatedFacts = await updatedFactChain.invoke({
        topic: session.topic,
        searchResults: this.formatSearchResults(findings.searchResults)
      }) as typeof factExtraction;

      // Merge unique facts
      const existingSources = new Set(findings.facts.map(f => f.source));
      for (const newFact of updatedFacts.facts) {
        if (!existingSources.has(newFact.source)) {
          findings.facts.push(newFact);
        }
      }
    }

    // ====== STAGE 5: Analysis & Synthesis (LLM-3) ======
    this.emitProgress(callbacks, 'synthesizing', lang === 'zh' ? '分析并生成研究报告...' : 'Analyzing and synthesizing research brief...');

    const analysisChain = this.createChain(AnalysisSchema, prompts.analysis);
    const analysis = await analysisChain.invoke({
      topic: session.topic,
      facts: findings.facts.map(f => `[${f.source}] ${f.fact}`).join('\n'),
      knowledgeGaps: findings.knowledgeGaps.map(g => g.gap).join('\n'),
      language: outputLang
    });

    const result: ResearchBrief = {
      topicFrame: analysis.topicFrame,
      keyFacts: analysis.keyFacts,
      openQuestions: analysis.openQuestions,
      signals: analysis.signalsSummary,
      sourceRefs: analysis.sourceRefs
    };

    this.emitProgress(callbacks, 'synthesizing', lang === 'zh' ? '研究完成' : 'Research complete');

    return result;
  }
}
