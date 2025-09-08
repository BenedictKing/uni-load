import { ref, computed, watch, type UnwrapRef } from 'vue'
import { apiClient } from '@/utils/api'
import { errorManager, retryHelper, isApiError, ErrorCode } from '@/utils/error'
import type { ApiResponse, QueryParams, PaginatedResponse } from '@/types/api'
import { ApiError } from '@/types/api'

/**
 * 加载状态
 */
export interface LoadingState {
  isLoading: boolean
  isRefreshing: boolean
  error: ApiError | null
}

/**
 * 分页状态
 */
export interface PaginationState {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * API 响应状态
 */
export interface ApiState<T> {
  data: T | null
  loading: LoadingState
  pagination: PaginationState | null
  lastUpdated: number | null
}

/**
 * API 请求配置
 */
export interface ApiRequestConfig {
  immediate?: boolean
  refetchInterval?: number
  retryOnMount?: boolean
  retryCount?: number
  enabled?: boolean | (() => boolean)
  onSuccess?: (data: any) => void
  onError?: (error: ApiError) => void
  onSettled?: (data: any | null, error: ApiError | null) => void
}

/**
 * API 组合式函数
 */
export function useApi<T = any>(
  requestFn: () => Promise<ApiResponse<T>>,
  config: ApiRequestConfig = {}
) {
  const {
    immediate = true,
    refetchInterval,
    retryOnMount = true,
    retryCount = 3,
    enabled = true,
    onSuccess,
    onError,
    onSettled
  } = config

  // 响应式状态
  const data = ref<T | null>(null)
  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const error = ref<ApiError | null>(null)
  const lastUpdated = ref<number | null>(null)

  // 计算属性
  const loadingState = computed<LoadingState>(() => ({
    isLoading: isLoading.value,
    isRefreshing: isRefreshing.value,
    error: error.value
  }))

  const apiState = computed<ApiState<T>>(() => ({
    data: data.value,
    loading: loadingState.value,
    pagination: null,
    lastUpdated: lastUpdated.value
  }))

  // 请求函数
  const execute = async (isRefresh = false): Promise<T | null> => {
    const enabledValue = typeof enabled === 'function' ? enabled() : enabled
    
    if (!enabledValue) {
      return null
    }

    try {
      if (isRefresh) {
        isRefreshing.value = true
      } else {
        isLoading.value = true
      }
      
      error.value = null

      // 使用重试机制
      const result = await retryHelper.executeWithRetry(async () => {
        const response = await requestFn()
        return response.data
      }, retryCount)

      data.value = result ?? null
      lastUpdated.value = Date.now()
      
      onSuccess?.(result)
      
      return result ?? null
    } catch (err) {
      const apiError = err instanceof ApiError ? err : errorManager.wrapError(err)
      error.value = apiError
      
      onError?.(apiError)
      
      throw apiError
    } finally {
      isLoading.value = false
      isRefreshing.value = false
      onSettled?.(data.value, error.value)
    }
  }

  // 刷新函数
  const refresh = () => execute(true)

  // 重置函数
  const reset = () => {
    data.value = null
    isLoading.value = false
    isRefreshing.value = false
    error.value = null
    lastUpdated.value = null
  }

  // 自动请求
  if (immediate) {
    execute()
  }

  // 轮询
  let intervalId: number | null = null
  if (refetchInterval) {
    intervalId = window.setInterval(() => {
      if (typeof enabled === 'function' ? enabled() : enabled) {
        refresh()
      }
    }, refetchInterval)
  }

  // 清理
  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    loadingState,
    apiState,
    execute,
    refresh,
    reset,
    stop
  }
}

/**
 * 分页 API 组合式函数
 */
export function usePaginatedApi<T = any>(
  requestFn: (params: QueryParams) => Promise<ApiResponse<PaginatedResponse<T>>>,
  initialParams: QueryParams = {},
  config: ApiRequestConfig = {}
) {
  const {
    immediate = true,
    ...restConfig
  } = config

  // 分页参数
  const params = ref<QueryParams>({
    page: 1,
    limit: 10,
    ...initialParams
  })

  // 分页状态
  const pagination = ref<PaginationState>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  })

  // 使用基础 API hook
  const api = useApi(() => requestFn(params.value), {
    immediate: false,
    ...restConfig
  })

  // 更新分页状态
  const updatePagination = (response: PaginatedResponse<T>) => {
    pagination.value = {
      page: response.pagination.page,
      limit: response.pagination.limit,
      total: response.pagination.total,
      totalPages: response.pagination.totalPages,
      hasNext: response.pagination.hasNext,
      hasPrev: response.pagination.hasPrev
    }
  }

  // 重写执行函数
  const execute = async (isRefresh = false) => {
    const result = await api.execute(isRefresh)
    if (result && 'pagination' in result) {
      updatePagination(result)
    }
    return result
  }

  // 分页操作
  const goToPage = (page: number) => {
    params.value.page = page
    return execute()
  }

  const nextPage = () => {
    if (pagination.value.hasNext) {
      return goToPage(pagination.value.page + 1)
    }
  }

  const prevPage = () => {
    if (pagination.value.hasPrev) {
      return goToPage(pagination.value.page - 1)
    }
  }

  const changeLimit = (limit: number) => {
    params.value.limit = limit
    params.value.page = 1 // 重置到第一页
    return execute()
  }

  // 排序操作
  const sortBy = (field: string, order: 'asc' | 'desc' = 'asc') => {
    params.value.sortBy = field
    params.value.sortOrder = order
    return execute()
  }

  // 搜索操作
  const search = (query: string) => {
    params.value.search = query
    params.value.page = 1 // 重置到第一页
    return execute()
  }

  // 过滤操作
  const filter = (filters: Record<string, any>) => {
    params.value.filter = { ...params.value.filter, ...filters }
    params.value.page = 1 // 重置到第一页
    return execute()
  }

  // 重置过滤器
  const resetFilters = () => {
    params.value.filter = {}
    params.value.search = undefined
    params.value.page = 1
    return execute()
  }

  // 计算属性
  const apiState = computed(() => ({
    ...api.apiState.value,
    pagination: pagination.value
  }))

  // 自动请求
  if (immediate) {
    execute()
  }

  return {
    ...api,
    params,
    pagination,
    apiState,
    goToPage,
    nextPage,
    prevPage,
    changeLimit,
    sortBy,
    search,
    filter,
    resetFilters,
    execute
  }
}

/**
 * 实时数据组合式函数
 */
export function useRealtimeData<T = any>(
  requestFn: () => Promise<ApiResponse<T>>,
  config: ApiRequestConfig = {}
) {
  const {
    refetchInterval = 5000, // 默认5秒轮询
    ...restConfig
  } = config

  return useApi(requestFn, {
    refetchInterval,
    ...restConfig
  })
}

/**
 * 缓存管理
 */
export class ApiCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private defaultTTL = 5 * 60 * 1000 // 5分钟

  /**
   * 设置缓存
   */
  set(key: string, data: any, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  /**
   * 获取缓存
   */
  get(key: string): any | null {
    const item = this.cache.get(key)
    if (!item) {
      return null
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 生成缓存键
   */
  generateKey(url: string, params?: any): string {
    return `${url}_${JSON.stringify(params || {})}`
  }
}

// 全局缓存实例
export const apiCache = new ApiCache()

/**
 * 带缓存的 API 组合式函数
 */
export function useCachedApi<T = any>(
  key: string,
  requestFn: () => Promise<ApiResponse<T>>,
  config: ApiRequestConfig & { ttl?: number } = {}
) {
  const { ttl, ...restConfig } = config

  // 从缓存获取数据
  const cachedData = apiCache.get(key)
  
  const api = useApi(requestFn, {
    immediate: !cachedData,
    ...restConfig
  })

  // 如果有缓存数据，直接使用
  if (cachedData) {
    api.data.value = cachedData
  }

  // 监听数据变化，更新缓存
  watch(() => api.data.value, (newData) => {
    if (newData) {
      apiCache.set(key, newData, ttl)
    }
  })

  return {
    ...api,
    cachedData,
    invalidateCache: () => apiCache.delete(key)
  }
}

/**
 * 批量请求组合式函数
 */
export function useBatchApi<T = any>(
  requests: Array<() => Promise<ApiResponse<T>>>,
  config: ApiRequestConfig = {}
) {
  const results = ref<T[]>([])
  const loading = ref(false)
  const errors = ref<ApiError[]>([])

  const execute = async () => {
    loading.value = true
    errors.value = []
    results.value = []

    try {
      const promises = requests.map(request => 
        retryHelper.executeWithRetry(async () => {
          const response = await request()
          return response.data
        })
      )

      const settledResults = await Promise.allSettled(promises)
      
      settledResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.value[index] = result.value as any
        } else {
          const error = result.reason instanceof ApiError ? result.reason : errorManager.wrapError(result.reason)
          errors.value[index] = error
        }
      })

      return results.value
    } finally {
      loading.value = false
    }
  }

  if (config.immediate) {
    execute()
  }

  return {
    results,
    loading,
    errors,
    execute
  }
}

/**
 * API 状态管理
 */
export class ApiStateManager {
  private states = new Map<string, ApiState<any>>()

  /**
   * 获取状态
   */
  getState<T>(key: string): ApiState<T> | null {
    return this.states.get(key) as ApiState<T> || null
  }

  /**
   * 设置状态
   */
  setState<T>(key: string, state: ApiState<T>): void {
    this.states.set(key, state)
  }

  /**
   * 删除状态
   */
  removeState(key: string): void {
    this.states.delete(key)
  }

  /**
   * 清空所有状态
   */
  clear(): void {
    this.states.clear()
  }
}

// 全局状态管理器
export const apiStateManager = new ApiStateManager()