import type { ApiResponse } from './base'

/**
 * 用户管理 API - 当前后端不支持这些功能
 */
export class UserApi {
  /**
   * 用户登录 - 后端暂不支持
   */
  static async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: any }>> {
    throw new Error('用户登录功能暂未实现')
  }

  /**
   * 用户登出 - 后端暂不支持
   */
  static async logout(): Promise<ApiResponse<void>> {
    throw new Error('用户登出功能暂未实现')
  }

  /**
   * 刷新令牌 - 后端暂不支持
   */
  static async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    throw new Error('令牌刷新功能暂未实现')
  }

  /**
   * 获取用户信息 - 后端暂不支持
   */
  static async getUserProfile(): Promise<ApiResponse<any>> {
    throw new Error('用户信息功能暂未实现')
  }

  /**
   * 更新用户信息 - 后端暂不支持
   */
  static async updateUserProfile(profile: any): Promise<ApiResponse<any>> {
    throw new Error('用户信息更新功能暂未实现')
  }

  /**
   * 修改密码 - 后端暂不支持
   */
  static async changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    throw new Error('密码修改功能暂未实现')
  }

  /**
   * 获取用户权限 - 后端暂不支持
   */
  static async getUserPermissions(): Promise<ApiResponse<string[]>> {
    throw new Error('用户权限功能暂未实现')
  }
}