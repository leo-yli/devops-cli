import { apiGet, apiClient } from './client.js';

export interface Scheme {
  id: number;
  name: string;
  introduction?: string;
  is_public?: boolean;
  director?: string;
  status?: string;
  status_note?: string;
  listen?: boolean;
  is_delete?: boolean;
  create_time?: string;
  modify_time?: string;
}

export interface DemandScheme {
  id: number;
  name: string;
  git_branch: string;
  scheme_id: number;
  status?: string;
  description?: string;
  username: string;
  creator?: string;
  developer?: string;
  tester?: string;
  archived?: boolean;
  is_mr?: boolean;
  is_delete?: boolean;
  create_time?: string;
  modify_time?: string;
}

export interface SchemePipeline {
  id: number;
  pipeline_name?: string;
  appname?: string;
  git_repo?: string;
}

export class SchemesService {
  async listSchemes(): Promise<Scheme[]> {
    const res = await apiClient.getClient().get('/schemes/main-schemes/');
    const data = res.data;
    if (Array.isArray(data)) return data;
    return data.context || data.data || [];
  }

  async getScheme(id: string | number): Promise<Scheme> {
    return apiGet<Scheme>(`/schemes/main-schemes/${id}/`);
  }

  async listDemandSchemes(schemeId: string | number, page = 1, limit = 20, appName?: string): Promise<DemandScheme[]> {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (appName) params.set('app_name', appName);
    const res = await apiClient.getClient().get(`/schemes/main-schemes/${schemeId}/demand-schemes/?${params.toString()}`, { timeout: 30000 });
    const data = res.data;
    if (Array.isArray(data)) return data;
    return data.context || data.data || [];
  }

  async getDemandScheme(schemeId: string | number, demandSchemeId: string | number): Promise<DemandScheme> {
    return apiGet<DemandScheme>(`/schemes/main-schemes/${schemeId}/demand-schemes/${demandSchemeId}/`);
  }

  async listSchemePipelines(schemeId: string | number): Promise<SchemePipeline[]> {
    return apiGet<SchemePipeline[]>(`/schemes/main-schemes/${schemeId}/pipeline/`);
  }
}
