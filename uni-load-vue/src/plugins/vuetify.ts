import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mdi } from 'vuetify/iconsets/mdi'
import colors from 'vuetify/util/colors'

// 简洁的轻色主题
const lightTheme = {
  dark: false,
  colors: {
    primary: colors.indigo.base,
    secondary: colors.blueGrey.darken1,
    accent: colors.pink.base,
    error: colors.red.base,
    info: colors.blue.base,
    success: colors.green.base,
    warning: colors.amber.base,
    background: colors.grey.lighten4,
    surface: colors.shades.white,
    'on-primary': colors.shades.white,
    'on-secondary': colors.shades.white,
    'on-surface': colors.grey.darken4,
  },
}

// 简洁的暗色主题
const darkTheme = {
  dark: true,
  colors: {
    primary: colors.indigo.lighten1,
    secondary: colors.blueGrey.lighten1,
    accent: colors.pink.lighten1,
    error: colors.red.lighten1,
    info: colors.blue.lighten1,
    success: colors.green.lighten1,
    warning: colors.amber.lighten1,
    background: colors.grey.darken4,
    surface: colors.grey.darken3,
    'on-primary': colors.shades.white,
    'on-secondary': colors.shades.white,
    'on-surface': colors.shades.white,
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
