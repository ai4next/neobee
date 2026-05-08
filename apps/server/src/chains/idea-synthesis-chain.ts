import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { IdeaCandidate, Insight, ResearchBrief, ReviewScore, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const IdeaCandidateSchema = z.object({
  title: z.string(),
  thesis: z.string(),
  supportingInsights: z.array(z.string()),
  whyNow: z.string(),
  targetUser: z.string(),
  coreMechanism: z.string(),
  risks: z.array(z.string()),
  controversyLabel: z.enum(['wildcard']).optional()
});

const IdeasArraySchema = z.array(IdeaCandidateSchema);

const userPrompt = `Synthesize ideas for topic "{topic}" based on expert insights and reviews.

Topic frame: {topicFrame}
Top insights:
{insightsSummary}

Reviews:
{reviewsSummary}

Generate {ideaCount} startup ideas. Each should:
- title: Catchy, memorable name/phrase
- thesis: Core value proposition (2-3 sentences)
- supportingInsights: IDs of insights that support this idea
- whyNow: Why this idea is relevant today
- targetUser: Who benefits most
- coreMechanism: How it works at a high level
- risks: Potential failure modes
- controversyLabel: Set to "wildcard" only for high-risk/high-reward ideas

Return an array of {ideaCount} ideas.`;

export class IdeaSynthesisChain {
  async run(
    session: SessionRecord,
    researchBrief: ResearchBrief,
    insights: Insight[],
    reviews: ReviewScore[]
  ): Promise<IdeaCandidate[]> {
    const llm = getLLM();
    const lang = getLanguageParam(session);
    const userPromptTemplate = userPrompt;

    const insightsSummary = insights
      .slice(0, 5)
      .map((i) => `[${i.id}] ${i.insight}`)
      .join('\n');

    const reviewsSummary = reviews
      .slice(0, 10)
      .map((r) => `Insight ${r.insightId}: novelty=${r.novelty}, usefulness=${r.usefulness}, obj=${r.objectionLevel}`)
      .join('\n');

    const ideaCount = Math.min(3, Math.max(1, Math.floor(insights.length / 2)));

    const chain = RunnableSequence.from([
      PromptTemplate.fromTemplate(userPromptTemplate),
      llm.withStructuredOutput(zodToJsonSchema(IdeasArraySchema), { strict: false }),
      (output) => {
        const ideas = typeof output === 'string' ? JSON.parse(output) : output;
        return ideas.map((idea: Omit<IdeaCandidate, 'id' | 'totalScore'>) => ({
          ...idea,
          id: crypto.randomUUID(),
          totalScore: 0
        })) as IdeaCandidate[];
      }
    ]);

    return chain.invoke({
      topic: session.topic,
      topicFrame: researchBrief.topicFrame,
      insightsSummary: insightsSummary || (lang === 'zh' ? '无' : 'None'),
      reviewsSummary: reviewsSummary || (lang === 'zh' ? '无' : 'None'),
      ideaCount: String(ideaCount)
    });
  }
}
