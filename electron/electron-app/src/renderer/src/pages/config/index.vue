<script setup lang="ts">
import SystemVarInput from '@renderer/components/form/SystemVarInput.vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import type { ConfigGroup, ConfigItem } from '@shared/types/config'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { h, inject, onMounted, ref } from 'vue'
import { refreshApiRequestConfig } from '@renderer/api/base'

const ipc = inject<IpcProxy>('ipc')!

onMounted(() => {
  readConfigFromMain()
})

interface TabConfig {
  tabKey: string
  tabLabel: string
  groups: ConfigGroup[]
}

const renderConfigs = ref<TabConfig[]>([])

const readConfigFromMain = async () => {
  const { success, data } = await ipc.config.getAllConfigs()
  if (success) {
    renderConfigs.value = data
    // 设置默认激活的 tab
    if (data.length > 0 && !activeTab.value) {
      activeTab.value = data[0].tabKey
    }
  }
}

// 激活的tab
const activeTab = ref('')

// 保存配置组
const saveGroupAll = async (group: ConfigGroup) => {
  try {
    const values = group.list.reduce(
      (acc, item) => {
        acc[item.key] = item.value
        return acc
      },
      {} as Record<string, any>
    )

    const { success, msg } = await ipc.config.saveConfig(group.groupKey, values)
    if (!success) {
      console.error('保存失败:', msg)
      // TODO: 显示错误提示
    } else {
      // 如果保存的是 API 请求设置,刷新配置
      if (group.groupKey === 'api_request_settings') {
        await refreshApiRequestConfig()
      }
    }
  } catch (error) {
    console.error('保存配置组失败:', error)
  }
}

// 保存单个配置
const saveConfig = async (group: ConfigGroup) => {
  await saveGroupAll(group)
}

// 选择文件
const selectFile = async (item: ConfigItem) => {
  try {
    const result = await ipc.file.selectFile({
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Model Files', extensions: ['bin', 'ggml'] }
      ]
    })

    if (result.success && result.data) {
      item.value = result.data
    }
  } catch (error) {
    console.error('选择文件失败:', error)
  }
}

// 选择文件夹
const selectFolder = async (item: ConfigItem) => {
  try {
    const result = await ipc.file.selectFolder()

    if (result.success && result.data) {
      item.value = result.data
    }
  } catch (error) {
    console.error('选择文件夹失败:', error)
  }
}

// 渲染配置项
const renderConfigItem = (item: ConfigItem) => {
  const updateValue = (val: any) => {
    item.value = val
  }

  switch (item.renderType) {
    case 'input':
      return h(InputText, {
        modelValue: item.value,
        'onUpdate:modelValue': updateValue,
        placeholder: item.renderParams.placeholder
      })
    case 'textarea':
      return h(Textarea, {
        modelValue: item.value,
        'onUpdate:modelValue': updateValue,
        placeholder: item.renderParams.placeholder,
        autoResize: true
      })
    case 'selector':
      return h(Select, {
        modelValue: item.value,
        'onUpdate:modelValue': updateValue,
        options: item.renderParams.options,
        placeholder: item.renderParams.placeholder
      })
    case 'switch':
      return h(ToggleSwitch, {
        modelValue: item.value,
        'onUpdate:modelValue': updateValue
      })
    case 'systemVarInput':
      return h(SystemVarInput, {
        modelValue: item.value || {},
        'onUpdate:modelValue': updateValue
      })
    case 'filePath':
      return h('div', { class: 'file-path-wrapper' }, [
        h(InputText, {
          modelValue: item.value,
          'onUpdate:modelValue': updateValue,
          placeholder: item.renderParams.placeholder,
          readonly: true,
          class: 'file-path-input'
        }),
        h(Button, {
          label: '选择文件',
          icon: 'pi pi-folder-open',
          severity: 'secondary',
          class: 'file-select-button',
          onClick: () => selectFile(item)
        })
      ])
    case 'folderPath':
      return h('div', { class: 'folder-path-wrapper' }, [
        h(InputText, {
          modelValue: item.value,
          'onUpdate:modelValue': updateValue,
          placeholder: item.renderParams.placeholder,
          readonly: true,
          class: 'folder-path-input'
        }),
        h(Button, {
          label: '选择文件夹',
          icon: 'pi pi-folder-open',
          severity: 'secondary',
          class: 'folder-select-button',
          onClick: () => selectFolder(item)
        })
      ])
    default:
      return null
  }
}
</script>

<template>
  <div class="config-page">
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab v-for="tab in renderConfigs" :key="tab.tabKey" :value="tab.tabKey">
          {{ tab.tabLabel }}
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-for="tab in renderConfigs" :key="tab.tabKey" :value="tab.tabKey">
          <div v-for="(group, groupIndex) in tab.groups" :key="group.groupKey" class="config-group">
            <div class="group-header">
              <div class="header-content">
                <h3>{{ group.groupLabel }}</h3>
                <Button
                  label="保存全部"
                  class="bg-primary-500 hover:bg-primary-600 border-primary-500 hover:border-primary-600 text-white transition-colors duration-200"
                  @click="saveGroupAll(group)"
                />
              </div>
              <Divider />
            </div>
            <div v-for="(item, index) in group.list" :key="item.key">
              <div class="config-item">
                <label>{{ item.renderLabel }}</label>
                <div class="config-item-content">
                  <component :is="renderConfigItem(item)" />
                </div>
                <Button label="保存" @click="saveConfig(group)" />
              </div>
              <Divider v-if="index !== group.list.length - 1" class="item-divider" />
            </div>
            <Divider v-if="groupIndex !== tab.groups.length - 1" />
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped lang="less">
.config-page {
  padding: 20px;

  .config-group {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--surface-card);
    border-radius: 6px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

    .group-header {
      margin-bottom: 16px;

      .header-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;

        h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
          color: var(--text-color);
        }
      }

      :deep(.p-divider) {
        margin: 0;
      }
    }
  }

  .config-item {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    gap: 16px;
    padding: 16px;
    background: var(--surface-section);
    border-radius: 4px;

    label {
      width: 100px;
      // text-align: right;
      color: var(--text-color-secondary);
    }

    .config-item-content {
      flex: 1;

      :deep(.p-inputtext) {
        width: 100%;
      }

      :deep(.p-select) {
        width: 100%;
      }

      :deep(.p-textarea) {
        width: 100%;

        textarea {
          width: 100%;
          min-width: 100%;
          max-width: 100%;
        }
      }
    }

    .file-path-wrapper,
    .folder-path-wrapper {
      display: flex;
      gap: 8px;
      align-items: center;
      width: 100%;

      .file-path-input,
      .folder-path-input {
        flex: 1;
      }

      .file-select-button,
      .folder-select-button {
        flex-shrink: 0;
      }
    }

    :deep(.item-divider) {
      margin: 1rem 0;
    }
  }

  :deep(.p-divider) {
    margin: 1.5rem 0;
  }
}
</style>
