import { beforeEach, vi } from 'vitest'
import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// 全局测试设置

// 为每个测试创建新的 Pinia 实例
beforeEach(() => {
  const pinia = createPinia()
  setActivePinia(pinia)
})

// 配置 Vue Test Utils 全局组件
config.global.plugins = []

// 模拟 localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => {
      return window.localStorage[key] || null
    }),
    setItem: vi.fn((key: string, value: string) => {
      window.localStorage[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete window.localStorage[key]
    }),
    clear: vi.fn(() => {
      Object.keys(window.localStorage).forEach(key => {
        delete window.localStorage[key]
      })
    }),
  },
  writable: true,
})

// 模拟 sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn((key: string) => {
      return window.sessionStorage[key] || null
    }),
    setItem: vi.fn((key: string, value: string) => {
      window.sessionStorage[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete window.sessionStorage[key]
    }),
    clear: vi.fn(() => {
      Object.keys(window.sessionStorage).forEach(key => {
        delete window.sessionStorage[key]
      })
    }),
  },
  writable: true,
})

// 模拟 window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// 模拟 ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// 模拟 IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// 模拟 fetch
global.fetch = vi.fn()

// 模拟 console 方法以减少测试输出噪音
global.console = {
  ...console,
  // 在测试中禁用 console.log
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// 设置全局测试超时
vi.setConfig({
  testTimeout: 10000,
})

// 设置时区以确保测试一致性
process.env.TZ = 'UTC'