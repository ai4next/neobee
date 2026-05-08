import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ExpertProfile, ResearchBrief, SessionRecord } from '@neobee/shared';
import { getLLM } from '../lib/llm.js';

const ExpertProfileSchema = z.object({
  name: z.string(),
  domain: z.string(),
  personaStyle: z.string(),
  stance: z.string(),
  skills: z.array(z.string())
});

const ExpertsArraySchema = z.array(ExpertProfileSchema);

const userPrompt = `Create {expertCount} expert profiles for topic "{topic}".

Topic frame: {topicFrame}
Open questions: {openQuestions}

Each expert should have:
- name: A realistic first name and title
- domain: Their area of expertise
- personaStyle: How they think and communicate
- stance: Their general viewpoint on ideas
- skills: 3-4 relevant skills

Return an array of {expertCount} experts.`;

export class ExpertCreationChain {
  async run(session: SessionRecord, researchBrief: ResearchBrief): Promise<ExpertProfile[]> {
    const llm = getLLM();
    const userPromptTemplate = userPrompt;

    const chain = RunnableSequence.from([
      PromptTemplate.fromTemplate(userPromptTemplate),
      llm.withStructuredOutput(zodToJsonSchema(ExpertsArraySchema), { strict: false }),
      (output) => {
        if (typeof output === 'string') {
          return JSON.parse(output) as ExpertProfile[];
        }
        return output as ExpertProfile[];
      }
    ]);

    return chain.invoke({
      expertCount: String(session.expertCount),
      topic: session.topic,
      topicFrame: researchBrief.topicFrame,
      openQuestions: researchBrief.openQuestions.join('; ')
    });
  }
}
