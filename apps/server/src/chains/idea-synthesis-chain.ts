import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { IdeaCandidate, Insight, ResearchBrief, ReviewScore, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const IdeaCandidateSchema = z.object({
  title: z.string().describe('Catchy, memorable name or phrase for the idea'),
  thesis: z.string().describe('Core value proposition (2-3 sentences)'),
  supportingInsights: z.array(z.string()).describe('IDs of insights that support this idea'),
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
Top insights:
{insightsSummary}

Reviews:
{reviewsSummary}

Generate {ideaCount} startup ideas and return them in an "ideas" array.`;

export class IdeaSynthesisChain {
  async run(
    session: SessionRecord,
    researchBrief: ResearchBrief,
    insights: Insight[],
    reviews: ReviewScore[]
  ): Promise<IdeaCandidate[]> {
    const lang = getLanguageParam(session);

    const insightsSummary = insights
      .slice(0, 5)
      .map((i) => `[${i.id}] ${i.insight}`)
      .join('\n');

    const reviewsSummary = reviews
      .slice(0, 10)
      .map((r) => `Insight ${r.insightId}: novelty=${r.novelty}, usefulness=${r.usefulness}, obj=${r.objectionLevel}`)
      .join('\n');

    const ideaCount = Math.min(3, Math.max(1, Math.floor(insights.length / 2)));

    const llm = getLLM().withStructuredOutput(IdeasOutputSchema);
    const chain = PromptTemplate.fromTemplate(userPrompt).pipe(llm);

    const result = await chain.invoke({
      topic: session.topic,
      topicFrame: researchBrief.topicFrame,
      insightsSummary: insightsSummary || (lang === 'zh' ? '无' : 'None'),
      reviewsSummary: reviewsSummary || (lang === 'zh' ? '无' : 'None'),
      ideaCount: String(ideaCount)
    });

    return (result.ideas || []).map((idea) => ({
      ...idea,
      id: crypto.randomUUID(),
      totalScore: 0
    })) as IdeaCandidate[];
  }
}
