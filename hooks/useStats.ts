import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { createApiClient } from "../lib/apiClient";

export interface StatsResponse {
  visited: number;
  signedIn: number;
  subscribed: number;
}

export function useStats() {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await api.get<StatsResponse>("/stats");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
