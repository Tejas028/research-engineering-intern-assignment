import axios from "axios";

const DEFAULT_PROD_API_URL =
  "https://research-engineering-intern-assignment-production-c0a5.up.railway.app";

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (configured && !configured.includes("YOUR_RAILWAY_APP")) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }
  }

  return DEFAULT_PROD_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const getOverview   = ()       => api.get("/api/overview");
export const getTimeseries = (params) => api.get("/api/timeseries", { params });
export const getAuthors    = (params) => api.get("/api/authors",    { params });
export const getNetwork    = (params) => api.get("/api/network",    { params });
export const getTopics     = (params) => api.get("/api/topics",     { params });
export const getTopicsMap  = ()       => api.get("/api/topics/map");
export const getSearch     = (params) => api.get("/api/search",     { params });
export const getEvents     = ()       => api.get("/api/events");
export const getAISummary  = (params) => api.get("/api/ai_summary", { params });

export const getTopicPosts     = (params) => api.get("/api/topics/posts",     { params });
export const getAuthorDetail   = (params) => api.get("/api/authors/detail",   { params });
export const getTopicInfluence = ()       => api.get("/api/topics/influence");
export const getCoordination   = ()       => api.get("/api/coordination");
export const postAISummary     = (data)   => api.post("/api/ai_summary", data);
export const getTopicsMapMeta  = ()       => api.get("/api/topics/map");
