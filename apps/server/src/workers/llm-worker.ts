import { existsSync } from 'fs';
import { createRequire } from 'module';
import { parentPort, workerData } from 'worker_threads';

const require = createRequire(import.meta.url);

function loadChain(mod: string) {
  // tsx dev: load .ts directly; production (tsc compiled): fall back to .js
  if (existsSync(new URL(`../chains/${mod}.ts`, import.meta.url))) {
    return require(`../chains/${mod}.ts`);
  }
  return require(`../chains/${mod}.js`);
}

const { DeepResearchChain } = loadChain('deep-research-chain');
const { ExpertCreationChain } = loadChain('expert-creation-chain');
const { InsightRefinementChain } = loadChain('insight-refinement-chain');
const { CrossReviewChain } = loadChain('cross-review-chain');
const { IdeaSynthesisChain } = loadChain('idea-synthesis-chain');                                
interface WorkerTask {
  chainType: string;
  params: Record<string, unknown>;
}

async function run() {
  const { chainType, params } = workerData as WorkerTask;

  switch (chainType) {
    case 'deep_research': {
      const chain = new DeepResearchChain();
      const p = params as any;
      const result = await chain.run({
        session: p.session,
        searchProvider: p.searchProvider,
        searchApiKey: p.searchApiKey,
        callbacks: {
          onProgress: (progress: any) => {
            parentPort?.postMessage({ type: 'progress', data: progress });
          }
        }
      });
      parentPort?.postMessage({ type: 'result', data: result });
      break;
    }

    case 'expert_creation': {
      const chain = new ExpertCreationChain();
      const paramsObj = params as any;
      const result = await chain.run(paramsObj.session as any, paramsObj.researchBrief as any);
      parentPort?.postMessage({ type: 'result', data: result });
      break;
    }

    case 'insight_refinement': {
      const chain = new InsightRefinementChain();
      const result = await chain.run(params as any);
      parentPort?.postMessage({ type: 'result', data: result });
      break;
    }

    case 'cross_review': {
      const chain = new CrossReviewChain();
      const paramsObj = params as any;
      const result = await chain.run(
        paramsObj.session as any,
        paramsObj.experts as any,
        paramsObj.insights as any,
        {
          completedExpertIds: paramsObj.completedExpertIds ? new Set(paramsObj.completedExpertIds as string[]) : undefined,
          onProgress: (progress: any) => {
            parentPort?.postMessage({ type: 'progress', data: progress });
          }
        }
      );
      parentPort?.postMessage({ type: 'result', data: result });
      break;
    }

    case 'idea_synthesis': {
      const chain = new IdeaSynthesisChain();
      const paramsObj = params as any;
      const result = await chain.run(
        paramsObj.session as any,
        paramsObj.researchBrief as any,
        paramsObj.insights as any,
        paramsObj.reviews as any
      );
      parentPort?.postMessage({ type: 'result', data: result });
      break;
    }

    default:
      throw new Error(`Unknown chain type: ${chainType}`);
  }
}

run().catch((err) => {
  parentPort?.postMessage({
    type: 'error',
    data: err instanceof Error ? err.message : String(err)
  });
});