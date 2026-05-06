import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { loadConfig } from '../../config.js';
import { getCredentials } from '../../auth/store.js';
import { ApiError, AuthError, PermissionError } from '../../core/exceptions.js';

export interface ApiResponse<T = unknown> {
  status?: number;
  context?: T;
  data?: T;
  msg?: string;
  error?: string;
  count?: number;
}

/**
 * API 客户端管理类
 * 统一管理所有 HTTP 请求
 */
export class ApiClient {
  private static instance: ApiClient;
  private client: AxiosInstance | null = null;

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  getClient(): AxiosInstance {
    if (this.client) return this.client;

    const config = loadConfig();
    const baseURL = config.defaultHost || process.env.DOPS_HOST || '';

    if (!baseURL) {
      throw new ApiError('No host configured. Run: dops auth login --host <url>');
    }

    this.client = axios.create({
      baseURL: `${baseURL.replace(/\/$/, '')}/api/v2`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(async (req) => {
      const creds = await getCredentials();
      if (creds?.sessionid) {
        const cookieParts = [`sessionid=${creds.sessionid}`];
        if (creds.csrftoken) cookieParts.push(`csrftoken=${creds.csrftoken}`);
        req.headers.Cookie = cookieParts.join('; ');
        if (creds.csrftoken) {
          req.headers['X-CSRFToken'] = creds.csrftoken;
        }
      }
      const tenantId = process.env.DOPS_TENANT || config.defaultTenant;
      if (tenantId) {
        req.headers['X-Tenant-ID'] = tenantId;
      }
      return req;
    });

    this.client.interceptors.response.use(
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

    return this.client;
  }

  reset(): void {
    this.client = null;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.getClient().get<ApiResponse<T>>(url, config);
    return this.extractData(res.data);
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.getClient().post<ApiResponse<T>>(url, data, config);
    return this.extractData(res.data);
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.getClient().put<ApiResponse<T>>(url, data, config);
    return this.extractData(res.data);
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.getClient().delete<ApiResponse<T>>(url, config);
    return this.extractData(res.data);
  }

  private extractData<T>(res: ApiResponse<T>): T {
    if (res.error) {
      throw new ApiError(res.error);
    }
    return (res.context ?? res.data ?? res) as T;
  }
}

// 便捷导出
export const apiClient = ApiClient.getInstance();
export const apiGet = <T>(url: string, config?: AxiosRequestConfig) => apiClient.get<T>(url, config);
export const apiPost = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => apiClient.post<T>(url, data, config);
export const apiPut = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => apiClient.put<T>(url, data, config);
export const apiDelete = <T>(url: string, config?: AxiosRequestConfig) => apiClient.delete<T>(url, config);
