import { defineSkill } from './registry.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * Git 分支清理 Skill
 * 智能分析并清理已合并、过期的 Git 分支
 */
defineSkill(
  {
    name: 'git-cleanup',
    description: '智能清理 Git 仓库中已合并或过期的分支',
    version: '1.0.0',
    author: 'devops-cli',
    parameters: [
      {
        name: 'path',
        description: 'Git 仓库路径',
        type: 'string',
        required: false,
        default: '.',
      },
      {
        name: 'dryRun',
        description: '试运行模式，只显示将被删除的分支而不实际删除',
        type: 'boolean',
        required: false,
        default: true,
      },
      {
        name: 'olderThan',
        description: '清理多少天未更新的分支',
        type: 'number',
        required: false,
        default: 30,
      },
      {
        name: 'exclude',
        description: '排除的分支名称（逗号分隔）',
        type: 'string',
        required: false,
        default: 'main,master,develop',
      },
      {
        name: 'remote',
        description: '是否清理远程分支',
        type: 'boolean',
        required: false,
        default: false,
      },
    ],
    examples: [
      'dops skill run git-cleanup --path ./my-project --dry-run',
      'dops skill run git-cleanup --path ./my-project --dry-run false --older-than 7',
      'dops skill run git-cleanup --remote --exclude "main,master,release/*"',
    ],
    tags: ['git', 'cleanup', 'maintenance'],
  },
  async (ctx) => {
    const { path = '.', dryRun = true, olderThan = 30, exclude = 'main,master,develop', remote = false } =
      ctx.rawArgs as {
        path: string;
        dryRun: boolean;
        olderThan: number;
        exclude: string;
        remote: boolean;
      };

    try {
      // 验证路径
      if (!existsSync(path)) {
        return { success: false, error: `路径不存在: ${path}` };
      }

      // 验证是 Git 仓库
      try {
        execSync('git rev-parse --git-dir', { cwd: path, stdio: 'pipe' });
      } catch {
        return { success: false, error: `指定路径不是 Git 仓库: ${path}` };
      }

      ctx.output.info(`\n🧹 Git 分支清理分析`);
      ctx.output.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      ctx.output.info(`📁 仓库路径: ${path}`);
      ctx.output.info(`📅 清理条件: ${olderThan} 天未更新`);
      ctx.output.info(`🚫 排除分支: ${exclude}`);
      ctx.output.info(`🌐 远程分支: ${remote ? '是' : '否'}`);
      ctx.output.info(`🔍 模式: ${dryRun ? '试运行 (不会删除)' : '执行删除'}\n`);

      const excludeList = exclude.split(',').map((s) => s.trim());

      // 获取已合并的分支
      const mergedBranches = getMergedBranches(path, excludeList);

      // 获取过期的分支
      const staleBranches = getStaleBranches(path, olderThan, excludeList);

      // 合并列表（去重）
      const branchesToDelete = new Map<string, { reason: string; lastCommit: string }>();

      mergedBranches.forEach((b) => {
        branchesToDelete.set(b.name, { reason: '已合并到 main/master', lastCommit: b.lastCommit });
      });

      staleBranches.forEach((b) => {
        if (!branchesToDelete.has(b.name)) {
          branchesToDelete.set(b.name, { reason: `超过 ${olderThan} 天未更新`, lastCommit: b.lastCommit });
        }
      });

      if (branchesToDelete.size === 0) {
        ctx.output.success('\n✅ 没有发现需要清理的分支，仓库很整洁！');
        return { success: true, message: '没有需要清理的分支' };
      }

      // 显示将要删除的分支
      ctx.output.info(`\n📋 发现 ${branchesToDelete.size} 个分支可清理:\n`);

      const rows: string[][] = [];
      let index = 1;
      for (const [name, info] of branchesToDelete) {
        rows.push([String(index++), name, info.reason, info.lastCommit.slice(0, 8)]);
      }
      ctx.output.table(['#', '分支名', '原因', '最后提交'], rows);

      // 危险操作确认
      if (!dryRun) {
        const confirmed = await ctx.prompt.confirm(
          `\n⚠️ 确定要删除以上 ${branchesToDelete.size} 个分支吗？此操作不可恢复！`
        );

        if (!confirmed) {
          ctx.output.info('已取消操作');
          return { success: true, message: '用户取消删除' };
        }

        // 执行删除
        ctx.output.info('\n🗑️ 正在删除分支...');
        let deletedCount = 0;
        let failedCount = 0;

        for (const [name] of branchesToDelete) {
          try {
            if (remote) {
              execSync(`git push origin --delete ${name}`, { cwd: path, stdio: 'pipe' });
            }
            execSync(`git branch -d ${name}`, { cwd: path, stdio: 'pipe' });
            ctx.output.success(`  ✓ ${name}`);
            deletedCount++;
          } catch (e: any) {
            ctx.output.error(`  ✗ ${name}: ${e.message}`);
            failedCount++;
          }
        }

        ctx.output.info(`\n✅ 完成: 成功删除 ${deletedCount} 个分支`);
        if (failedCount > 0) {
          ctx.output.warning(`⚠️ ${failedCount} 个分支删除失败`);
        }

        return {
          success: failedCount === 0,
          message: `删除了 ${deletedCount} 个分支，失败 ${failedCount} 个`,
          data: { deleted: deletedCount, failed: failedCount },
        };
      } else {
        ctx.output.info('\n💡 这是试运行模式，没有实际删除任何分支。');
        ctx.output.info(`   要实际删除，请添加参数: --dry-run false`);

        return {
          success: true,
          message: `发现 ${branchesToDelete.size} 个可清理的分支（试运行模式）`,
          data: { branchesToDelete: Array.from(branchesToDelete.keys()) },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        suggestions: ['确保有 Git 仓库的写权限', '检查是否有未提交的更改'],
      };
    }
  }
);

// 获取已合并的分支
function getMergedBranches(
  repoPath: string,
  exclude: string[]
): { name: string; lastCommit: string }[] {
  try {
    // 获取已合并到 main 或 master 的分支
    const merged = execSync('git branch --merged main 2>/dev/null || git branch --merged master', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    return merged
      .split('\n')
      .map((b) => b.trim().replace(/^\* /, ''))
      .filter((b) => b && !exclude.includes(b) && !b.includes('main') && !b.includes('master'))
      .map((b) => ({
        name: b,
        lastCommit: getLastCommit(repoPath, b),
      }));
  } catch {
    return [];
  }
}

// 获取过期的分支
function getStaleBranches(
  repoPath: string,
  days: number,
  exclude: string[]
): { name: string; lastCommit: string }[] {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // 获取所有分支及其最后提交时间
    const output = execSync(
      `git for-each-ref --sort=committerdate refs/heads/ --format='%(refname:short)|%(committerdate:short)'`,
      { cwd: repoPath, encoding: 'utf-8' }
    );

    return output
      .split('\n')
      .filter((line) => line.includes('|'))
      .map((line) => {
        const [name, date] = line.split('|');
        return { name, date, lastCommit: '' };
      })
      .filter((b) => b.date < cutoffStr && !exclude.includes(b.name) && !b.name.includes('main') && !b.name.includes('master'))
      .map((b) => ({
        name: b.name,
        lastCommit: getLastCommit(repoPath, b.name),
      }));
  } catch {
    return [];
  }
}

// 获取分支的最后提交 hash
function getLastCommit(repoPath: string, branch: string): string {
  try {
    return execSync(`git rev-parse ${branch}`, { cwd: repoPath, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}
