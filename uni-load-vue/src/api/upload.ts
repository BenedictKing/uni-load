import type { ApiResponse } from './base'

/**
 * 上传管理 API - 当前后端不支持这些功能
 */
export class UploadApi {
  /**
   * 上传文件 - 后端暂不支持
   */
  static async uploadFile(
    file: File,
    type: string = 'general',
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    throw new Error('上传功能暂未实现')
  }

  /**
   * 上传图片 - 后端暂不支持
   */
  static async uploadImage(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    throw new Error('上传功能暂未实现')
  }

  /**
   * 上传配置文件 - 后端暂不支持
   */
  static async uploadConfig(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    throw new Error('上传功能暂未实现')
  }

  /**
   * 下载文件 - 后端暂不支持
   */
  static async downloadFile(
    fileUrl: string,
    filename?: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    throw new Error('下载功能暂未实现')
  }

  /**
   * 删除文件 - 后端暂不支持
   */
  static async deleteFile(fileUrl: string): Promise<ApiResponse<void>> {
    throw new Error('文件删除功能暂未实现')
  }
}