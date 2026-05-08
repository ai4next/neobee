import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import fs from 'fs';
import path from 'path';

export type LLMProvider = 'openai' | 'anthropic' | 'openrouter';

export interface StageProvider {
  stage: string;
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  baseURL?: string;
}

export interface Config {
  providers: StageProvider[];
}

let config: Config | null = null;
let llmCache: Map<string, ChatOpenAI | ChatAnthropic> = new Map();

export function getConfig(): Config {
  if (config) {
    return config;
  }

  const configPath = path.join(process.env.HOME || '', '.neobee', 'neobee.json');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(content);
    return config!;
  }

  config = { providers: [] };
  return config;
}

export function getProviderConfig(stage: string = 'default'): StageProvider | undefined {
  const cfg = getConfig();
  return cfg.providers.find((p) => p.stage === stage) || cfg.providers.find((p) => p.stage === 'default');
}

export function getLanguageParam(session: { language?: string }): string {
  return session.language || 'en';
}

export function getLLM(stage: string = 'default'): ChatOpenAI | ChatAnthropic {
  const providerConfig = getProviderConfig(stage);
  const cacheKey = `${stage}-${providerConfig?.provider}-${providerConfig?.model}`;

  if (llmCache.has(cacheKey)) {
    return llmCache.get(cacheKey)!;
  }

  const provider = providerConfig?.provider || 'anthropic';
  const model = providerConfig?.model || 'claude-sonnet-4-7';
  const temperature = providerConfig?.temperature ?? 0.7;
  const apiKey = providerConfig?.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const baseURL = providerConfig?.baseURL;

  let llm: ChatOpenAI | ChatAnthropic;

  if (provider === 'anthropic') {
    llm = new ChatAnthropic({
      model,
      temperature,
      anthropicApiKey: apiKey,
      ...(baseURL ? { anthropicApiUrl: baseURL } : {})
    });
  } else if (provider === 'openrouter' && baseURL) {
    llm = new ChatOpenAI({
      model,
      temperature,
      openAIApiKey: apiKey,
      configuration: { baseURL }
    });
  } else {
    llm = new ChatOpenAI({
      model,
      temperature,
      openAIApiKey: apiKey,
      ...(baseURL ? { configuration: { baseURL } } : {})
    });
  }

  llmCache.set(cacheKey, llm);
  return llm;
}

export function clearLLMCache(): void {
  llmCache.clear();
}
