<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import ProjectPanel from './components/ProjectPanel.vue'
import UsageGuidePanel from './components/UsageGuidePanel.vue'
import { inject, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'

const ipc = inject<IpcProxy>('ipc')!

const { t } = useI18n()

// Active tab index
const activeTab = ref('UI')

// Load data on component mount
onMounted(() => {
  nextTick(() => {
    mountedFunc()
  })
  window.electron.ipcRenderer.on('recevied-report-message', (data) => {
    window.alert(JSON.stringify(data, null, 2))
  })
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('recevied-report-message')
})

const mountedFunc = async () => {
  try {
    // 先检查服务状态
  } catch (error) {
    console.error(error)
  }
}

const handleClickTest = async () => {
  try {
    ipc.common.basicTest()
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <div class="card w-full p-4">
    <Button @click="handleClickTest">测试功能</Button>

    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="UI">{{ t('init.tabs.projects') }}</Tab>
        <Tab value="usage">{{ t('init.tabs.usage') }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel :header="t('init.tabs.projects')" value="UI">
          <ProjectPanel />
        </TabPanel>
        <TabPanel :header="t('init.tabs.usage')" value="usage">
          <UsageGuidePanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.p-tabview {
  margin-bottom: 1rem;
}
</style>
