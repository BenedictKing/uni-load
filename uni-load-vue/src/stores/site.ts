import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SiteGroup, SiteConfigRequest } from '@/types'
import { SiteApi } from '@/api'

export const useSiteStore = defineStore('site', () => {
  // 状态
  const siteGroups = ref<SiteGroup[]>([])
  const currentSite = ref<SiteGroup | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const configForm = ref<SiteConfigRequest>({
    siteName: '',
    baseUrl: '',
    apiKeys: [''],
    channelTypes: ['openai'],
    models: [],
    targetChannelName: '',
    operationType: 'create'
  })
  
  // 计算属性
  const activeSites = computed(() => siteGroups.value.filter(site => (site as any)._instance?.status === 'active'))
  const inactiveSites = computed(() => siteGroups.value.filter(site => (site as any)._instance?.status !== 'active'))
  const totalSites = computed(() => siteGroups.value.length)
  
  const isFormValid = computed(() => {
    return configForm.value.siteName.trim() !== '' &&
           configForm.value.baseUrl.trim() !== '' &&
           configForm.value.apiKeys.some(key => key.trim() !== '') &&
           configForm.value.channelTypes.some(type => type.trim() !== '')
  })
  
  // 动作
  async function fetchSiteGroups() {
    loading.value = true
    error.value = null
    try {
      const response = await SiteApi.getAllSites()
      siteGroups.value = response.data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取站点列表失败'
    } finally {
      loading.value = false
    }
  }
  
  async function createSite(siteData: SiteConfigRequest) {
    loading.value = true
    error.value = null
    try {
      const response = await SiteApi.createSite(siteData)
      if (response.data) {
        siteGroups.value.push(response.data)
      }
      // 重置表单
      resetConfigForm()
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建站点失败'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function updateSite(id: string, siteData: Partial<SiteGroup>) {
    loading.value = true
    error.value = null
    try {
      const response = await SiteApi.updateSite(id, siteData as SiteConfigRequest)
      const index = siteGroups.value.findIndex(s => (s as any).id === id)
      if (index !== -1 && response.data) {
        siteGroups.value[index] = response.data
      }
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新站点失败'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function deleteSite(id: string) {
    loading.value = true
    error.value = null
    try {
      await SiteApi.deleteSite(id)
      siteGroups.value = siteGroups.value.filter(s => (s as any).id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除站点失败'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  function setCurrentSite(site: SiteGroup | null) {
    currentSite.value = site
  }
  
  function updateConfigForm(field: keyof SiteConfigRequest, value: any) {
    configForm.value[field] = value
  }
  
  function resetConfigForm() {
    configForm.value = {
      siteName: '',
      baseUrl: '',
      apiKeys: [''],
      channelTypes: ['openai'],
      models: [],
      targetChannelName: '',
      operationType: 'create'
    }
  }
  
  function setConfigForm(config: SiteConfigRequest) {
    configForm.value = { ...config }
  }
  
  function generateSiteName() {
    const adjectives = ['Smart', 'Fast', 'Secure', 'Advanced', 'Modern', 'Dynamic']
    const nouns = ['AI', 'API', 'Service', 'Platform', 'Hub', 'Gateway']
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)]
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
    const randomNum = Math.floor(Math.random() * 1000)
    
    return `${randomAdjective}${randomNoun}${randomNum}`
  }
  
  function clearError() {
    error.value = null
  }
  
  return {
    // 状态
    siteGroups,
    currentSite,
    loading,
    error,
    configForm,
    
    // 计算属性
    activeSites,
    inactiveSites,
    totalSites,
    isFormValid,
    
    // 动作
    fetchSiteGroups,
    createSite,
    updateSite,
    deleteSite,
    setCurrentSite,
    updateConfigForm,
    resetConfigForm,
    setConfigForm,
    generateSiteName,
    clearError,
  }
})