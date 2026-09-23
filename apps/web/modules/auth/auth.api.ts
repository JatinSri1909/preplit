import { request } from '../../common/api/api-client';

export interface User {
  id: string;
  email: string;
}

export const auth = {
  me: () => request<{ user: User | null }>('/auth/me'),
  register: (email: string, password: string) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
