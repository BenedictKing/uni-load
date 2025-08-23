// 通用接口定义
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  details?: string | object;
}

export interface ApiErrorResponse {
  error: string;
  details?: string | object;
}

export interface SiteGroup {
  id: string;
  name: string;
  sort: number;
  _instance?: GptloadInstance;
  upstreams?: any[];
}

export interface GptloadInstance {
  id: string;
  name: string;
}

export interface Model {
  id: string;
  name: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface ApiKey {
  key: string;
  name?: string;
}

export interface ProcessAiSiteRequest {
  baseUrl: string;
  apiKeys?: string[];
  channelTypes?: string[];
  customValidationEndpoints?: any;
}

export interface CleanupOptions {
  dryRun?: boolean;
  force?: boolean;
}

export interface CleanupResult {
  deleted: string[];
  failed: Array<{ name: string; reason: string }>;
}

export interface ChannelHealthStatus {
  status: string;
  failedChannels: string[];
  lastCheck?: Date;
}

export interface ModelSyncStatus {
  isRunning: boolean;
  lastSync?: Date;
  nextSync?: Date;
}

export interface ServiceStatus {
  gptload: any;
  uniApi: any;
  modelSync: ModelSyncStatus;
  channelHealth: ChannelHealthStatus;
  channelCleanup: any;
}