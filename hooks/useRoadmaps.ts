import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiClient } from "../lib/apiClient";
import type {
  CustomRoadmap,
  GenerateRoadmapResponse,
  RoadmapsResponse,
} from "../types";

export function useRoadmaps() {
  const { getToken } = useAuth();

  return useQuery<CustomRoadmap[]>({
    queryKey: ["roadmaps"],
    queryFn: async () => {
      const api = createApiClient(getToken);
      const res = await api.get<RoadmapsResponse>("/roadmaps/custom");
      return res.data.roadmaps ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Fetches the list of all roadmaps (id, title, color, isPro) from live API
export function useRoadmapsCatalog() {
  const { getToken } = useAuth();

  return useQuery<CustomRoadmap[]>({
    queryKey: ["roadmapsCatalog"],
    queryFn: async () => {
      const api = createApiClient(getToken);
      const res = await api.get<any>("/roadmaps/catalog");
      if (Array.isArray(res.data)) return res.data;
      return res.data.roadmaps ?? [];
    },
    staleTime: 30 * 60 * 1000, // 30 min — catalog doesn't change often
  });
}

// Fetches ONE full roadmap with all modules+topics from live API
export function useRoadmapDetail(id: string) {
  const { getToken } = useAuth();

  return useQuery<any>({
    queryKey: ["roadmapDetail", id],
    queryFn: async () => {
      const cacheKey = `roadmap_detail_${id}`;
      
      try {
        const cachedStr = await AsyncStorage.getItem(cacheKey);
        if (cachedStr) {
          let cachedData = JSON.parse(cachedStr);
          if (cachedData.roadmap) {
            cachedData = cachedData.roadmap;
          }
          
          // Background fetch to update the cache silently for next time
          const api = createApiClient(getToken);
          const ID_MAP: Record<string, string> = {
            "fullstack": "full-stack",
            "open-claw": "openclaw",
            "postgresql": "postgresql-dba",
            "ruby-on-rails": "rails",
          };
          const fetchId = ID_MAP[id] || id;
          api.get<any>(`/roadmaps/${fetchId}`).then((res) => {
             const dataToCache = res.data.roadmap ? res.data.roadmap : res.data;
             AsyncStorage.setItem(cacheKey, JSON.stringify(dataToCache)).catch(()=>{});
          }).catch(()=>{});

          return cachedData;
        }
      } catch (e) {
        // ignore cache errors
      }

      // If no cache exists, fetch from network
      const api = createApiClient(getToken);
      const ID_MAP: Record<string, string> = {
        "fullstack": "full-stack",
        "open-claw": "openclaw",
        "postgresql": "postgresql-dba",
        "ruby-on-rails": "rails",
      };
      const fetchId = ID_MAP[id] || id;
      const res = await api.get<any>(`/roadmaps/${fetchId}`);
      const dataToCache = res.data.roadmap ? res.data.roadmap : res.data;
      AsyncStorage.setItem(cacheKey, JSON.stringify(dataToCache)).catch(()=>{});
      return dataToCache;
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useGenerateRoadmap() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<GenerateRoadmapResponse, Error, { topic: string }>({
    mutationFn: async ({ topic }) => {
      const api = createApiClient(getToken);
      const res = await api.post<GenerateRoadmapResponse>(
        "/roadmaps/generate",
        { topic },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmaps"] });
    },
  });
}
