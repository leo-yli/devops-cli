import type { Skill, SkillDefinition, SkillExecutor } from './types.js';

/**
 * Skill 注册表 - 管理所有可用的 skills
 */
class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    if (this.skills.has(skill.definition.name)) {
      throw new Error(`Skill "${skill.definition.name}" is already registered`);
    }
    this.skills.set(skill.definition.name, skill);
  }

  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  listByTag(tag: string): Skill[] {
    return this.list().filter((s) => s.definition.tags?.includes(tag));
  }

  search(keyword: string): Skill[] {
    const lower = keyword.toLowerCase();
    return this.list().filter(
      (s) =>
        s.definition.name.toLowerCase().includes(lower) ||
        s.definition.description.toLowerCase().includes(lower) ||
        s.definition.tags?.some((t) => t.toLowerCase().includes(lower))
    );
  }

  getDefinitions(): SkillDefinition[] {
    return this.list().map((s) => s.definition);
  }
}

// 全局单例注册表
export const skillRegistry = new SkillRegistry();

/**
 * 装饰器/辅助函数：快速创建并注册 skill
 */
export function defineSkill(
  definition: SkillDefinition,
  execute: SkillExecutor
): Skill {
  const skill: Skill = { definition, execute };
  skillRegistry.register(skill);
  return skill;
}

/**
 * 批量注册内置 skills
 */
export async function registerBuiltinSkills(): Promise<void> {
  // 动态导入所有内置 skills
  // Pipeline skills
  await import('./pipeline-analyzer.js');
  await import('./pipeline-runner.js');
  await import('./pipeline-stopper.js');
  await import('./pipeline-status.js');
  // Git skills
  await import('./git-cleanup.js');
  // Deploy skills
  await import('./deploy-checker.js');
  // 组合 skills
  await import('./composed/deploy-workflow.js');
}
