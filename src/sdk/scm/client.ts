import { apiGet, apiPost, apiPut, apiDelete, apiClient } from '../../services/api/client.js';
import type { GitGroup, GitProject, AppLevel, AppOwner, CodeNoticeGroup } from './types.js';

export async function listGitGroups(search?: string, page = 1, limit = 20): Promise<{ data: GitGroup[]; count: number }> {
  const params = new URLSearchParams();
  if (search) params.set('group_name', search);
  params.set('page', String(page));
  params.set('limit', String(limit));
  const res = await apiClient.getClient().get(`/scm/groups/?${params.toString()}`);
  const data = res.data;
  return {
    data: data.context || data.data || [],
    count: data.count || 0,
  };
}

export async function createGitGroup(groupName: string, groupId: string, description: string): Promise<{ msg: string }> {
  return apiPost<{ msg: string }>('/scm/groups/', { group_name: groupName, group_id: groupId, description });
}

export async function listGitProjects(search?: string, topic?: string, page = 1, limit = 20): Promise<{ context: GitProject[]; count: number }> {
  const params = new URLSearchParams();
  if (search) params.set('project_name', search);
  if (topic) params.set('topic', topic);
  params.set('page', String(page));
  params.set('limit', String(limit));
  const res = await apiClient.getClient().get(`/scm/projects/?${params.toString()}`);
  const data = res.data;
  return {
    context: data.context || data.data || [],
    count: data.count || 0,
  };
}

export async function createGitProject(data: {
  project_name: string;
  group_path: string;
  group_id: string;
  description?: string;
  level?: string;
  frame?: string;
  framework?: string;
  archetype?: string;
  spring_boot_version?: string;
  config_center?: string;
  registry_center?: string;
  approval_group_id?: string;
  approval_group_name?: string;
  username?: string;
}): Promise<{ msg: string }> {
  return apiPost<{ msg: string }>('/scm/projects/', { ...data, type: 'add' });
}

export async function offlineGitProject(projectName: string): Promise<{ msg: string }> {
  return apiDelete<{ msg: string }>('/scm/projects/', { data: { project_name: projectName } });
}

export async function getAppLevel(appName: string): Promise<AppLevel> {
  return apiGet<AppLevel>(`/scm/app/lv/?app_name=${encodeURIComponent(appName)}`);
}

export async function setAppLevel(appName: string, level: string): Promise<{ msg: string }> {
  return apiPut<{ msg: string }>('/scm/app/lv/', { app_name: appName, level });
}

export async function getAppOwner(appName: string): Promise<AppOwner> {
  return apiGet<AppOwner>(`/scm/app/owner/?app_name=${encodeURIComponent(appName)}`);
}

export async function revertGit(appName: string, helmVersion: string, targetBranch = 'master'): Promise<{ context: string }> {
  return apiPost<{ context: string }>('/scm/app/revert/', { app_name: appName, helm_version: helmVersion, target_branch: targetBranch });
}

export async function listCodeNoticeGroups(): Promise<CodeNoticeGroup[]> {
  const res = await apiClient.getClient().get('/scm/code-notice/groups/');
  const data = res.data;
  return data.context || data.data || [];
}
