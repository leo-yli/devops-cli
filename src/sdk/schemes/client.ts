import { apiGet, apiPost, apiPut, apiDelete, apiClient } from '../../services/api/client.js';
import type { Scheme, DemandScheme, SchemePipeline, DemandSchemePipeline, SchemeLog, RollbackInfo, SchemeChartData } from './types.js';

export async function listSchemes(): Promise<Scheme[]> {
  const res = await apiClient.getClient().get('/schemes/main-schemes/');
  const data = res.data;
  if (Array.isArray(data)) return data;
  return data.context || data.data || [];
}

export async function getScheme(schemeId: number): Promise<Scheme> {
  return apiGet<Scheme>(`/schemes/main-schemes/${schemeId}/`);
}

export async function listDemandSchemes(schemeId: number, page = 1, limit = 20, appName?: string, fid?: string): Promise<DemandScheme[]> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (appName) params.set('app_name', appName);
  if (fid) params.set('fid', fid);
  const res = await apiClient.getClient().get(`/schemes/main-schemes/${schemeId}/demand-schemes/?${params.toString()}`, { timeout: 30000 });
  const data = res.data;
  if (Array.isArray(data)) return data;
  return data.context || data.data || [];
}

export async function getDemandScheme(demandSchemeId: number): Promise<DemandScheme> {
  return apiGet<DemandScheme>(`/schemes/main-schemes/0/demand-schemes/${demandSchemeId}/`);
}

export async function createDemandScheme(schemeId: number, data: Partial<DemandScheme> & { pipeline_list: string[] }): Promise<{ msg: string }> {
  return apiPost<{ msg: string }>(`/schemes/main-schemes/${schemeId}/demand-schemes/`, {
    demand_scheme_name: data.name,
    branch: data.git_branch,
    description: data.description,
    pipeline_list: JSON.stringify(data.pipeline_list),
    username: data.username,
    parent_id: data.parent_id || 0,
    demand_type: data.demand_type || '',
    special_rectification: 0,
    dependent_packages_rule: JSON.stringify([]),
    apollo_rule: JSON.stringify([]),
  });
}

export async function listSchemePipelines(schemeId: number): Promise<SchemePipeline[]> {
  return apiGet<SchemePipeline[]>(`/schemes/main-schemes/${schemeId}/pipeline/`);
}

export async function runSchemePipeline(demandSchemeId: number, pipelineName: string, buildParameters: Record<string, unknown> = {}): Promise<{ task_id: string; context: string }> {
  const res = await apiClient.getClient().post(`/schemes/operations/${demandSchemeId}/${pipelineName}/`, { buildParameters: JSON.stringify(buildParameters) });
  const data = res.data;
  if (data.error) {
    throw new Error(data.error);
  }
  return { task_id: data.task_id, context: data.context };
}

export async function abortSchemePipeline(demandSchemeId: number, pipelineName: string): Promise<{ status: number; context: string }> {
  const res = await apiClient.getClient().delete(`/schemes/operations/${demandSchemeId}/${pipelineName}/`);
  const data = res.data;
  if (data.error) {
    throw new Error(data.error);
  }
  return { status: data.status, context: data.context };
}

export async function rerunSchemePipeline(demandSchemeId: number, pipelineName: string, stageSeq: number): Promise<{ status: number; context: string }> {
  const res = await apiClient.getClient().put(`/schemes/operations/${demandSchemeId}/${pipelineName}/${stageSeq}/`);
  const data = res.data;
  if (data.error) {
    throw new Error(data.error);
  }
  return { status: data.status, context: data.context };
}

export async function getRollbackInfo(demandSchemeId: number, pipelineName: string): Promise<RollbackInfo> {
  return apiGet<RollbackInfo>(`/schemes/rollback/${demandSchemeId}/${pipelineName}/`);
}

export async function doRollback(demandSchemeId: number, pipelineName: string, rollbackStage: string, rollbackVersion: string, nowVersion: string): Promise<{ task_id: string }> {
  return apiPost<{ task_id: string }>(`/schemes/rollback/${demandSchemeId}/${pipelineName}/`, {
    rollback_stage: rollbackStage,
    rollback_version: rollbackVersion,
    now_version: nowVersion,
  });
}

export async function getSchemeChart(schemeId: number, type: number, pipelineName: string, startDate: string, endDate: string): Promise<SchemeChartData> {
  return apiGet<SchemeChartData>(`/schemes/main-schemes/${schemeId}/chart/?type=${type}&pipeline_name=${pipelineName}&start_date=${startDate}&end_date=${endDate}`);
}

export async function getSchemeLogs(schemeId: number): Promise<SchemeLog[]> {
  return apiGet<SchemeLog[]>(`/schemes/main-schemes/${schemeId}/logs/`);
}

export async function getSchemeSurveys(schemeId: number): Promise<unknown> {
  return apiGet<unknown>(`/schemes/main-schemes/${schemeId}/surveys/`);
}
