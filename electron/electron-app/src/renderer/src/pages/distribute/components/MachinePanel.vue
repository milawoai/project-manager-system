<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import { inject, onMounted, ref } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import type { DistMachine } from '@shared/types/distribute'
import { DistMachineStatus } from '@shared/types/distribute'

defineProps<{ connected: boolean }>()

const ipc = inject<IpcProxy>('ipc')!
const { t } = useI18n()

const machines = ref<DistMachine[]>([])
const loading = ref(false)

/** 加载机器列表 */
const loadMachines = async () => {
  loading.value = true
  try {
    const res = await ipc.distribute.getDistMachines()
    if (res.success && res.data) {
      machines.value = res.data
    }
  } catch (e) {
    console.error('加载机器列表失败', e)
  } finally {
    loading.value = false
  }
}

/** 状态颜色 */
const getStatusSeverity = (status: string) => {
  switch (status) {
    case DistMachineStatus.ONLINE:
      return 'success'
    case DistMachineStatus.BUSY:
      return 'warn'
    default:
      return 'danger'
  }
}

/** 状态标签 */
const getStatusLabel = (status: string) => {
  switch (status) {
    case DistMachineStatus.ONLINE:
      return t('distribute.machine.online')
    case DistMachineStatus.BUSY:
      return t('distribute.machine.busy')
    default:
      return t('distribute.machine.offline')
  }
}

onMounted(() => {
  loadMachines()
})
</script>

<template>
  <div>
    <!-- 工具栏 -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-surface-500">
        {{ t('distribute.machine.total', { count: machines.length }) }}
      </span>
      <Button
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        text
        @click="loadMachines"
      />
    </div>

    <!-- 机器列表 -->
    <DataTable
      :value="machines"
      :loading="loading"
      striped-rows
      class="text-sm"
    >
      <Column field="name" :header="t('distribute.machine.name')" style="min-width: 150px">
        <template #body="{ data }">
          <span class="font-medium">{{ data.name }}</span>
        </template>
      </Column>
      <Column field="platform" :header="t('distribute.machine.platform')" style="width: 100px" />
      <Column field="hasOpenClaw" :header="t('distribute.machine.openClaw')" style="width: 120px">
        <template #body="{ data }">
          <Tag
            :severity="data.hasOpenClaw ? 'success' : 'secondary'"
            :value="data.hasOpenClaw ? t('distribute.machine.openClawInstalled') : t('distribute.machine.openClawNotInstalled')"
            class="text-xs"
          />
        </template>
      </Column>
      <Column field="status" :header="t('distribute.machine.status')" style="width: 100px">
        <template #body="{ data }">
          <Tag :severity="getStatusSeverity(data.status)" :value="getStatusLabel(data.status)" />
        </template>
      </Column>
      <Column field="capabilities" :header="t('distribute.machine.capabilities')" style="min-width: 150px">
        <template #body="{ data }">
          <div class="flex flex-wrap gap-1">
            <Tag
              v-for="cap in (data.capabilities || [])"
              :key="cap"
              :value="cap"
              severity="info"
              class="text-xs"
            />
            <span v-if="!data.capabilities?.length" class="text-surface-400">-</span>
          </div>
        </template>
      </Column>
      <Column field="lastHeartbeat" :header="t('distribute.machine.lastHeartbeat')" style="width: 160px">
        <template #body="{ data }">
          <span class="text-xs">{{ data.lastHeartbeat || '-' }}</span>
        </template>
      </Column>
      <template #empty>
        <div class="text-center py-6 text-surface-400">
          {{ connected ? t('distribute.machine.empty') : t('distribute.machine.notConnected') }}
        </div>
      </template>
    </DataTable>
  </div>
</template>
