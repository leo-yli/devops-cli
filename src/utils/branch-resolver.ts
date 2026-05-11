import { GitService } from '../services/git/service.js';
import * as schemesClient from '../sdk/schemes/client.js';
import type { DemandScheme } from '../sdk/schemes/types.js';

const FEATURE_BRANCH_PATTERN = /^feature\/(\d+)(?:[-_].*)?$/i;

export function extractFeatureId(branch: string): string | null {
  const match = branch.match(FEATURE_BRANCH_PATTERN);
  return match ? match[1] : null;
}

function normalizeDemandScheme(raw: any): DemandScheme {
  return {
    id: raw.id ?? raw.fid ?? 0,
    name: raw.name ?? raw.fname ?? '',
    demand_type: raw.demand_type ?? raw.fdemandType ?? '',
    description: raw.description ?? raw.fdescription,
    git_branch: raw.git_branch ?? raw.fgitBranch ?? '',
    archived: raw.archived ?? raw.farchived ?? false,
    lock: raw.lock ?? raw.flock ?? false,
    status: raw.status ?? raw.fstatus,
    complete_time: raw.complete_time ?? raw.fcompleteTime,
    username: raw.username ?? raw.fusername ?? '',
    creator: raw.creator ?? raw.fcreator ?? '',
    developer: raw.developer ?? raw.fdeveloper ?? '',
    tester: raw.tester ?? raw.ftester ?? '',
    cc: raw.cc ?? raw.fcc ?? '',
    scheme_object: raw.scheme_object ?? raw.fschemeObject ?? '',
    listen_status: raw.listen_status ?? raw.flistenStatus ?? 0,
    tickets_id: raw.tickets_id ?? raw.fticketsId ?? '',
    parent_id: raw.parent_id ?? raw.fparentId ?? 0,
    scheme_id: raw.scheme_id ?? raw.fschemeId ?? 0,
    is_special_rectification: raw.is_special_rectification ?? raw.fisSpecialRectification ?? false,
    is_mr: raw.is_mr ?? raw.fisMr ?? false,
    is_delete: raw.is_delete ?? raw.fisDelete ?? false,
    create_time: raw.create_time ?? raw.fcreateTime,
    modify_time: raw.modify_time ?? raw.fmodifyTime,
  };
}

export async function resolveDemandSchemeByKeyword(keyword: string, schemeId?: number): Promise<DemandScheme | null> {
  const numericId = Number(keyword);
  const defaultSchemeId = 48200023;
  const targetSchemeId = schemeId ?? defaultSchemeId;

  // 1. 通过 fid 参数在指定项目下查询 demand scheme
  if (!Number.isNaN(numericId) && numericId > 0) {
    try {
      const demands = await schemesClient.listDemandSchemes(targetSchemeId, 1, 10, undefined, keyword);
      if (demands.length > 0) {
        return normalizeDemandScheme(demands[0]);
      }
    } catch {
      // fid 查询失败，进入兜底搜索
    }
  }

  // 2. 跨所有主项目搜索匹配的 demand scheme
  const schemes = await schemesClient.listSchemes();
  for (const scheme of schemes.slice(0, 20)) {
    try {
      const demands = await schemesClient.listDemandSchemes(scheme.id, 1, 50);
      const matches = demands.filter((d) => {
        const idStr = String(d.id ?? d.fid ?? '');
        const branchStr = d.git_branch ?? d.fgitBranch ?? '';
        return idStr.includes(keyword) || branchStr.includes(keyword);
      });

      if (matches.length > 0) {
        const exactMatch = matches.find((m) => String(m.id ?? m.fid ?? '') === keyword);
        return normalizeDemandScheme(exactMatch || matches[0]);
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
