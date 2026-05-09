import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import type { ExpertProfile, Insight, ResearchBrief, SessionRecord } from '@neobee/shared';
import { getLLM, getLanguageParam } from '../lib/llm.js';

const InsightSchema = z.object({
  insight: z.string().describe('A clear, insightful position (2-3 sentences)'),
  rationale: z.string().describe('Why this position makes sense given the expert perspective'),
});

interface InsightRefinementInput {
  round: number;
  expert: ExpertProfile;
  session: SessionRecord;
  researchBrief: ResearchBrief;
  previousInsights: Insight[];
}

const userPrompt = `Round {round}: Expert {expertName} (domain: {domain}, persona: {personaStyle}) generates insights on topic "{topic}".

Topic frame: {topicFrame}
Focus on your expert domain and perspective.

Expert's stance: {stance}

use {language}
Generate ONE insight with all required fields.`;

export class InsightRefinementChain {
  async run(input: InsightRefinementInput): Promise<Insight> {
    const lang = getLanguageParam(input.session);
    const outputLang = lang === 'zh' ? 'Chinese' : 'English';

    const llm = getLLM().withStructuredOutput(InsightSchema);
    const chain = PromptTemplate.fromTemplate(userPrompt).pipe(llm);

    const result = await chain.invoke({
      round: String(input.round),
      expertName: input.expert.name,
      domain: input.expert.domain,
      personaStyle: input.expert.personaStyle,
      topic: input.session.topic,
      topicFrame: input.researchBrief.topicFrame,
      previousInsights: input.previousInsights.length > 0
        ? input.previousInsights.map((i) => i.insight).join(' | ')
        : (lang === 'zh' ? '无' : 'None'),
      stance: input.expert.stance,
      language: outputLang
    });

    return {
      ...result,
      id: crypto.randomUUID(),
      round: input.round,
      expertId: input.expert.id
    } as Insight;
  }
}
