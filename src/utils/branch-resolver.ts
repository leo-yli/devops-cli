import { GitService } from '../services/git/service.js';
import * as schemesClient from '../sdk/schemes/client.js';
import type { DemandScheme } from '../sdk/schemes/types.js';

const FEATURE_BRANCH_PATTERN = /^feature\/(\d+)(?:[-_].*)?$/i;

export function extractFeatureId(branch: string): string | null {
  const match = branch.match(FEATURE_BRANCH_PATTERN);
  return match ? match[1] : null;
}

export async function resolveDemandSchemeByKeyword(keyword: string): Promise<DemandScheme | null> {
  const numericId = Number(keyword);

  // 1. 先尝试直接作为 demand scheme ID 查询
  if (!Number.isNaN(numericId) && numericId > 0) {
    try {
      return await schemesClient.getDemandScheme(numericId);
    } catch {
      // 直接查询失败，进入搜索模式
    }
  }

  // 2. 跨所有主项目搜索匹配的 demand scheme
  const schemes = await schemesClient.listSchemes();
  for (const scheme of schemes.slice(0, 20)) {
    try {
      const demands = await schemesClient.listDemandSchemes(scheme.id, 1, 50);
      const matches = demands.filter((d) => {
        const idStr = String(d.id);
        const branchStr = d.git_branch || '';
        return idStr.includes(keyword) || branchStr.includes(keyword);
      });

      if (matches.length > 0) {
        const exactMatch = matches.find((m) => String(m.id) === keyword);
        return exactMatch || matches[0];
      }
    } catch {
      // 忽略单个项目的查询失败
    }
  }

  return null;
}

export async function resolveDemandSchemeFromCurrentBranch(cwd?: string): Promise<DemandScheme | null> {
  const git = new GitService(cwd);
  if (!git.isRepo()) {
    return null;
  }

  const branch = git.getCurrentBranch();
  const featureId = extractFeatureId(branch);
  if (!featureId) {
    return null;
  }

  return resolveDemandSchemeByKeyword(featureId);
}
