import fs from 'fs';
import type { StageProvider } from './llm.js';

interface NeobeeConfig {
  providers?: StageProvider[];
  searchProvider?: string;
  searchApiKey?: string;
}

const CONFIG_PATH = `${process.env.HOME}/.neobee/neobee.json`;
const CACHE_TTL_MS = 5000;

let cachedConfig: NeobeeConfig | null = null;
let lastRead = 0;

export function getConfig(): NeobeeConfig {
  const now = Date.now();
  if (cachedConfig && (now - lastRead < CACHE_TTL_MS)) {
    return cachedConfig;
  }

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      cachedConfig = JSON.parse(content) as NeobeeConfig;
    } else {
      cachedConfig = { providers: [] };
    }
  } catch {
    cachedConfig = { providers: [] };
  }

  lastRead = now;
  return cachedConfig;
}

export function saveConfig(config: NeobeeConfig): void {
  const configDir = `${process.env.HOME}/.neobee`;
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  cachedConfig = config;
  lastRead = Date.now();
}
