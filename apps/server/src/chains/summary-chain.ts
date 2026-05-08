import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { SessionAggregate, SummaryDocument } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const SummaryDocumentSchema = z.object({
  bestIdeas: z.array(z.string()),
  controversialIdeas: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  executiveSummary: z.string()
});

const userPrompt = `Summarize the session for topic "{topic}".

Session stats: {expertCount} experts, {roundCount} rounds, {ideaCount} ideas.

Best ideas:
{ideasSummary}

Open questions from research:
{openQuestions}

Generate a summary with:
- bestIdeas: Top 2-3 ideas that should be pursued
- controversialIdeas: Ideas with high disagreement or risk
- unresolvedQuestions: Key questions still unanswered
- executiveSummary: 3-4 sentence strategic overview`;

export class SummaryChain {
  async run(aggregate: SessionAggregate): Promise<SummaryDocument> {
    const llm = getLLM();
    const lang = getLanguageParam(aggregate.session);
    const userPromptTemplate = userPrompt;

    const ideasSummary = aggregate.ideas.map((i) => `${i.title}: ${i.thesis}`).join('\n');
    const openQuestions = aggregate.researchBrief?.openQuestions.join('\n') || 'None';

    const chain = RunnableSequence.from([
      PromptTemplate.fromTemplate(userPromptTemplate),
      llm.withStructuredOutput(zodToJsonSchema(SummaryDocumentSchema), { strict: false }),
      (output) => {
        return typeof output === 'string' ? JSON.parse(output) : output;
      }
    ]);

    return chain.invoke({
      topic: aggregate.session.topic,
      expertCount: String(aggregate.experts.length),
      roundCount: String(aggregate.rounds.length),
      ideaCount: String(aggregate.ideas.length),
      ideasSummary: ideasSummary || (lang === 'zh' ? '无' : 'None'),
      openQuestions
    });
  }
}
