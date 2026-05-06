export interface GitGroup {
  id: number;
  name: string;
  path: string;
  description?: string;
  web_url?: string;
}

export interface GitProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description?: string;
  web_url?: string;
  topics?: string[];
  level?: string;
  frame?: string;
  framework?: string;
}

export interface AppLevel {
  app_name: string;
  level: string;
}

export interface AppOwner {
  app_name: string;
  owner?: string;
}

export interface CodeNoticeGroup {
  id: number;
  name: string;
  description: string;
  wecom_robot: string;
}

export interface CodeNoticeGroupMap {
  id: number;
  object_type: number;
  object_id: string;
  object_name: string;
  webhook_id?: number;
  notice_group_id: number;
}
