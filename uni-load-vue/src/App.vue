<template>
  <v-app>
    <Layout>
      <router-view />
    </Layout>
  </v-app>
</template>

<script setup lang="ts">
import Layout from '@/components/Layout.vue'
</script>

<style>
/* App 全局样式 */
.v-application {
  background: #f5f5f5;
  min-height: 100vh;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.v-theme--dark .v-application {
  background: #121212;
}

/* 全局过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式字体大小 */
@media (max-width: 768px) {
  .v-application {
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .v-application {
    font-size: 13px;
  }
}
</style>
