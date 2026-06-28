import axios, { type InternalAxiosRequestConfig } from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000/api";

/**
 * Creates an authenticated Axios instance.
 * Pass Clerk's getToken function so the interceptor can inject the JWT.
 *
 * Usage inside a hook:
 *   const { getToken } = useAuth();
 *   const api = createApiClient(getToken);
 *   const data = await api.get('/enrollments');
 */
export function createApiClient(getToken: () => Promise<string | null>) {
  const instance = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: { "Content-Type": "application/json" },
  });

  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  return instance;
}
