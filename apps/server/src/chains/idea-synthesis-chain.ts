import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { IdeaCandidate, Insight, ResearchBrief, ReviewScore, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const IdeaCandidateSchema = z.object({
  title: z.string().describe('Catchy, memorable name or phrase for the idea'),
  thesis: z.string().describe('Core value proposition (2-3 sentences)'),
  whyNow: z.string().describe('Why this idea is relevant today'),
  targetUser: z.string().describe('Who benefits most from this idea'),
  coreMechanism: z.string().describe('How it works at a high level'),
  risks: z.array(z.string()).describe('Potential failure modes'),
  controversyLabel: z.enum(['wildcard']).optional().describe('Set to "wildcard" only for high-risk/high-reward ideas')
});

const IdeasOutputSchema = z.object({
  ideas: z.array(IdeaCandidateSchema).describe('Array of generated startup ideas')
});

const userPrompt = `Synthesize ideas for topic "{topic}" based on expert insights and reviews.

Topic frame: {topicFrame}

Insights:
{aggregatedInsights}

use {language}
Generate {ideaCount} startup ideas and return them in an "ideas" array.`;

export class IdeaSynthesisChain {
  private readonly BATCH_SIZE = 20;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_BASE_DELAY_MS = 1000;

  async run(
    session: SessionRecord,
    researchBrief: ResearchBrief,
    insights: Insight[],
    reviews: ReviewScore[]
  ): Promise<IdeaCandidate[]> {
    const lang = getLanguageParam(session);
    const outputLang = lang === 'zh' ? 'Chinese' : 'English';

    const reviewsByInsightId = new Map<string, ReviewScore[]>();
    for (const review of reviews) {
      const list = reviewsByInsightId.get(review.insightId);
      if (list) {
        list.push(review);
      } else {
        reviewsByInsightId.set(review.insightId, [review]);
      }
    }

    const allIdeas: IdeaCandidate[] = [];

    for (let i = 0; i < insights.length; i += this.BATCH_SIZE) {
      const batch = insights.slice(i, i + this.BATCH_SIZE);
      const aggregatedInsights = batch
        .map((insight) => {
          const relatedReviews = reviewsByInsightId.get(insight.id) || [];
          const reviewLines = relatedReviews
            .map((r) => `  Review: novelty=${r.novelty}, usefulness=${r.usefulness} | ${r.comment}`)
            .join('\n');
          return `Insight: ${insight.insight}\nRationale: ${insight.rationale}${reviewLines ? '\n' + reviewLines : ''}`;
        })
        .join('\n\n');

      const ideaCount = Math.max(1, Math.floor(batch.length / 2));

      const batchIdeas = await this.runForBatch({
        session,
        researchBrief,
        aggregatedInsights: aggregatedInsights || (lang === 'zh' ? '无' : 'None'),
        ideaCount: String(ideaCount),
        language: outputLang
      });
      allIdeas.push(...batchIdeas);
    }

    return allIdeas;
  }

  private async runForBatch(params: {
    session: SessionRecord;
    researchBrief: ResearchBrief;
    aggregatedInsights: string;
    ideaCount: string;
    language: string;
  }): Promise<IdeaCandidate[]> {
    const llm = getLLM().withStructuredOutput(IdeasOutputSchema);
    const chain = PromptTemplate.fromTemplate(userPrompt).pipe(llm);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await chain.invoke({
          topic: params.session.topic,
          topicFrame: params.researchBrief.topicFrame,
          aggregatedInsights: params.aggregatedInsights,
          ideaCount: params.ideaCount,
          language: params.language
        });

        return result.ideas.map((idea) => ({
          ...idea,
          id: crypto.randomUUID(),
          totalScore: 0
        }));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // LangChain tool calling sometimes wraps output in raw_arguments
        const recovered = tryRecoverRawArguments(lastError.message);
        if (recovered) {
          return recovered.map((idea) => ({
            ...idea,
            id: crypto.randomUUID(),
            totalScore: 0
          }));
        }

        if (attempt < this.MAX_RETRIES) {
          const delay = this.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[IdeaSynthesisChain] batch retry ${attempt}/${this.MAX_RETRIES}, retrying in ${delay}ms: ${lastError.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

/** Recover when LangChain wraps output in raw_arguments instead of extracting the inner JSON */
function tryRecoverRawArguments(errorMessage: string): z.infer<typeof IdeaCandidateSchema>[] | null {
  if (!errorMessage.includes('raw_arguments')) return null;

  try {
    const textMatch = errorMessage.match(/Text:\s*(".*)/s);
    if (!textMatch) return null;

    const outer = JSON.parse(textMatch[1]);
    const inner = JSON.parse(outer.raw_arguments);
    const validated = IdeasOutputSchema.parse(inner);
    return validated.ideas;
  } catch {
    return null;
  }
}