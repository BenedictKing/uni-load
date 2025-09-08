import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import type { ComponentMountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'

/**
 * 创建用于测试的路由器实例
 */
export function createTestRouter(routes: any[] = []) {
  return createRouter({
    history: createWebHistory(),
    routes: routes.length > 0 ? routes : [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/about', component: { template: '<div>About</div>' } },
    ],
  })
}

/**
 * 挂载组件的辅助函数，自动配置常用的全局插件
 */
export function mountComponent<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> & {
    router?: boolean | any
    pinia?: boolean
  } = {}
): VueWrapper<any> {
  const { router = false, pinia = true, ...mountOptions } = options

  const plugins = []

  // 配置 Pinia
  if (pinia) {
    plugins.push(createPinia())
  }

  // 配置路由
  if (router) {
    const routerInstance = router === true ? createTestRouter() : router
    plugins.push(routerInstance)
  }

  return mount(component, {
    global: {
      plugins,
      ...mountOptions.global,
    },
    ...mountOptions,
  })
}

/**
 * 创建模拟的 API 响应
 */
export function createMockApiResponse<T>(data: T, success = true) {
  return {
    data,
    success,
    message: success ? 'Success' : 'Error',
    code: success ? 200 : 400,
  }
}

/**
 * 等待下一个事件循环tick
 */
export function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * 等待指定的时间
 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 模拟用户点击
 */
export async function userClick(wrapper: VueWrapper<any>, selector: string) {
  const element = wrapper.find(selector)
  if (!element.exists()) {
    throw new Error(`Element with selector "${selector}" not found`)
  }
  await element.trigger('click')
}

/**
 * 模拟用户输入
 */
export async function userType(wrapper: VueWrapper<any>, selector: string, value: string) {
  const input = wrapper.find(selector)
  if (!input.exists()) {
    throw new Error(`Input with selector "${selector}" not found`)
  }
  await input.setValue(value)
  await input.trigger('input')
}

/**
 * 创建模拟的文件对象
 */
export function createMockFile(name: string, content: string, type = 'text/plain') {
  return new File([content], name, { type })
}

/**
 * 模拟窗口大小变化
 */
export function mockWindowSize(width: number, height: number = 768) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  })
  
  // 触发 resize 事件
  window.dispatchEvent(new Event('resize'))
}

/**
 * 模拟网络请求响应
 */
export function mockFetch(response: any, options: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = options
  
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    blob: () => Promise.resolve(new Blob([JSON.stringify(response)])),
    headers: new Headers(),
  })
}

/**
 * 创建模拟的 localStorage
 */
export function createMockLocalStorage() {
  const storage: { [key: string]: string } = {}
  
  return {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key]
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key])
    }),
    key: vi.fn((index: number) => {
      const keys = Object.keys(storage)
      return keys[index] || null
    }),
    get length() {
      return Object.keys(storage).length
    },
  }
}

/**
 * 断言元素是否可见
 */
export function expectElementToBeVisible(wrapper: VueWrapper<any>, selector: string) {
  const element = wrapper.find(selector)
  expect(element.exists()).toBe(true)
  expect(element.isVisible()).toBe(true)
}

/**
 * 断言元素是否隐藏
 */
export function expectElementToBeHidden(wrapper: VueWrapper<any>, selector: string) {
  const element = wrapper.find(selector)
  if (element.exists()) {
    expect(element.isVisible()).toBe(false)
  } else {
    expect(element.exists()).toBe(false)
  }
}

/**
 * 断言文本内容
 */
export function expectTextContent(wrapper: VueWrapper<any>, selector: string, expectedText: string) {
  const element = wrapper.find(selector)
  expect(element.exists()).toBe(true)
  expect(element.text()).toContain(expectedText)
}

/**
 * 获取组件的 Vue 实例
 */
export function getComponentInstance<T = any>(wrapper: VueWrapper<any>): T {
  return wrapper.vm as T
}

// 重新导出常用的测试函数
export { vi } from 'vitest'