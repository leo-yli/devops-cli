import { apiGet, apiPost, apiPut, apiDelete, apiClient } from './client.js';
import type { PipelineRunStatus } from '../../sdk/pipeline/types.js';

export interface Pipeline {
  id: number;
  name?: string;
  pipeline_name?: string;
  app_name: string;
  trigger_type?: number;
  auto_type?: string;
  git_repo_url?: string;
  git_branch?: string;
  pack_type?: string;
  project_name?: string;
  create_time?: string;
  modify_time?: string;
}

export interface ExecuteLog {
  id: number;
  build_id: number;
  pipeline_name: string;
  state: number;
  cost_time: number;
  username: string;
  git_commit_id?: string;
  create_time?: string;
}

export class PipelineService {
  async listPipelines(): Promise<string[]> {
    return apiGet<string[]>('/pipeline/all/');
  }

  async getPipeline(pipelineName: string): Promise<Pipeline> {
    return apiGet<Pipeline>(`/pipeline/${pipelineName}/`);
  }

  async triggerPipeline(pipelineName: string, params?: Record<string, unknown>): Promise<{ task_id: string }> {
    return apiPost<{ task_id: string }>(`/pipeline/operations/${pipelineName}/`, { buildParameters: JSON.stringify(params || {}) });
  }

  async cancelPipeline(pipelineName: string): Promise<{ status: number; context: string }> {
    return apiDelete<{ status: number; context: string }>(`/pipeline/operations/${pipelineName}/`);
  }

  async getPipelineRecords(pipelineName: string, demandSchemeId: number, limit = 10, page = 1): Promise<{ data: ExecuteLog[]; count: number }> {
    const res = await apiClient.getClient().get(`/pipeline/${pipelineName}/${demandSchemeId}/details/record/?limit=${limit}&page=${page}`);
    const data = res.data;
    return {
      data: data.context || data.data || [],
      count: data.count || 0,
    };
  }

  async getPipelineRunStatus(pipelineName: string, demandSchemeId: number): Promise<PipelineRunStatus> {
    return apiGet<PipelineRunStatus>(`/pipeline/${pipelineName}/${demandSchemeId}/details/run/`);
  }

  async rerunStage(pipelineName: string, stageSeq: number): Promise<{ status: number; context: string }> {
    return apiPut<{ status: number; context: string }>(`/pipeline/operations/${pipelineName}/${stageSeq}/`);
  }
}
