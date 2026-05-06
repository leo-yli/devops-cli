/**
 * 增强的 Skill 类型定义
 * 支持组合调用和 MCP 集成
 */

import type { SkillContext, SkillResult, SkillDefinition } from './types.js';

export type SkillExecutor = (context: SkillContext) => Promise<SkillResult>;

/**
 * 组合 Skill 定义
 */
export interface ComposedSkill {
  name: string;
  description: string;
  version: string;
  // 子 skill 调用链
  steps: SkillStep[];
}

export interface SkillStep {
  // 引用的 skill 名称
  skill: string;
  // 参数映射
  params: Record<string, string | number | boolean>;
  // 条件执行
  condition?: string;
  // 结果保存变量名
  saveAs?: string;
  // 错误处理: 'stop' | 'continue' | 'retry'
  onError?: 'stop' | 'continue' | 'retry';
}

/**
 * 可组合的 Skill 接口
 */
export interface ComposableSkill {
  definition: SkillDefinition;
  execute: SkillExecutor;
  // 组合能力
  compose?: {
    // 依赖的其他 skills
    dependsOn?: string[];
    // 可作为步骤被组合
    composable: boolean;
    // 输出变量定义
    outputs?: string[];
  };
  // 元数据
  meta?: {
    category?: string;
    tags?: string[];
    estimatedTime?: number;
    requiresAuth?: boolean;
  };
}

/**
 * Skill 组合执行器
 */
export class SkillComposer {
  private variables = new Map<string, unknown>();

  constructor(private getSkill: (name: string) => ComposableSkill | undefined) {}

  async executeComposed(composed: ComposedSkill, initialContext: SkillContext): Promise<SkillResult> {
    const results: SkillResult[] = [];

    for (const step of composed.steps) {
      // 条件判断
      if (step.condition) {
        const shouldExecute = this.evaluateCondition(step.condition);
        if (!shouldExecute) continue;
      }

      // 解析参数
      const params = this.resolveParams(step.params);

      // 获取 skill
      const skill = this.getSkill(step.skill);
      if (!skill) {
        return {
          success: false,
          error: `依赖的 Skill "${step.skill}" 未找到`,
        };
      }

      // 执行
      const stepContext: SkillContext = {
        ...initialContext,
        rawArgs: params,
      };

      try {
        const result = await skill.execute(stepContext);
        results.push(result);

        if (!result.success) {
          if (step.onError === 'continue') continue;
          return result;
        }

        // 保存结果
        if (step.saveAs) {
          this.variables.set(step.saveAs, result.data);
        }
      } catch (e: any) {
        if (step.onError === 'continue') continue;
        return { success: false, error: e.message };
      }
    }

    return {
      success: true,
      data: {
        steps: results.length,
        results: results.map((r) => r.data),
      },
      message: `成功执行 ${results.length} 个步骤`,
    };
  }

  private evaluateCondition(condition: string): boolean {
    // 简单变量替换和判断
    const resolved = condition.replace(/\$\{(\w+)\}/g, (_, name) => {
      const val = this.variables.get(name);
      return val !== undefined ? String(val) : 'undefined';
    });
    try {
      return new Function('return ' + resolved)();
    } catch {
      return false;
    }
  }

  private resolveParams(params: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        resolved[key] = value.replace(/\$\{(\w+)\}/g, (_, name) => {
          return this.variables.get(name) as string;
        });
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  getVariable(name: string): unknown {
    return this.variables.get(name);
  }

  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
  }
}
