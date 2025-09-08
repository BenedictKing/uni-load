import { ApiError } from '@/types/api'

/**
 * 错误码枚举
 */
export enum ErrorCode {
  // 网络错误
  NETWORK_ERROR = 0,
  TIMEOUT_ERROR = 1,
  CANCELED_ERROR = 2,

  // 客户端错误
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  VALIDATION_ERROR = 422,
  TOO_MANY_REQUESTS = 429,

  // 服务端错误
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,

  // 业务错误
  BUSINESS_ERROR = 1000,
  AUTH_ERROR = 1001,
  PERMISSION_ERROR = 1002,
  RESOURCE_NOT_FOUND = 1003,
  INVALID_PARAMETER = 1004,
  OPERATION_FAILED = 1005,

  // 数据错误
  DATABASE_ERROR = 2000,
  DATA_CONFLICT = 2001,
  DATA_NOT_FOUND = 2002,
  DATA_INVALID = 2003,

  // 外部服务错误
  EXTERNAL_SERVICE_ERROR = 3000,
  EXTERNAL_SERVICE_TIMEOUT = 3001,
  EXTERNAL_SERVICE_UNAVAILABLE = 3002,
}

/**
 * 错误消息映射
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: '网络连接错误，请检查网络连接',
  [ErrorCode.TIMEOUT_ERROR]: '请求超时，请稍后重试',
  [ErrorCode.CANCELED_ERROR]: '请求已取消',
  [ErrorCode.BAD_REQUEST]: '请求参数错误',
  [ErrorCode.UNAUTHORIZED]: '未授权，请登录',
  [ErrorCode.FORBIDDEN]: '禁止访问',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.METHOD_NOT_ALLOWED]: '方法不允许',
  [ErrorCode.VALIDATION_ERROR]: '数据验证失败',
  [ErrorCode.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后重试',
  [ErrorCode.INTERNAL_SERVER_ERROR]: '服务器内部错误',
  [ErrorCode.BAD_GATEWAY]: '网关错误',
  [ErrorCode.SERVICE_UNAVAILABLE]: '服务暂时不可用',
  [ErrorCode.GATEWAY_TIMEOUT]: '网关超时',
  [ErrorCode.BUSINESS_ERROR]: '业务处理失败',
  [ErrorCode.AUTH_ERROR]: '认证失败',
  [ErrorCode.PERMISSION_ERROR]: '权限不足',
  [ErrorCode.RESOURCE_NOT_FOUND]: '资源不存在',
  [ErrorCode.INVALID_PARAMETER]: '参数无效',
  [ErrorCode.OPERATION_FAILED]: '操作失败',
  [ErrorCode.DATABASE_ERROR]: '数据库错误',
  [ErrorCode.DATA_CONFLICT]: '数据冲突',
  [ErrorCode.DATA_NOT_FOUND]: '数据不存在',
  [ErrorCode.DATA_INVALID]: '数据无效',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: '外部服务错误',
  [ErrorCode.EXTERNAL_SERVICE_TIMEOUT]: '外部服务超时',
  [ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE]: '外部服务不可用',
}

/**
 * 错误处理器接口
 */
export interface ErrorHandler {
  canHandle(error: ApiError): boolean
  handle(error: ApiError): void
}

/**
 * 默认错误处理器
 */
export class DefaultErrorHandler implements ErrorHandler {
  canHandle(error: ApiError): boolean {
    return true
  }

  handle(error: ApiError): void {
    console.error('API Error:', error)
    
    // 显示用户友好的错误消息
    const message = ERROR_MESSAGES[error.code as ErrorCode] || error.message
    this.showErrorMessage(message)
  }

  private showErrorMessage(message: string): void {
    // 这里可以根据项目需要实现不同的错误显示方式
    // 例如：Toast、Alert、Snackbar 等
    if (typeof window !== 'undefined') {
      // 简单的 alert，实际项目中应该使用更好的 UI 组件
      alert(message)
    }
  }
}

/**
 * 认证错误处理器
 */
export class AuthErrorHandler implements ErrorHandler {
  canHandle(error: ApiError): boolean {
    return error.code === ErrorCode.UNAUTHORIZED
  }

  handle(error: ApiError): void {
    console.error('Authentication Error:', error)
    
    // 清除本地存储的认证信息
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    
    // 跳转到登录页
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }
}

/**
 * 网络错误处理器
 */
export class NetworkErrorHandler implements ErrorHandler {
  canHandle(error: ApiError): boolean {
    return error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.TIMEOUT_ERROR
  }

  handle(error: ApiError): void {
    console.error('Network Error:', error)
    
    const message = ERROR_MESSAGES[error.code as ErrorCode]
    this.showErrorMessage(message)
  }

  private showErrorMessage(message: string): void {
    if (typeof window !== 'undefined') {
      alert(message)
    }
  }
}

/**
 * 权限错误处理器
 */
export class PermissionErrorHandler implements ErrorHandler {
  canHandle(error: ApiError): boolean {
    return error.code === ErrorCode.FORBIDDEN || error.code === ErrorCode.PERMISSION_ERROR
  }

  handle(error: ApiError): void {
    console.error('Permission Error:', error)
    
    const message = ERROR_MESSAGES[error.code as ErrorCode]
    this.showErrorMessage(message)
  }

  private showErrorMessage(message: string): void {
    if (typeof window !== 'undefined') {
      alert(message)
    }
  }
}

/**
 * 资源不存在错误处理器
 */
export class NotFoundErrorHandler implements ErrorHandler {
  canHandle(error: ApiError): boolean {
    return error.code === ErrorCode.NOT_FOUND || error.code === ErrorCode.RESOURCE_NOT_FOUND
  }

  handle(error: ApiError): void {
    console.error('Not Found Error:', error)
    
    const message = ERROR_MESSAGES[error.code as ErrorCode]
    this.showErrorMessage(message)
  }

  private showErrorMessage(message: string): void {
    if (typeof window !== 'undefined') {
      alert(message)
    }
  }
}

/**
 * 验证错误处理器
 */
export class ValidationErrorHandler implements ErrorHandler {
  canHandle(error: ApiError): boolean {
    return error.code === ErrorCode.VALIDATION_ERROR || error.code === ErrorCode.INVALID_PARAMETER
  }

  handle(error: ApiError): void {
    console.error('Validation Error:', error)
    
    // 显示具体的验证错误信息
    const message = error.data?.message || ERROR_MESSAGES[error.code as ErrorCode]
    this.showErrorMessage(message)
  }

  private showErrorMessage(message: string): void {
    if (typeof window !== 'undefined') {
      alert(message)
    }
  }
}

/**
 * 错误处理管理器
 */
export class ErrorManager {
  private handlers: ErrorHandler[] = []

  constructor() {
    // 注册默认的错误处理器
    this.registerHandler(new AuthErrorHandler())
    this.registerHandler(new NetworkErrorHandler())
    this.registerHandler(new PermissionErrorHandler())
    this.registerHandler(new NotFoundErrorHandler())
    this.registerHandler(new ValidationErrorHandler())
    this.registerHandler(new DefaultErrorHandler())
  }

  /**
   * 注册错误处理器
   */
  registerHandler(handler: ErrorHandler): void {
    this.handlers.push(handler)
  }

  /**
   * 移除错误处理器
   */
  unregisterHandler(handler: ErrorHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index > -1) {
      this.handlers.splice(index, 1)
    }
  }

  /**
   * 处理错误
   */
  handleError(error: ApiError): void {
    // 查找第一个能处理该错误的处理器
    const handler = this.handlers.find(h => h.canHandle(error))
    
    if (handler) {
      handler.handle(error)
    } else {
      // 如果没有找到合适的处理器，使用默认处理器
      console.error('Unhandled API Error:', error)
      new DefaultErrorHandler().handle(error)
    }
  }

  /**
   * 创建错误
   */
  createError(message: string, code: ErrorCode = ErrorCode.BUSINESS_ERROR, data?: any): ApiError {
    return new ApiError(message, code, data)
  }

  /**
   * 包装未知错误
   */
  wrapError(error: any): ApiError {
    if (error instanceof ApiError) {
      return error
    }

    if (error instanceof Error) {
      return new ApiError(error.message, ErrorCode.BUSINESS_ERROR, {
        stack: error.stack,
        name: error.name
      })
    }

    if (typeof error === 'string') {
      return new ApiError(error, ErrorCode.BUSINESS_ERROR)
    }

    return new ApiError('Unknown error', ErrorCode.BUSINESS_ERROR, error)
  }
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number
  delay: number
  backoffFactor: number
  retryableErrors: ErrorCode[]
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delay: 1000,
  backoffFactor: 2,
  retryableErrors: [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.TIMEOUT_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.GATEWAY_TIMEOUT,
    ErrorCode.EXTERNAL_SERVICE_TIMEOUT,
    ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
  ]
}

/**
 * 重试工具类
 */
export class RetryHelper {
  private config: RetryConfig

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config }
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(error: ApiError, retryCount: number): boolean {
    return (
      retryCount < this.config.maxRetries &&
      this.config.retryableErrors.includes(error.code as ErrorCode)
    )
  }

  /**
   * 计算重试延迟
   */
  getDelay(retryCount: number): number {
    return this.config.delay * Math.pow(this.config.backoffFactor, retryCount)
  }

  /**
   * 执行重试
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('Unknown error')
      
      if (this.shouldRetry(apiError, retryCount)) {
        const delay = this.getDelay(retryCount)
        await this.sleep(delay)
        return this.executeWithRetry(fn, retryCount + 1)
      }

      throw error
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 创建全局错误管理器实例
export const errorManager = new ErrorManager()

// 创建重试助手实例
export const retryHelper = new RetryHelper()

/**
 * 便捷的错误处理函数
 */
export function handleApiError(error: any): void {
  const apiError = error instanceof ApiError ? error : errorManager.wrapError(error)
  errorManager.handleError(apiError)
}

/**
 * 便捷的重试函数
 */
export async function retryApiCall<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const helper = config ? new RetryHelper(config) : retryHelper
  return helper.executeWithRetry(fn)
}

/**
 * 检查错误是否为特定类型
 */
export function isApiError(error: any, code?: ErrorCode): error is ApiError {
  if (!(error instanceof ApiError)) {
    return false
  }
  
  if (code !== undefined) {
    return error.code === code
  }
  
  return true
}

/**
 * 获取错误消息
 */
export function getErrorMessage(error: any): string {
  if (isApiError(error)) {
    return ERROR_MESSAGES[error.code as ErrorCode] || error.message
  }
  
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === 'string') {
    return error
  }
  
  return 'Unknown error'
}