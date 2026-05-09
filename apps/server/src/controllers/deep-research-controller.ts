import fs from 'fs';
import type { SessionRecord, ResearchBrief } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { workerPool } from '../workers/worker-pool.js';
import type { SearchProvider } from '../lib/search.js';

function readSearchConfig(): { searchProvider: SearchProvider; searchApiKey: string } {
  try {
    const configPath = `${process.env.HOME}/.neobee/neobee.json`;
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { searchProvider: config.searchProvider || 'duckduckgo', searchApiKey: config.searchApiKey || '' };
    }
  } catch { /* ignore */ }
  return { searchProvider: 'duckduckgo', searchApiKey: '' };
}

export class DeepResearchController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    // Skip if already done
    if (aggregate.researchBrief) {
      this.advance(session.id, 'expert_creation');
      return;
    }

    this.eventBus.emitRaw(session.id, 'research.started', 'deep_research', { topic: session.topic });
    this.createTask(session.id);

    const { searchProvider, searchApiKey } = readSearchConfig();
    const researchBrief = await workerPool.execute<ResearchBrief>(
      'deep_research',
      {
        session,
        searchProvider,
        searchApiKey
      },
      (progress) => {
        this.createStep(session.id, progress.stage, { message: progress.message });
      }
    );

    this.store.setResearchBrief(session.id, researchBrief);
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'research.completed', 'deep_research', { researchBrief });
    this.advance(session.id, 'expert_creation');
  }
}
