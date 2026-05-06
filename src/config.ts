import { cosmiconfigSync } from 'cosmiconfig';
import { z } from 'zod';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'azure', 'local']).default('openai'),
  model: z.string().default('gpt-4o'),
  apiKey: z.string().default(''),
  baseUrl: z.string().default(''),
});

const agentConfigSchema = z.object({
  confirmWriteOps: z.boolean().default(true),
  maxAutoSteps: z.number().default(10),
  stream: z.boolean().default(true),
});

const configSchema = z.object({
  defaultHost: z.string().default(''),
  defaultTenant: z.string().default(''),
  defaultUsername: z.string().default(''),
  defaultPassword: z.string().default(''),
  llm: llmConfigSchema.default({}),
  agent: agentConfigSchema.default({}),
});

export type DopsConfig = z.infer<typeof configSchema>;

const CONFIG_DIR = join(homedir(), '.dops');
const CONFIG_PATH = join(CONFIG_DIR, 'config.yaml');

const DEFAULT_CONFIG: DopsConfig = {
  defaultHost: 'https://ci.jlpay.com',
  defaultTenant: '',
  defaultUsername: '',
  defaultPassword: '',
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: '',
    baseUrl: '',
  },
  agent: {
    confirmWriteOps: true,
    maxAutoSteps: 10,
    stream: true,
  },
};

async function ensureConfigFile() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_PATH)) {
    const yaml = await import('yaml');
    writeFileSync(CONFIG_PATH, yaml.stringify(DEFAULT_CONFIG), 'utf-8');
  }
}

export async function loadConfigAsync(): Promise<DopsConfig> {
  await ensureConfigFile();
  const explorer = cosmiconfigSync('dops', {
    searchPlaces: ['.dopsrc', '.dopsrc.json', '.dopsrc.yaml', '.dopsrc.yml', '.dopsrc.js', 'dops.config.js'],
  });
  const result = explorer.load(CONFIG_PATH);
  const parsed = configSchema.safeParse(result?.config ?? DEFAULT_CONFIG);
  if (!parsed.success) {
    console.warn('Config validation failed, using defaults:', parsed.error.format());
    return DEFAULT_CONFIG;
  }
  return parsed.data;
}

export function loadConfig(): DopsConfig {
  const explorer = cosmiconfigSync('dops', {
    searchPlaces: ['.dopsrc', '.dopsrc.json', '.dopsrc.yaml', '.dopsrc.yml', '.dopsrc.js', 'dops.config.js'],
  });
  try {
    const result = existsSync(CONFIG_PATH) ? explorer.load(CONFIG_PATH) : null;
    const parsed = configSchema.safeParse(result?.config ?? DEFAULT_CONFIG);
    if (!parsed.success) {
      console.warn('Config validation failed, using defaults:', parsed.error.format());
      return DEFAULT_CONFIG;
    }
    return parsed.data;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<DopsConfig>) {
  ensureConfigFile();
  const current = loadConfig();
  const merged = { ...current, ...config };
  const yaml = await import('yaml');
  writeFileSync(CONFIG_PATH, yaml.stringify(merged), 'utf-8');
}
