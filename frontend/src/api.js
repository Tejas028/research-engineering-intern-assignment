import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "";
const api  = axios.create({ baseURL: BASE });

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
