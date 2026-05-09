import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { ExpertProfile, Insight, ReviewScore, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const ScoreField = () => z.number().min(1).max(10).optional().default(5);

const ReviewScoreSchema = z.object({
  insightId: z.string().describe('The ID of the insight being reviewed (use the id prefix)'),
  novelty: ScoreField().describe('How original is this insight? (1-10)'),
  usefulness: ScoreField().describe('How practical is this insight? (1-10)'),
  feasibility: ScoreField().describe('How achievable is this insight? (1-10)'),
  evidenceStrength: ScoreField().describe('How well-supported is this insight? (1-10)'),
  crossDomainLeverage: ScoreField().describe('How much does this bridge domains? (1-10)'),
  riskAwareness: ScoreField().describe('How well does this acknowledge risks? (1-10)'),
  comment: z.string().describe('Brief evaluation from this expert perspective')
});

const ReviewsOutputSchema = z.object({
  reviews: z.array(ReviewScoreSchema).describe('Reviews for all insights from this expert perspective')
});

const userPrompt = `As {expertName} ({expertDomain}), review all insights below from your perspective.

Your stance: {expertStance}
Your skills: {expertSkills}

Insights to review:
{insightsInfo}

use {language}
Score each insight and return a "reviews" array containing reviews for all insights.`;

export interface InsightScoreTotal {
  insightId: string;
  totalNovelty: number;
  totalUsefulness: number;
  totalFeasibility: number;
  totalEvidenceStrength: number;
  totalCrossDomainLeverage: number;
  totalRiskAwareness: number;
  reviewCount: number;
}

export interface CrossReviewResult {
  reviews: ReviewScore[];
  insightTotals: InsightScoreTotal[];
}

export interface CrossReviewProgress {
  type: 'expert_completed';
  expertId: string;
  reviews: ReviewScore[];
}

export interface CrossReviewChainOptions {
  /** Set of expert IDs that have already been completed — these will be skipped */
  completedExpertIds?: Set<string>;
  /** Called after each expert's batch of reviews completes */
  onProgress?: (progress: CrossReviewProgress) => void;
}

export class CrossReviewChain {
  private readonly BATCH_SIZE = 20;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_BASE_DELAY_MS = 1000;

  async run(
    session: SessionRecord,
    experts: ExpertProfile[],
    insights: Insight[],
    options?: CrossReviewChainOptions
  ): Promise<CrossReviewResult> {
    const allReviews: ReviewScore[] = [];
    const batches = this.chunk(insights, this.BATCH_SIZE);
    const skipIds = options?.completedExpertIds ?? new Set<string>();

    for (let i = 0; i < experts.length; i++) {
      const expert = experts[i];
      if (skipIds.has(expert.id)) {
        continue;
      }

      for (const batch of batches) {
        const expertReviews = await this.runForExpert(session, expert, batch);
        allReviews.push(...expertReviews);
      }

      options?.onProgress?.({ type: 'expert_completed', expertId: expert.id, reviews: allReviews });
      console.log(`Expert ${expert.id} completed`);
    }

    const insightTotals = this.aggregateScores(allReviews);

    return { reviews: allReviews, insightTotals };
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private async runForExpert(session: SessionRecord, expert: ExpertProfile, insights: Insight[]): Promise<ReviewScore[]> {
    const lang = getLanguageParam(session);
    const outputLang = lang === 'zh' ? 'Chinese' : 'English';

    const insightsInfo = insights.map((i) => `[${i.id}] ${i.insight}`).join('\n');
    const expertSkills = expert.skills.join(', ');

    const llm = getLLM().withStructuredOutput(ReviewsOutputSchema);
    const chain = PromptTemplate.fromTemplate(userPrompt).pipe(llm);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await chain.invoke({
          expertName: expert.name,
          expertDomain: expert.domain,
          expertStance: expert.stance,
          expertSkills,
          insightsInfo,
          language: outputLang
        });

        return result.reviews.map((r) => ({
          ...r,
          reviewerExpertId: expert.id
        })) as ReviewScore[];
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // LangChain Anthropic tool calling sometimes wraps output in raw_arguments
        // instead of extracting the inner JSON — attempt recovery before retry
        const recovered = this.tryRecoverRawArguments(lastError.message, expert.id);
        if (recovered) return recovered;

        if (attempt <= this.MAX_RETRIES) {
          const delay = this.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(insightsInfo)
          console.warn(`[CrossReviewChain] runForExpert retry ${attempt}/${this.MAX_RETRIES} for ${expert.name}, retrying in ${delay}ms: ${lastError.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /** Try to recover when LangChain wraps output in raw_arguments instead of extracting the inner JSON */
  private tryRecoverRawArguments(errorMessage: string, reviewerExpertId: string): ReviewScore[] | null {
    if (!errorMessage.includes('raw_arguments')) return null;

    try {
      // Extract JSON after "Text: " prefix in LangChain parse error messages
      const textMatch = errorMessage.match(/Text:\s*(".*)/s);
      if (!textMatch) return null;

      const outer = JSON.parse(textMatch[1]);
      const inner = JSON.parse(outer.raw_arguments);
      const validated = ReviewsOutputSchema.parse(inner);
      return validated.reviews.map((r) => ({ ...r, reviewerExpertId })) as ReviewScore[];
    } catch {
      return null;
    }
  }

  private aggregateScores(reviews: ReviewScore[]): InsightScoreTotal[] {
    const map = new Map<string, InsightScoreTotal>();

    for (const r of reviews) {
      const existing = map.get(r.insightId);
      if (existing) {
        existing.totalNovelty += r.novelty;
        existing.totalUsefulness += r.usefulness;
        existing.totalFeasibility += r.feasibility;
        existing.totalEvidenceStrength += r.evidenceStrength;
        existing.totalCrossDomainLeverage += r.crossDomainLeverage;
        existing.totalRiskAwareness += r.riskAwareness;
        existing.reviewCount += 1;
      } else {
        map.set(r.insightId, {
          insightId: r.insightId,
          totalNovelty: r.novelty,
          totalUsefulness: r.usefulness,
          totalFeasibility: r.feasibility,
          totalEvidenceStrength: r.evidenceStrength,
          totalCrossDomainLeverage: r.crossDomainLeverage,
          totalRiskAwareness: r.riskAwareness,
          reviewCount: 1
        });
      }
    }

    return Array.from(map.values());
  }
}
