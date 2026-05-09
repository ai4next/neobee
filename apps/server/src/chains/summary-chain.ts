import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { SessionAggregate, SummaryDocument } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const SummaryDocumentSchema = z.object({
  bestIdeas: z.array(z.string()).describe('Top 2-3 ideas that should be pursued'),
  controversialIdeas: z.array(z.string()).describe('Ideas with high disagreement or risk'),
  unresolvedQuestions: z.array(z.string()).describe('Key questions still unanswered'),
  executiveSummary: z.string().describe('3-4 sentence strategic overview')
});

const userPrompt = `Summarize the session for topic "{topic}".

Session stats: {expertCount} experts, {roundCount} rounds, {ideaCount} ideas.

Best ideas:
{ideasSummary}

Open questions from research:
{openQuestions}

Generate a summary document with all required fields.`;

export class SummaryChain {
  async run(aggregate: SessionAggregate): Promise<SummaryDocument> {
    const lang = getLanguageParam(aggregate.session);

    const ideasSummary = aggregate.ideas.map((i) => `${i.title}: ${i.thesis}`).join('\n');
    const openQuestions = aggregate.researchBrief?.openQuestions.join('\n') || 'None';

    const llm = getLLM().withStructuredOutput(SummaryDocumentSchema);
    const chain = PromptTemplate.fromTemplate(userPrompt).pipe(llm);

    return chain.invoke({
      topic: aggregate.session.topic,
      expertCount: String(aggregate.experts.length),
      roundCount: String(aggregate.rounds.length),
      ideaCount: String(aggregate.ideas.length),
      ideasSummary: ideasSummary || (lang === 'zh' ? '无' : 'None'),
      openQuestions
    }) as Promise<SummaryDocument>;
  }
}
