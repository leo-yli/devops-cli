import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommit?: string;
  lastCommitDate?: string;
}

export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

/**
 * Git 服务
 * 封装常用 Git 操作
 */
export class GitService {
  private cwd: string;

  constructor(cwd: string = '.') {
    this.cwd = resolve(cwd);
  }

  /**
   * 验证是否为 Git 仓库
   */
  isRepo(): boolean {
    try {
      execSync('git rev-parse --git-dir', { cwd: this.cwd, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取当前分支
   */
  getCurrentBranch(): string {
    return execSync('git branch --show-current', { cwd: this.cwd, encoding: 'utf-8' }).trim();
  }

  /**
   * 获取所有分支
   */
  getBranches(): GitBranch[] {
    const output = execSync('git branch -a --format="%(refname:short)|%(HEAD)"', {
      cwd: this.cwd,
      encoding: 'utf-8',
    });

    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [name, head] = line.split('|');
        return {
          name,
          isCurrent: head === '*',
          isRemote: name.startsWith('remotes/'),
        };
      });
  }

  /**
   * 获取已合并的分支
   */
  getMergedBranches(targetBranch: string = 'main'): GitBranch[] {
    try {
      const output = execSync(`git branch --merged ${targetBranch} --format="%(refname:short)"`, {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      return output
        .split('\n')
        .filter((name) => name && name !== targetBranch && name !== 'master' && !name.startsWith('*'))
        .map((name) => ({ name, isCurrent: false, isRemote: false }));
    } catch {
      return [];
    }
  }

  /**
   * 获取过期分支
   */
  getStaleBranches(days: number): GitBranch[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    try {
      const output = execSync(
        `git for-each-ref --sort=committerdate refs/heads/ --format="%(refname:short)|%(committerdate:short)"`,
        { cwd: this.cwd, encoding: 'utf-8' }
      );

      return output
        .split('\n')
        .filter((line) => line.includes('|'))
        .map((line) => {
          const [name, date] = line.split('|');
          return { name, date, isCurrent: false, isRemote: false };
        })
        .filter((b: any) => b.date < cutoffStr)
        .map((b: any) => ({ name: b.name, isCurrent: false, isRemote: false }));
    } catch {
      return [];
    }
  }

  /**
   * 获取仓库状态
   */
  getStatus(): GitStatus {
    const branch = this.getCurrentBranch();
    const statusOutput = execSync('git status --porcelain', { cwd: this.cwd, encoding: 'utf-8' });

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    statusOutput.split('\n').forEach((line) => {
      if (!line) return;
      const status = line.slice(0, 2);
      const file = line.slice(3);

      if (status[0] !== ' ' && status[0] !== '?') staged.push(file);
      if (status[1] !== ' ') unstaged.push(file);
      if (status === '??') untracked.push(file);
    });

    return {
      branch,
      isClean: !statusOutput.trim(),
      staged,
      unstaged,
      untracked,
    };
  }

  /**
   * 删除分支
   */
  deleteBranch(name: string, force: boolean = false): void {
    const flag = force ? '-D' : '-d';
    execSync(`git branch ${flag} ${name}`, { cwd: this.cwd, stdio: 'pipe' });
  }

  /**
   * 获取提交日志
   */
  getLog(options: { maxCount?: number; format?: string; branch?: string } = {}): string {
    const { maxCount = 10, format = '%h|%s|%an|%ad', branch = 'HEAD' } = options;
    return execSync(`git log ${branch} -n ${maxCount} --format="${format}" --date=short`, {
      cwd: this.cwd,
      encoding: 'utf-8',
    });
  }

  /**
   * 获取最近提交的文件变更
   */
  getChangedFiles(ref: string = 'HEAD~1'): string[] {
    const output = execSync(`git diff --name-only ${ref}`, { cwd: this.cwd, encoding: 'utf-8' });
    return output.split('\n').filter(Boolean);
  }

  /**
   * 检查分支是否存在
   */
  branchExists(name: string): boolean {
    try {
      execSync(`git rev-parse --verify ${name}`, { cwd: this.cwd, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}

export const gitService = new GitService();
