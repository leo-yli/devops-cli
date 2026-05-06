export interface Scheme {
  id: number;
  name: string;
  introduction?: string;
  is_public: boolean;
  director?: string;
  status: 'normal' | 'runaway' | 'file';
  status_note: string;
  listen: boolean;
  is_delete: boolean;
  create_time?: string;
  modify_time?: string;
}

export interface SchemeMember {
  id: number;
  scheme_id: number;
  username?: string;
  member_type: number; // 1: 负责人 2: 普通成员
}

export interface DemandScheme {
  id: number;
  name: string;
  demand_type: string;
  description?: string;
  git_branch: string;
  archived: boolean;
  lock: boolean;
  status?: string;
  complete_time?: string;
  username: string;
  creator: string;
  developer: string;
  tester: string;
  cc: string;
  scheme_object: string;
  listen_status: number;
  tickets_id: string;
  parent_id: number;
  scheme_id: number;
  is_special_rectification: boolean;
  is_mr: boolean;
  is_delete: boolean;
  create_time?: string;
  modify_time?: string;
}

export interface SchemePipeline {
  id: number;
  scheme_id: number;
  pipeline_name?: string;
  appname?: string;
  git_repo?: string;
}

export interface DemandSchemePipeline {
  id: number;
  demand_scheme_id: number;
  pipeline_name?: string;
  dependent_pipeline?: string;
  dependent_stage?: string;
  canceled: boolean;
}

export interface SchemeLog {
  id: number;
  action_object: string;
  action_type: string;
  action_context: string;
  action_result: boolean;
  username: string;
  scheme_id: number;
  create_time?: string;
}

export interface RollbackInfo {
  stage: string;
  versions: string[];
}

export interface SchemeChartData {
  labels: string[];
  values: number[];
}

export interface SchemeReport {
  scheme_id: number;
  start_date: string;
  end_date: string;
  data: unknown;
}
