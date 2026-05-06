import { apiGet, apiPost, apiDelete, apiClient } from './client.js';

export interface GitProject {
  id: number;
  name: string;
  path_with_namespace?: string;
  full_path?: string;
  description?: string;
  web_url?: string;
  level?: string;
  frame?: string;
  framework?: string;
}

export interface GitGroup {
  id: number;
  name: string;
  path: string;
  description?: string;
}

export interface AppOwner {
  app_name: string;
  owner?: string;
}

export interface CodeNoticeGroup {
  id: number;
  name: string;
  description?: string;
  wecom_robot?: string;
  create_time?: string;
  modify_time?: string;
}

export class SCMService {
  async listProjects(search?: string, page = 1, limit = 20): Promise<{ context: GitProject[]; count: number }> {
    const params = new URLSearchParams();
    if (search) params.set('project_name', search);
    params.set('page', String(page));
    params.set('limit', String(limit));
    const res = await apiClient.getClient().get(`/scm/projects/?${params.toString()}`);
    const data = res.data;
    return {
      context: data.context || data.data || [],
      count: data.count || 0,
    };
  }

  async createProject(data: { project_name: string; group_path: string; group_id: string; description?: string }): Promise<{ msg: string }> {
    return apiPost<{ msg: string }>('/scm/projects/', { ...data, type: 'add' });
  }

  async offlineProject(projectName: string): Promise<{ msg: string }> {
    return apiDelete<{ msg: string }>('/scm/projects/', { data: { project_name: projectName } });
  }

  async listGroups(search?: string, page = 1, limit = 20): Promise<{ data: GitGroup[]; count: number }> {
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

  async getAppOwner(appName: string): Promise<AppOwner> {
    return apiGet<AppOwner>(`/scm/app/owner/?app_name=${encodeURIComponent(appName)}`);
  }

  async listCodeNoticeGroups(page = 1, limit = 20): Promise<{ data: CodeNoticeGroup[]; count: number }> {
    const res = await apiClient.getClient().get(`/scm/code-notice/groups/?page=${page}&limit=${limit}`);
    const data = res.data;
    return {
      data: data.context || data.data || [],
      count: data.count || 0,
    };
  }
}
