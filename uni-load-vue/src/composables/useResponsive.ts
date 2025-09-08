import { ref, onMounted, onUnmounted, computed, readonly } from 'vue'

// 响应式断点定义
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

/**
 * 响应式hook - 用于检测和响应屏幕尺寸变化
 */
export function useResponsive() {
  const windowWidth = ref(0)
  const windowHeight = ref(0)
  
  // 更新窗口尺寸
  const updateSize = () => {
    windowWidth.value = window.innerWidth
    windowHeight.value = window.innerHeight
  }
  
  onMounted(() => {
    updateSize()
    window.addEventListener('resize', updateSize)
  })
  
  onUnmounted(() => {
    window.removeEventListener('resize', updateSize)
  })
  
  // 当前断点
  const currentBreakpoint = computed<Breakpoint>(() => {
    const width = windowWidth.value
    if (width >= BREAKPOINTS['2xl']) return '2xl'
    if (width >= BREAKPOINTS.xl) return 'xl'
    if (width >= BREAKPOINTS.lg) return 'lg'
    if (width >= BREAKPOINTS.md) return 'md'
    if (width >= BREAKPOINTS.sm) return 'sm'
    return 'sm'
  })
  
  // 是否为移动设备
  const isMobile = computed(() => windowWidth.value < BREAKPOINTS.md)
  
  // 是否为平板设备
  const isTablet = computed(() => 
    windowWidth.value >= BREAKPOINTS.md && windowWidth.value < BREAKPOINTS.lg
  )
  
  // 是否为桌面设备
  const isDesktop = computed(() => windowWidth.value >= BREAKPOINTS.lg)
  
  // 是否为大屏设备
  const isLargeScreen = computed(() => windowWidth.value >= BREAKPOINTS.xl)
  
  // 检查是否大于等于指定断点
  const isBreakpointAndUp = (breakpoint: Breakpoint) => {
    return computed(() => windowWidth.value >= BREAKPOINTS[breakpoint])
  }
  
  // 检查是否小于指定断点
  const isBreakpointAndDown = (breakpoint: Breakpoint) => {
    return computed(() => windowWidth.value < BREAKPOINTS[breakpoint])
  }
  
  // 检查是否在断点范围内
  const isBetweenBreakpoints = (min: Breakpoint, max: Breakpoint) => {
    return computed(() => 
      windowWidth.value >= BREAKPOINTS[min] && windowWidth.value < BREAKPOINTS[max]
    )
  }
  
  // 获取网格列数（基于屏幕宽度）
  const gridColumns = computed(() => {
    if (windowWidth.value >= BREAKPOINTS['2xl']) return 4
    if (windowWidth.value >= BREAKPOINTS.xl) return 3
    if (windowWidth.value >= BREAKPOINTS.lg) return 3
    if (windowWidth.value >= BREAKPOINTS.md) return 2
    return 1
  })
  
  // 获取容器内边距
  const containerPadding = computed(() => {
    if (windowWidth.value >= BREAKPOINTS.lg) return 'var(--spacing-xl)'
    if (windowWidth.value >= BREAKPOINTS.md) return 'var(--spacing-lg)'
    return 'var(--spacing-md)'
  })
  
  return {
    // 状态
    windowWidth: readonly(windowWidth),
    windowHeight: readonly(windowHeight),
    currentBreakpoint,
    
    // 设备类型检测
    isMobile,
    isTablet,
    isDesktop,
    isLargeScreen,
    
    // 断点检测函数
    isBreakpointAndUp,
    isBreakpointAndDown,
    isBetweenBreakpoints,
    
    // 响应式数值
    gridColumns,
    containerPadding,
    
    // 工具方法
    updateSize,
  }
}

/**
 * 媒体查询hook - 用于检测特定媒体查询条件
 */
export function useMediaQuery(query: string) {
  const matches = ref(false)
  
  let mediaQuery: MediaQueryList | null = null
  
  const updateMatches = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  
  onMounted(() => {
    if (window.matchMedia) {
      mediaQuery = window.matchMedia(query)
      matches.value = mediaQuery.matches
      
      // 现代浏览器使用 addEventListener
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', updateMatches)
      } else {
        // 兼容旧浏览器
        mediaQuery.addListener(updateMatches)
      }
    }
  })
  
  onUnmounted(() => {
    if (mediaQuery) {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateMatches)
      } else {
        mediaQuery.removeListener(updateMatches)
      }
    }
  })
  
  return readonly(matches)
}

/**
 * 暗色主题检测hook
 */
export function usePrefersDark() {
  return useMediaQuery('(prefers-color-scheme: dark)')
}

/**
 * 减少动画偏好检测hook
 */
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * 触摸设备检测hook
 */
export function useTouch() {
  const isTouch = useMediaQuery('(hover: none) and (pointer: coarse)')
  return {
    isTouch,
    isHover: computed(() => !isTouch.value),
  }
}

/**
 * 设备方向检测hook
 */
export function useOrientation() {
  const isPortrait = useMediaQuery('(orientation: portrait)')
  const isLandscape = computed(() => !isPortrait.value)
  
  return {
    isPortrait,
    isLandscape,
  }
}

/**
 * 网络连接状态检测hook
 */
export function useNetworkStatus() {
  const isOnline = ref(navigator.onLine)
  
  const updateOnlineStatus = () => {
    isOnline.value = navigator.onLine
  }
  
  onMounted(() => {
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
  })
  
  onUnmounted(() => {
    window.removeEventListener('online', updateOnlineStatus)
    window.removeEventListener('offline', updateOnlineStatus)
  })
  
  return {
    isOnline: readonly(isOnline),
    isOffline: computed(() => !isOnline.value),
  }
}