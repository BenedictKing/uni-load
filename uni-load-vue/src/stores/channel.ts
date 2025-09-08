import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Channel } from '@/types'
import { Api } from '@/api'

export const useChannelStore = defineStore('channel', () => {
  // 状态
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedChannel = ref<Channel | null>(null)
  const searchQuery = ref('')
  const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')

  // 计算属性
  const filteredChannels = computed(() => {
    return channels.value.filter(channel => {
      const matchesSearch =
        channel.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        (channel.url && channel.url.toLowerCase().includes(searchQuery.value.toLowerCase()))

      const matchesStatus =
        statusFilter.value === 'all' ||
        (statusFilter.value === 'enabled' && channel.enabled) ||
        (statusFilter.value === 'disabled' && !channel.enabled)

      return matchesSearch && matchesStatus
    })
  })

  const enabledChannels = computed(() => channels.value.filter(c => c.enabled))
  const disabledChannels = computed(() => channels.value.filter(c => !c.enabled))
  const totalChannels = computed(() => channels.value.length)

  const healthyChannels = computed(() => channels.value.filter(c => c.enabled && c.status === 'healthy').length)

  const unhealthyChannels = computed(() => channels.value.filter(c => c.enabled && c.status !== 'healthy').length)

  // 动作
  async function fetchChannels() {
    loading.value = true
    error.value = null
    try {
      const response = await Api.Channel.getSiteGroups()
      channels.value = response.data?.siteGroups || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取渠道列表失败'
    } finally {
      loading.value = false
    }
  }

  async function toggleChannelStatus(id: string) {
    const channel = channels.value.find(c => c.id === id)
    if (!channel) return
  }

  function setSelectedChannel(channel: Channel | null) {
    selectedChannel.value = channel
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function setStatusFilter(status: 'all' | 'enabled' | 'disabled') {
    statusFilter.value = status
  }

  function clearError() {
    error.value = null
  }

  return {
    // 状态
    channels,
    loading,
    error,
    selectedChannel,
    searchQuery,
    statusFilter,

    // 计算属性
    filteredChannels,
    enabledChannels,
    disabledChannels,
    totalChannels,
    healthyChannels,
    unhealthyChannels,

    // 动作
    fetchChannels,
    toggleChannelStatus,
    setSelectedChannel,
    setSearchQuery,
    setStatusFilter,
    clearError,
  }
})
