import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import type { ResearchBrief, ResearchProgress, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';
import { getSearchTool, SearchResponseSchema } from '../lib/search.js';

// ====== STAGE 1: Intent Parsing & Query Generation (LLM-1) ======
const QueryGenerationSchema = z.object({
  primaryQuery: z.string().describe('Main search query for broad information retrieval'),
  subQueries: z.array(z.string()).describe('Sub-queries to cover different aspects of the topic'),
  searchStrategy: z.string().describe('Overall search strategy explanation')
});

// ====== STAGE 2: Fact Extraction & Gap Identification (LLM-2) ======
const FactExtractionSchema = z.object({
  facts: z.array(z.object({
    fact: z.string(),
    source: z.string(),
    sourceUrl: z.string().optional(),
    confidence: z.enum(['high', 'medium', 'low'])
  })),
  knowledgeGaps: z.array(z.object({
    gap: z.string(),
    whyItMatters: z.string().optional()
  })),
  keyEntities: z.array(z.string()).describe('Important entities, organizations, or terms mentioned'),
  timeline: z.string().optional().describe('Historical timeline or chronology if relevant')
});

// ====== STAGE 3: Analysis & Synthesis (LLM-3) ======
const AnalysisSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    importance: z.number().min(1).max(5),
    answerable: z.boolean(),
    suggestedApproach: z.string().optional()
  })),
  priorityOrder: z.array(z.number()),
  signals: z.array(z.object({
    signal: z.string(),
    trend: z.string(),
    evidence: z.string(),
    timeframe: z.enum(['immediate', 'short_term', 'medium_term', 'long_term'])
  })),
  emergingThemes: z.array(z.string()),
  frame: z.string(),
  scope: z.string(),
  keyDimensions: z.array(z.string()),
  framingAssumptions: z.array(z.string()),
  topicFrame: z.string(),
  keyFacts: z.array(z.string()),
  openQuestions: z.array(z.string()),
  signalsSummary: z.array(z.string()),
  sourceRefs: z.array(z.string())
});

// ====== PROMPTS ======
const prompts = {
  queryGeneration: `Analyze the research topic "{topic}" and generate effective search queries.

Background context: {additionalInfo}

Your task:
1. Create ONE primary query that captures the core topic for broad initial search
2. Generate 3-5 sub-queries to cover different aspects (e.g., definitions, history, current state, controversies, future outlook)
3. Explain the search strategy

The topic is for {language} language audience.`,

  factExtraction: `Extract factual information from the search results about "{topic}".

Search Results:
{searchResults}

Your task:
1. Extract all verifiable facts with source attribution
2. Identify knowledge gaps - areas where information is missing, contradictory, or outdated
3. Note key entities (people, organizations, concepts)
4. Build a timeline if chronological information is available

Be critical - distinguish facts from opinions, flag low-confidence information.`,

  analysis: `Analyze the research findings for "{topic}" and synthesize a comprehensive brief.

Facts gathered:
{facts}

Knowledge gaps identified:
{knowledgeGaps}

Your task:
1. Identify the 5-10 most important unanswered questions, ranked by importance
2. Analyze emerging signals and trends (weak signals, counter-intuitive indicators)
3. Create a concise framing that defines the opportunity/problem space
4. Based on all above, directly output the final ResearchBrief with:
   - topicFrame: A concise framing of the opportunity space
   - keyFacts: 3-5 key facts that define this space
   - openQuestions: 2-3 important open questions
   - signalsSummary: 2-3 signals or trends to consider
   - sourceRefs: relevant reference names/URLs`
};

export interface DeepResearchChainCallbacks {
  onProgress?: (progress: ResearchProgress) => void;
}

interface ResearchFindings {
  facts: { fact: string; source: string; sourceUrl?: string; confidence: 'high' | 'medium' | 'low' }[];
  knowledgeGaps: { gap: string; whyItMatters?: string }[];
  questions: { question: string; importance: number; answerable: boolean; suggestedApproach?: string }[];
  signals: { signal: string; trend: string; evidence: string; timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term' }[];
  emergingThemes: string[];
  frame: string;
  scope: string;
  keyDimensions: string[];
  framingAssumptions: string[];
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
    const llm = getLLM();
    const prompt = PromptTemplate.fromTemplate(promptTemplate);
    return RunnableSequence.from([
      prompt,
      llm.withStructuredOutput(schema, { strict: false }),
      (output) => {
        if (typeof output === 'string') return JSON.parse(output);
        return output;
      }
    ]);
  }

  private formatSearchResults(results: { title: string; url: string; content: string }[]): string {
    return results.map(r => `[${r.title}](${r.url})\n${r.content}`).join('\n\n---\n\n');
  }

  async run(session: SessionRecord, callbacks?: DeepResearchChainCallbacks): Promise<ResearchBrief> {
    console.log("deepresearch run")
    const lang = getLanguageParam(session);
    const searchTool = getSearchTool('mock');

    const findings: ResearchFindings = {
      facts: [],
      knowledgeGaps: [],
      questions: [],
      signals: [],
      emergingThemes: [],
      frame: '',
      scope: '',
      keyDimensions: [],
      framingAssumptions: [],
      searchQueries: { primary: '', sub: [] },
      searchResults: []
    };

    // ====== STAGE 1: Intent Parsing & Query Generation (LLM-1) ======
    this.emitProgress(callbacks, 'initializing', lang === 'zh' ? '正在解析研究意图...' : 'Parsing research intent...');

    const queryChain = this.createChain(QueryGenerationSchema, prompts.queryGeneration);
    const queryGen = await queryChain.invoke({
      topic: session.topic,
      additionalInfo: session.additionalInfo || (lang === 'zh' ? '无' : 'None'),
      language: lang === 'zh' ? '中文' : 'English'
    }) as { primaryQuery: string; subQueries: string[]; searchStrategy: string };

    findings.searchQueries = {
      primary: queryGen.primaryQuery,
      sub: queryGen.subQueries
    };

    // ====== STAGE 2: First Round Web Search - Broad Information Retrieval (Search-1) ======
    this.emitProgress(callbacks, 'gathering_facts', lang === 'zh' ? '进行第一轮广域搜索...' : 'Performing first round broad search...');

    const allQueries = [queryGen.primaryQuery, ...queryGen.subQueries];
    // console.log('allQueries:', allQueries);
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
      timeline?: string;
    };

    findings.facts = factExtraction.facts;
    findings.knowledgeGaps = factExtraction.knowledgeGaps;

    // ====== STAGE 4: Second Round Targeted Search for Gaps (Search-2) ======
    if (findings.knowledgeGaps.length > 0) {
      this.emitProgress(callbacks, 'gathering_facts', lang === 'zh' ? '针对缺口进行靶向搜索...' : 'Performing targeted search for gaps...');

      const gapQueries = findings.knowledgeGaps.slice(0, 5).map(g => g.gap);
      // console.log('gapQueries:', gapQueries);
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
      knowledgeGaps: findings.knowledgeGaps.map(g => g.gap).join('\n')
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
