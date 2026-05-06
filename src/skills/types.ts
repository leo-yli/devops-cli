/**
 * Skill 系统类型定义
 * Skill 是可扩展的独立功能模块，可以被 CLI 命令或 Agent 调用
 */

export interface SkillParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  version: string;
  author?: string;
  parameters: SkillParameter[];
  examples?: string[];
  tags?: string[];
}

export interface SkillContext {
  // 当前 CLI 上下文
  config: {
    host: string;
    tenant?: string;
  };
  // 用户输入的原始参数
  rawArgs: Record<string, unknown>;
  // 交互式输入函数
  prompt: {
    input: (message: string) => Promise<string>;
    confirm: (message: string) => Promise<boolean>;
    select: <T>(message: string, choices: { label: string; value: T }[]) => Promise<T>;
  };
  // 输出函数
  output: {
    info: (message: string) => void;
    success: (message: string) => void;
    warning: (message: string) => void;
    error: (message: string) => void;
    table: (headers: string[], rows: string[][]) => void;
    json: (data: unknown) => void;
  };
  // 进度条
  progress: <T>(message: string, task: Promise<T>) => Promise<T>;
}

export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  suggestions?: string[];
}

export type SkillExecutor = (context: SkillContext) => Promise<SkillResult>;

export interface Skill {
  definition: SkillDefinition;
  execute: SkillExecutor;
}
