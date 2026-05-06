import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { loadConfig } from '../config.js';
import { getToken } from '../auth/store.js';
import { AuthError, ApiError, PermissionError } from './exceptions.js';

export interface ApiResponse<T = unknown> {
  status?: number;
  context?: T;
  data?: T;
  msg?: string;
  error?: string;
  count?: number;
}

let client: AxiosInstance | null = null;

export function getClient(): AxiosInstance {
  if (client) return client;

  const config = loadConfig();
  const baseURL = config.defaultHost || process.env.DOPS_HOST || '';

  if (!baseURL) {
    throw new ApiError('No host configured. Run: dops auth login --host <url>');
  }

  client = axios.create({
    baseURL: `${baseURL.replace(/\/$/, '')}/api/v2`,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use(async (req) => {
    const token = await getToken();
    if (token) {
      req.headers.Authorization = `Bearer ${token}`;
    }
    const tenantId = process.env.DOPS_TENANT || config.defaultTenant;
    if (tenantId) {
      req.headers['X-Tenant-ID'] = tenantId;
    }
    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    (err: AxiosError<ApiResponse>) => {
      const status = err.response?.status;
      const data = err.response?.data;
      const message = data?.error || data?.msg || err.message;

      if (status === 401) {
        throw new AuthError(message || '登录已过期，请重新登录');
      }
      if (status === 403) {
        throw new PermissionError(message || '无权限执行此操作');
      }
      throw new ApiError(message || '请求失败', status, data);
    }
  );

  return client;
}

export async function apiGet<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await getClient().get<ApiResponse<T>>(url, config);
  return extractData(res.data);
}

export async function apiPost<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await getClient().post<ApiResponse<T>>(url, data, config);
  return extractData(res.data);
}

export async function apiPut<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await getClient().put<ApiResponse<T>>(url, data, config);
  return extractData(res.data);
}

export async function apiDelete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await getClient().delete<ApiResponse<T>>(url, config);
  return extractData(res.data);
}

function extractData<T>(res: ApiResponse<T>): T {
  if (res.error) {
    throw new ApiError(res.error);
  }
  return (res.context ?? res.data ?? res) as T;
}

export function resetClient() {
  client = null;
}
