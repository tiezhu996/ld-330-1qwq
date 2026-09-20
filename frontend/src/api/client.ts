import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 8000,
});

let authToken = '';

export const setAuthToken = (token: string) => {
  authToken = token;
};

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});
