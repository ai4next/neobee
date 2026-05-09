import { PromptTemplate } from '@langchain/core/prompts'; 
import { z } from 'zod';
import type { ExpertProfile, ResearchBrief, SessionRecord } from '@neobee/shared';
import { getLLM } from '../lib/llm.js';

const ExpertProfileSchema = z.object({
  name: z.string().describe('A realistic first name and title'),
  domain: z.string().describe('Their area of expertise'),
  personaStyle: z.string().describe('How they think and communicate'),
  stance: z.string().describe('Their general viewpoint on ideas'),
  skills: z.array(z.string()).describe('3-4 relevant skills')
});

const ExpertsOutputSchema = z.object({
  experts: z.array(ExpertProfileSchema).describe('An array of expert profiles')
});

const userPrompt = `Create {expertCount} expert profiles for topic "{topic}".

Topic frame: {topicFrame}
Open questions: {openQuestions}`;

export class ExpertCreationChain {
  async run(session: SessionRecord, researchBrief: ResearchBrief): Promise<ExpertProfile[]> {
    const llm = getLLM().withStructuredOutput(ExpertsOutputSchema);

    const prompt = PromptTemplate.fromTemplate(userPrompt);

    const chain = prompt.pipe(llm);

    const result = await chain.invoke({
      expertCount: String(session.expertCount),
      topic: session.topic,
      topicFrame: researchBrief.topicFrame,
      openQuestions: researchBrief.openQuestions.join('; ')
    });

    return result.experts.map((profile) => ({
      ...profile,
      id: crypto.randomUUID()
    }));
  }
}
