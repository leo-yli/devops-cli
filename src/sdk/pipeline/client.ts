import { apiGet, apiPost, apiPut, apiDelete, apiClient } from '../../services/api/client.js';
import type { Pipeline, Stage, Task, ExecuteLog, ExecuteStageLog, PipelineGroup, PipelineRunStatus } from './types.js';

export async function listPipelines(): Promise<string[]> {
  return apiGet<string[]>('/pipeline/all/');
}

export async function getPipeline(pipelineName: string): Promise<Pipeline> {
  return apiGet<Pipeline>(`/pipeline/${pipelineName}/`);
}

export async function getPipelineData(pipelineName: string): Promise<{ pipeline: Pipeline; stages: Stage[]; tasks: Task[] }> {
  return apiGet<{ pipeline: Pipeline; stages: Stage[]; tasks: Task[] }>(`/pipeline/${pipelineName}/`);
}

export async function runPipeline(pipelineName: string, buildParameters: Record<string, unknown> = {}): Promise<{ task_id: string; context: string }> {
  const res = await apiClient.getClient().post(`/pipeline/operations/${pipelineName}/`, { buildParameters: JSON.stringify(buildParameters) });
  const data = res.data;
  if (data.error) {
    throw new Error(data.error);
  }
  return { task_id: data.task_id, context: data.context };
}

export async function abortPipeline(pipelineName: string): Promise<{ status: number; context: string }> {
  const res = await apiClient.getClient().delete(`/pipeline/operations/${pipelineName}/`);
  const data = res.data;
  if (data.error) {
    throw new Error(data.error);
  }
  return { status: data.status, context: data.context };
}

export async function rerunStage(pipelineName: string, stageSeq: number): Promise<{ status: number; context: string }> {
  const res = await apiClient.getClient().put(`/pipeline/operations/${pipelineName}/${stageSeq}/`);
  const data = res.data;
  if (data.error) {
    throw new Error(data.error);
  }
  return { status: data.status, context: data.context };
}

export async function getPipelineRecords(pipelineName: string, demandSchemeId: number, limit = 10, page = 1): Promise<{ data: ExecuteLog[]; count: number }> {
  const res = await apiClient.getClient().get(`/pipeline/${pipelineName}/${demandSchemeId}/details/record/?limit=${limit}&page=${page}`);
  const data = res.data;
  return {
    data: data.context || data.data || [],
    count: data.count || 0,
  };
}

export async function getPipelineRunStatus(pipelineName: string, demandSchemeId: number): Promise<PipelineRunStatus> {
  return apiGet<PipelineRunStatus>(`/pipeline/${pipelineName}/${demandSchemeId}/details/run/`);
}

export async function getPipelineStageDetails(pipelineName: string, demandSchemeId: number, buildId: string): Promise<{ stages: ExecuteStageLog[] }> {
  return apiGet<{ stages: ExecuteStageLog[] }>(`/pipeline/${pipelineName}/${demandSchemeId}/${buildId}/details/`);
}

export async function getPipelineGroups(): Promise<PipelineGroup[]> {
  return apiGet<PipelineGroup[]>('/pipeline/task/groups/');
}
