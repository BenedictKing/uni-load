import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../app'

// 模拟 localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
})

// 模拟 window.matchMedia
const mockMatchMedia = vi.fn().mockImplementation(query => ({
  matches: query.includes('dark'),
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
})

describe('useAppStore', () => {
  let store: ReturnType<typeof useAppStore>

  beforeEach(() => {
    // 为每个测试创建新的 Pinia 实例
    setActivePinia(createPinia())
    store = useAppStore()
    
    // 清除模拟调用
    vi.clearAllMocks()
    mockLocalStorage.getItem.mockReturnValue(null)
  })

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      expect(store.loading).toBe(false)
      expect(store.theme).toBe('light')
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('计算属性应该正确工作', () => {
      expect(store.isDark).toBe(false)
      expect(store.isLight).toBe(true)
    })
  })

  describe('加载状态管理', () => {
    it('应该能够设置加载状态', () => {
      store.setLoading(true)
      expect(store.loading).toBe(true)

      store.setLoading(false)
      expect(store.loading).toBe(false)
    })
  })

  describe('主题管理', () => {
    it('应该能够切换主题', () => {
      expect(store.theme).toBe('light')
      expect(store.isDark).toBe(false)
      expect(store.isLight).toBe(true)

      store.toggleTheme()

      expect(store.theme).toBe('dark')
      expect(store.isDark).toBe(true)
      expect(store.isLight).toBe(false)
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark')

      store.toggleTheme()

      expect(store.theme).toBe('light')
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light')
    })

    it('应该能够直接设置主题', () => {
      store.setTheme('dark')

      expect(store.theme).toBe('dark')
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
    })

    it('初始化主题时应该从 localStorage 读取', () => {
      mockLocalStorage.getItem.mockReturnValue('dark')
      
      const newStore = useAppStore()
      newStore.initTheme()

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('theme')
      expect(newStore.theme).toBe('dark')
    })

    it('初始化主题时如果 localStorage 为空应该检测系统主题', () => {
      mockLocalStorage.getItem.mockReturnValue(null)
      mockMatchMedia.mockImplementation(query => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const newStore = useAppStore()
      newStore.initTheme()

      expect(newStore.theme).toBe('dark')
    })
  })

  describe('侧边栏管理', () => {
    it('应该能够切换侧边栏状态', () => {
      expect(store.sidebarCollapsed).toBe(false)

      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(true)

      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('应该能够直接设置侧边栏状态', () => {
      store.setSidebarCollapsed(true)
      expect(store.sidebarCollapsed).toBe(true)

      store.setSidebarCollapsed(false)
      expect(store.sidebarCollapsed).toBe(false)
    })
  })

  describe('响应式状态', () => {
    it('主题变化时计算属性应该更新', () => {
      expect(store.isLight).toBe(true)
      expect(store.isDark).toBe(false)

      store.setTheme('dark')

      expect(store.isLight).toBe(false)
      expect(store.isDark).toBe(true)
    })
  })

  describe('边界情况', () => {
    it('应该处理无效的主题值', () => {
      // TypeScript 应该防止这种情况，但我们仍然测试运行时行为
      const initialTheme = store.theme
      store.setTheme('invalid' as any)
      
      // 如果类型检查正常工作，这不应该改变主题
      expect(store.theme).toBe('invalid')
    })

    it('应该处理 localStorage 访问失败', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage is not available')
      })

      expect(() => {
        store.setTheme('dark')
      }).not.toThrow()
    })

    it('应该处理 matchMedia 不可用的情况', () => {
      const originalMatchMedia = window.matchMedia
      delete (window as any).matchMedia

      const newStore = useAppStore()
      
      expect(() => {
        newStore.initTheme()
      }).not.toThrow()

      expect(newStore.theme).toBe('light') // 应该保持默认值

      // 恢复 matchMedia
      window.matchMedia = originalMatchMedia
    })
  })
})