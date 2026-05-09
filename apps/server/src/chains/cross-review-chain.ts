import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { ExpertProfile, Insight, ReviewScore } from '@neobee/shared';
import { getLLM } from '../lib/llm.js';

const ReviewScoreSchema = z.object({
  insightId: z.string().describe('The ID of the insight being reviewed (use the [id] prefix)'),
  novelty: z.number().min(1).max(10).describe('How original is this insight? (1-10)'),
  usefulness: z.number().min(1).max(10).describe('How practical is this insight? (1-10)'),
  feasibility: z.number().min(1).max(10).describe('How achievable is this insight? (1-10)'),
  evidenceStrength: z.number().min(1).max(10).describe('How well-supported is this insight? (1-10)'),
  crossDomainLeverage: z.number().min(1).max(10).describe('How much does this bridge domains? (1-10)'),
  riskAwareness: z.number().min(1).max(10).describe('How well does this acknowledge risks? (1-10)'),
  comment: z.string().describe('Brief evaluation from this expert perspective'),
  objectionLevel: z.enum(['low', 'medium', 'high']).describe('Overall objection level based on total score')
});

const ReviewsOutputSchema = z.object({
  reviews: z.array(ReviewScoreSchema).describe('Reviews for all insights from this expert perspective')
});

const userPrompt = `As {expertName} ({expertDomain}), review all insights below from your perspective.

Your stance: {expertStance}
Your skills: {expertSkills}

Insights to review:
{insightsInfo}

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

export class CrossReviewChain {
  async run(experts: ExpertProfile[], insights: Insight[]): Promise<CrossReviewResult> {
    const allReviews: ReviewScore[] = [];

    for (let i = 0; i < experts.length; i++) {
      const expertReviews = await this.runForExpert(experts[i], insights);
      allReviews.push(...expertReviews);
    }

    const insightTotals = this.aggregateScores(allReviews);

    return { reviews: allReviews, insightTotals };
  }

  private async runForExpert(expert: ExpertProfile, insights: Insight[]): Promise<ReviewScore[]> {
    const insightsInfo = insights.map((i) => `[${i.id}] ${i.insight}`).join('\n');
    const expertSkills = expert.skills.join(', ');

    const llm = getLLM().withStructuredOutput(ReviewsOutputSchema);
    const chain = PromptTemplate.fromTemplate(userPrompt).pipe(llm);

    const result = await chain.invoke({
      expertName: expert.name,
      expertDomain: expert.domain,
      expertStance: expert.stance,
      expertSkills,
      insightsInfo
    });

    return result.reviews.map((r) => ({
      ...r,
      reviewerExpertId: expert.id
    })) as ReviewScore[];
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
