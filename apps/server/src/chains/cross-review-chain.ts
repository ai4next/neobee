import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ExpertProfile, Insight, ReviewScore } from '@neobee/shared';
import { getLLM } from '../lib/llm.js';

const ReviewScoreSchema = z.object({
  insightId: z.string(),
  novelty: z.number().min(1).max(10),
  usefulness: z.number().min(1).max(10),
  feasibility: z.number().min(1).max(10),
  evidenceStrength: z.number().min(1).max(10),
  crossDomainLeverage: z.number().min(1).max(10),
  riskAwareness: z.number().min(1).max(10),
  comment: z.string(),
  objectionLevel: z.enum(['low', 'medium', 'high'])
});

const ReviewsArraySchema = z.array(ReviewScoreSchema);

const userPrompt = `Review insights from {expertCount} experts. Each expert reviews all insights.

Experts:
{expertsInfo}

Insights to review:
{insightsInfo}

For each expert-insight pair, score:
- novelty: How original is this insight? (1-10)
- usefulness: How practical is it? (1-10)
- feasibility: How achievable is it? (1-10)
- evidenceStrength: How well-supported? (1-10)
- crossDomainLeverage: How much does it bridge domains? (1-10)
- riskAwareness: How well does it acknowledge risks? (1-10)
- comment: Brief evaluation from this expert's perspective
- objectionLevel: low/medium/high based on total score

Return all reviews as an array.`;

export class CrossReviewChain {
  async run(experts: ExpertProfile[], insights: Insight[]): Promise<ReviewScore[]> {
    const llm = getLLM();
    const userPromptTemplate = userPrompt;

    const expertsInfo = experts.map((e) => `${e.name} (${e.domain}): ${e.stance}`).join('\n');
    const insightsInfo = insights.map((i) => `[${i.id}] ${i.insight}`).join('\n');

    const chain = RunnableSequence.from([
      PromptTemplate.fromTemplate(userPromptTemplate),
      llm.withStructuredOutput(zodToJsonSchema(ReviewsArraySchema), { strict: false }),
      (output) => {
        const reviews = typeof output === 'string' ? JSON.parse(output) : output;
        return reviews.map((review: Omit<ReviewScore, 'reviewerExpertId'>, idx: number) => ({
          ...review,
          reviewerExpertId: experts[idx % experts.length].id
        })) as ReviewScore[];
      }
    ]);

    return chain.invoke({
      expertCount: String(experts.length),
      expertsInfo,
      insightsInfo
    });
  }
}
