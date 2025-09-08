import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mdi } from 'vuetify/iconsets/mdi'

// 自定义主题
const lightTheme = {
  dark: false,
  colors: {
    primary: '#1976D2',
    secondary: '#667eea',
    accent: '#82B1FF',
    error: '#FF5252',
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FFC107',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    'on-primary': '#ffffff',
    'on-secondary': '#ffffff',
    'on-surface': '#333333',
  },
}

const darkTheme = {
  dark: true,
  colors: {
    primary: '#2196F3',
    secondary: '#7c3aed',
    accent: '#FF4081',
    error: '#FF5252',
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FFC107',
    background: '#121212',
    surface: '#1E1E1E',
    'on-primary': '#ffffff',
    'on-secondary': '#ffffff',
    'on-surface': '#e0e0e0',
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
  defaults: {
    VBtn: {
      rounded: 'md',
      elevation: 2,
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
    VTabs: {
      alignTabs: 'center',
    },
    VTab: {
      textTransform: 'none',
    },
  },
})
