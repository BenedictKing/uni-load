// 通用的键值对类型
export interface KeyValue<T = any> {
  [key: string]: T
}

// 排序参数
export interface SortParams {
  field: string
  order: 'asc' | 'desc'
}

// 搜索过滤器
export interface SearchFilter {
  keyword?: string
  filters?: Record<string, any>
}

// 加载状态
export interface LoadingState {
  isLoading: boolean
  error?: string | null
}

// 异步状态
export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

// 表单验证错误
export interface ValidationError {
  field: string
  message: string
}

// 表单状态
export interface FormState<T> {
  data: T
  errors: ValidationError[]
  isDirty: boolean
  isValid: boolean
  isSubmitting: boolean
}

// 模态框状态
export interface ModalState {
  isOpen: boolean
  title?: string
  content?: string
  data?: any
}

// 通知类型
export type NotificationType = 'success' | 'error' | 'warning' | 'info'

// 通知消息
export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  duration?: number
  actions?: NotificationAction[]
}

// 通知操作
export interface NotificationAction {
  label: string
  action: () => void
  primary?: boolean
}

// 主题配置
export interface ThemeConfig {
  mode: 'light' | 'dark'
  primaryColor: string
  secondaryColor: string
  borderRadius: string
  fontSize: {
    xs: string
    sm: string
    base: string
    lg: string
    xl: string
  }
}

// 应用配置
export interface AppConfig {
  api: {
    baseURL: string
    timeout: number
    retries: number
  }
  theme: ThemeConfig
  features: {
    enableAnimations: boolean
    enableNotifications: boolean
    enableDebugMode: boolean
  }
}

// 路由元信息
export interface RouteMeta {
  title?: string
  requiresAuth?: boolean
  permissions?: string[]
  layout?: string
}

// 组件属性
export interface ComponentProps {
  [key: string]: any
}

// 事件处理器
export type EventHandler<T = any> = (event: T) => void

// 防抖函数配置
export interface DebounceConfig {
  delay: number
  leading?: boolean
  trailing?: boolean
}

// 节流函数配置
export interface ThrottleConfig {
  delay: number
  leading?: boolean
  trailing?: boolean
}