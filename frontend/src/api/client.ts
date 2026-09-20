import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 8000,
});

interface ApiErrorBody {
  message?: string | string[];
}

// 统一提取后端错误信息：NestJS 异常体可能是字符串或字符串数组。
export function readErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    const body = axiosError.response?.data;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join('；') : body.message;
    }
    if (axiosError.message) {
      return axiosError.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// 409 冲突一般来自重复申请或并发审批抢先成功。
export function isConflictError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}
