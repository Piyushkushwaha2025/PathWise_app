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
      // API is deprecated, return empty array immediately to save network latency
      return [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Fetches the list of all roadmaps (id, title, color, isPro) locally to avoid slow network requests
export function useRoadmapsCatalog() {
  return useQuery<CustomRoadmap[]>({
    queryKey: ["roadmapsCatalog"],
    queryFn: async () => {
      try {
        const catalogData = require("../catalog_mini.json");
        if (Array.isArray(catalogData)) return catalogData;
        return catalogData.roadmaps ?? [];
      } catch (error) {
        console.error("Failed to load local catalog:", error);
        return [];
      }
    },
    staleTime: Infinity, // local data never goes stale
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
          // Disabled because API is deprecated and we are using local catalog
          // const api = createApiClient(getToken);

          return cachedData;
        }
      } catch (e) {
        // ignore cache errors
      }

      // If no cache exists, load from local bundled full catalog
      const ID_MAP: Record<string, string> = {
        "fullstack": "full-stack",
        "open-claw": "openclaw",
        "postgresql": "postgresql-dba",
        "ruby-on-rails": "rails",
      };
      const fetchId = ID_MAP[id] || id;
      
      try {
        // We require it here so it's only parsed when a roadmap is opened
        const fullData = require("../catalog_utf8.json");
        const roadmaps = Array.isArray(fullData) ? fullData : (fullData.roadmaps || []);
        const found = roadmaps.find((r: any) => r.id === fetchId);
        if (found) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(found)).catch(()=>{});
          return found;
        }
      } catch (err) {
        console.log("Failed to load local roadmap detail", err);
      }
      return null;
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
