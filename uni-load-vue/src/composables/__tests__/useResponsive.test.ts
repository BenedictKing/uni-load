import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useResponsive, useMediaQuery, BREAKPOINTS } from '../useResponsive'

// 模拟窗口大小变化
const mockWindowSize = (width: number, height: number = 768) => {
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
}

describe('useResponsive', () => {
  beforeEach(() => {
    // 重置窗口大小
    mockWindowSize(1024, 768)
    
    // 清除事件监听器
    vi.clearAllMocks()
  })

  describe('窗口尺寸检测', () => {
    it('应该正确检测窗口宽度和高度', async () => {
      mockWindowSize(1200, 800)
      const { windowWidth, windowHeight, updateSize } = useResponsive()
      
      // 手动调用更新方法来同步测试环境
      updateSize()
      
      expect(windowWidth.value).toBe(1200)
      expect(windowHeight.value).toBe(800)
    })
  })

  describe('断点检测', () => {
    it('应该正确识别移动设备', () => {
      mockWindowSize(600) // 小于 md 断点 (768px)
      const { isMobile, isTablet, isDesktop } = useResponsive()
      
      expect(isMobile.value).toBe(true)
      expect(isTablet.value).toBe(false)
      expect(isDesktop.value).toBe(false)
    })

    it('应该正确识别平板设备', () => {
      mockWindowSize(900) // 在 md (768px) 和 lg (1024px) 之间
      const { isMobile, isTablet, isDesktop, updateSize } = useResponsive()
      updateSize()
      
      expect(isMobile.value).toBe(false)
      expect(isTablet.value).toBe(true)
      expect(isDesktop.value).toBe(false)
    })

    it('应该正确识别桌面设备', () => {
      mockWindowSize(1200) // 大于 lg 断点 (1024px)
      const { isMobile, isTablet, isDesktop, updateSize } = useResponsive()
      updateSize()
      
      expect(isMobile.value).toBe(false)
      expect(isTablet.value).toBe(false)
      expect(isDesktop.value).toBe(true)
    })
  })

  describe('当前断点', () => {
    it('应该正确返回当前断点', () => {
      const testCases = [
        { width: 500, expected: 'sm' },
        { width: 700, expected: 'md' },
        { width: 900, expected: 'lg' },
        { width: 1300, expected: 'xl' },
        { width: 1600, expected: '2xl' },
      ]

      testCases.forEach(({ width, expected }) => {
        mockWindowSize(width)
        const { currentBreakpoint, updateSize } = useResponsive()
        updateSize()
        expect(currentBreakpoint.value).toBe(expected)
      })
    })
  })

  describe('网格列数', () => {
    it('应该根据屏幕宽度返回正确的网格列数', () => {
      const testCases = [
        { width: 500, expected: 1 },
        { width: 800, expected: 2 },
        { width: 1100, expected: 3 },
        { width: 1400, expected: 3 },
        { width: 1600, expected: 4 },
      ]

      testCases.forEach(({ width, expected }) => {
        mockWindowSize(width)
        const { gridColumns, updateSize } = useResponsive()
        updateSize()
        expect(gridColumns.value).toBe(expected)
      })
    })
  })

  describe('断点检测函数', () => {
    it('isBreakpointAndUp 应该正确工作', () => {
      mockWindowSize(1000)
      const { isBreakpointAndUp, updateSize } = useResponsive()
      updateSize()
      
      expect(isBreakpointAndUp('sm').value).toBe(true)
      expect(isBreakpointAndUp('md').value).toBe(true)
      expect(isBreakpointAndUp('lg').value).toBe(false) // 1000px < 1024px
      expect(isBreakpointAndUp('xl').value).toBe(false)
    })

    it('isBreakpointAndDown 应该正确工作', () => {
      mockWindowSize(1000)
      const { isBreakpointAndDown, updateSize } = useResponsive()
      updateSize()
      
      expect(isBreakpointAndDown('sm').value).toBe(false)
      expect(isBreakpointAndDown('md').value).toBe(false)
      expect(isBreakpointAndDown('lg').value).toBe(true) // 1000px < 1024px
      expect(isBreakpointAndDown('xl').value).toBe(true)
    })

    it('isBetweenBreakpoints 应该正确工作', () => {
      mockWindowSize(900)
      const { isBetweenBreakpoints, updateSize } = useResponsive()
      updateSize()
      
      expect(isBetweenBreakpoints('md', 'lg').value).toBe(true) // 768 <= 900 < 1024
      expect(isBetweenBreakpoints('sm', 'md').value).toBe(false) // 900 >= 768
      expect(isBetweenBreakpoints('lg', 'xl').value).toBe(false) // 900 < 1024
    })
  })
})

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确检测媒体查询', () => {
    const mockMatchMedia = vi.fn()
    const mockMediaQuery = {
      matches: true,
      media: '(min-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    
    mockMatchMedia.mockReturnValue(mockMediaQuery)
    window.matchMedia = mockMatchMedia
    
    const matches = useMediaQuery('(min-width: 768px)')
    
    expect(mockMatchMedia).toHaveBeenCalledWith('(min-width: 768px)')
    expect(matches.value).toBe(true)
  })

  it('应该处理不支持 matchMedia 的情况', () => {
    // 移除 matchMedia
    const originalMatchMedia = window.matchMedia
    delete (window as any).matchMedia
    
    const matches = useMediaQuery('(min-width: 768px)')
    
    expect(matches.value).toBe(false)
    
    // 恢复 matchMedia
    window.matchMedia = originalMatchMedia
  })
})

describe('BREAKPOINTS 常量', () => {
  it('应该包含所有必要的断点', () => {
    expect(BREAKPOINTS).toEqual({
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1536,
    })
  })

  it('断点应该按升序排列', () => {
    const values = Object.values(BREAKPOINTS)
    const sortedValues = [...values].sort((a, b) => a - b)
    
    expect(values).toEqual(sortedValues)
  })
})