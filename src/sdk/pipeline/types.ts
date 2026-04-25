export interface Pipeline {
  id: number;
  name: string;
  app_name: string;
  trigger_type: number;
  auto_type: string;
  filter_type: number;
  filter_value?: string;
  git_repo_url: string;
  git_branch: string;
  pack_type: string;
  project_name: string;
  discard_running_build: number;
  create_time?: string;
  modify_time?: string;
}

export interface Stage {
  id: number;
  seq: number;
  name: string;
  display_name: string;
  auto_trigger: number;
  pipeline_id: number;
  pipeline_name: string;
  build_machine: string;
}

export interface Task {
  id: number;
  seq: number;
  serial_seq: number;
  name: string;
  display_name: string;
  task_type_id?: number;
  attribute_json: string;
  parameter_json: string;
  stage_id: number;
}

export interface ExecuteLog {
  id: number;
  scheme_id: number;
  pipeline_id: number;
  pipeline_name: string;
  build_id: number;
  cost_time: number;
  state: number;
  git_commit_id?: string;
  git_pipeline_id?: number;
  current_stage_index: number;
  username: string;
}

export interface ExecuteStageLog {
  id: number;
  scheme_id: number;
  pipeline_id?: number;
  pipeline_name?: string;
  build_id?: number;
  execute_log_id?: number;
  stage_name?: string;
  build_parameters?: string;
  stage_seq?: number;
  cost_time?: number;
  state: number;
  jenkins_build_id?: string;
  jenkins_build_url?: string;
  celery_id?: string;
  username?: string;
}

export interface ExecuteTaskLog {
  id: number;
  demand_scheme_id: number;
  pipeline_id?: number;
  pipeline_name?: string;
  build_id?: number;
  execute_log_id?: number;
  execute_stage_log_id?: number;
  task_type_id?: number;
  task_name?: string;
  seq: number;
  serial_seq: number;
  cost_time?: number;
  state: number;
  jenkins_node_id?: string;
  jenkins_node_url?: string;
  celery_task_id?: string;
}

export interface PipelineGroup {
  id: number;
  name: string;
}

export interface PipelineProduct {
  name: string;
  url?: string;
  version?: string;
}

export interface PipelineRunStatus {
  running: number;
  completed: number;
  failed: number;
  total: number;
}
