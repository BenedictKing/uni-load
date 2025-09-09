// 确保 Vuetify 样式被正确导入
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mdi } from 'vuetify/iconsets/mdi'
import colors from 'vuetify/util/colors'

// 现代化的轻色主题
const lightTheme = {
  dark: false,
  colors: {
    primary: '#8B5CF6', // 新的紫色主色调
    secondary: '#06B6D4', // 青色辅助色
    accent: '#EC4899', // 粉色点缀色
    error: '#EF4444',
    info: '#3B82F6',
    success: '#22C55E',
    warning: '#F59E0B',
    background: '#F9FAFB',
    surface: '#FFFFFF',
    'on-primary': '#FFFFFF',
    'on-secondary': '#FFFFFF',
    'on-surface': '#111827',
    'surface-variant': '#F3F4F6',
  },
}

// 现代化的暗色主题
const darkTheme = {
  dark: true,
  colors: {
    primary: '#A78BFA', // 浅紫色
    secondary: '#22D3EE', // 浅青色
    accent: '#F472B6', // 浅粉色
    error: '#F87171',
    info: '#60A5FA',
    success: '#4ADE80',
    warning: '#FBBF24',
    background: '#111827',
    surface: '#1F2937',
    'on-primary': '#FFFFFF',
    'on-secondary': '#FFFFFF',
    'on-surface': '#F9FAFB',
    'surface-variant': '#374151',
  },
}

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: lightTheme,
      dark: darkTheme,
    },
  },
  icons: {
    defaultSet: 'mdi',
    sets: {
      mdi,
    },
  },
  // 确保启用所有 Vuetify 功能
  ssr: false,
  defaults: {
    VBtn: {
      rounded: 'md',
      elevation: 1,
    },
    VCard: {
      rounded: 'lg',
      elevation: 2,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VDataTable: {
      density: 'comfortable',
    },
  },
})
