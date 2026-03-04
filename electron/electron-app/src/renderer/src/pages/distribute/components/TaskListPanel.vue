<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, computed } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import CustomFormDialog from '@renderer/components/CustomFormDialog.vue'
import type { FormConfig } from '@shared/types/render'

defineProps<{ connected: boolean }>()

const ipc = inject<IpcProxy>('ipc')!

// ==================== 类型 ====================

interface LocalTask {
  id: number
  remoteTaskId: number
  projectRemoteId?: number
  projectName: string
  projectLocalPath?: string
  content: string
  status: string
  promptPath?: string
  result?: string
  remoteCreatedAt?: string
  localStartedAt?: string
  localFinishedAt?: string
  createdAt: string
}

// ==================== 状态 ====================

const tasks = ref<LocalTask[]>([])
const loading = ref(false)

const DONE_PREVIEW_COUNT = 10
const doneExpanded = ref(false)

// ==================== 派生数据 ====================

const pendingTasks = computed(() =>
  tasks.value.filter((t) => t.status === 'pending' || t.status === 'distributed')
)
const runningTasks = computed(() => tasks.value.filter((t) => t.status === 'running'))
const doneTasks = computed(() =>
  tasks.value.filter((t) => t.status === 'completed' || t.status === 'failed')
)
const doneTasksVisible = computed(() =>
  doneExpanded.value ? doneTasks.value : doneTasks.value.slice(0, DONE_PREVIEW_COUNT)
)

function hasRunningTaskForProject(task: LocalTask): boolean {
  if (!task.projectRemoteId) return false
  return runningTasks.value.some(
    (t) => t.id !== task.id && t.projectRemoteId === task.projectRemoteId
  )
}

// ==================== 数据加载 ====================

const loadTasks = async () => {
  loading.value = true
  try {
    const res = await ipc.distribute.getLocalTasks()
    if (res.success && res.data) tasks.value = res.data
  } catch (e) {
    console.error('加载本地任务失败', e)
  } finally {
    loading.value = false
  }
}

// ==================== 开始处理弹框 ====================

const startDialogVisible = ref(false)
const startingTask = ref<LocalTask | null>(null)
const startLoading = ref(false)
const promptContent = ref('')
const promptPath = ref('')
const copySuccess = ref(false)

// 开始处理弹框：只读展示 prompt，不需要可编辑字段
// 用一个只读 textarea 字段展示内容，复制通过 extra slot 实现
const startFormConfig = computed<FormConfig>(() => ({
  fields: [
    {
      key: 'promptPath',
      renderLabel: 'Prompt 文件路径',
      renderType: 'input',
      value: promptPath.value,
      renderParams: { readonly: true, class: 'font-mono text-xs' }
    },
    {
      key: 'promptContent',
      renderLabel: 'Prompt 内容',
      renderType: 'textarea',
      value: promptContent.value,
      renderParams: { readonly: true, rows: 12, autoResize: false, class: 'font-mono text-xs' }
    }
  ],
  layout: 'vertical'
}))

const handleClickStart = async (task: LocalTask) => {
  startingTask.value = task
  startLoading.value = true
  copySuccess.value = false
  try {
    const res = await ipc.distribute.startLocalTask(task.id)
    if (!res.success) throw new Error(res.msg || '操作失败')
    promptContent.value = res.data.promptContent
    promptPath.value = res.data.promptPath
    startDialogVisible.value = true
    await loadTasks()
  } catch (e: any) {
    alert(e.message || '开始处理失败')
  } finally {
    startLoading.value = false
  }
}

const handleCopyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(promptContent.value)
    copySuccess.value = true
    setTimeout(() => (copySuccess.value = false), 2000)
  } catch {
    alert('复制失败，请手动复制')
  }
}

const handleStartSubmit = () => {
  // CustomFormDialog closeOnSubmit 默认关闭，直接确认即可
  startingTask.value = null
}

const handleStartCancel = async () => {
  if (!startingTask.value) return
  try {
    await ipc.distribute.cancelStartLocalTask(startingTask.value.id)
  } catch (e) {
    console.error('取消失败', e)
  } finally {
    startingTask.value = null
    await loadTasks()
  }
}

// ==================== 完成处理弹框 ====================

const finishDialogVisible = ref(false)
const finishingTask = ref<LocalTask | null>(null)
const finishLoading = ref(false)

const finishFormConfig = computed<FormConfig>(() => ({
  fields: [
    {
      key: 'success',
      renderLabel: '执行结果',
      renderType: 'radio',
      value: 'true',
      options: [
        { label: '✅ 成功', value: 'true' },
        { label: '❌ 失败', value: 'false' }
      ]
    },
    {
      key: 'result',
      renderLabel: '备注（可选）',
      renderType: 'textarea',
      value: '',
      renderParams: { placeholder: '请填写执行结果或说明', rows: 4, autoResize: false }
    }
  ],
  layout: 'vertical'
}))

const handleClickFinish = (task: LocalTask) => {
  finishingTask.value = task
  finishDialogVisible.value = true
}

const handleFinishSubmit = async (formData: Record<string, any>) => {
  if (!finishingTask.value) return
  finishLoading.value = true
  try {
    const res = await ipc.distribute.finishLocalTask(finishingTask.value.id, {
      success: formData.success !== 'false',
      result: formData.result || undefined
    })
    if (!res.success) throw new Error(res.msg || '操作失败')
    finishingTask.value = null
    await loadTasks()
  } catch (e: any) {
    alert(e.message || '提交失败')
  } finally {
    finishLoading.value = false
  }
}

// ==================== 工具函数 ====================

const truncate = (text: string, len = 80) =>
  text && text.length > len ? text.substring(0, len) + '…' : text

const formatTime = (iso?: string) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

// ==================== 生命周期 ====================

const onTaskReceived = () => loadTasks()

onMounted(() => {
  loadTasks()
  window.electron.ipcRenderer.on('distribute:task-received', onTaskReceived)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('distribute:task-received')
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 顶部工具栏 -->
    <div class="flex justify-end">
      <Button
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        text
        :loading="loading"
        v-tooltip="'刷新'"
        @click="loadTasks"
      />
    </div>

    <!-- ========== 未处理 ========== -->
    <div class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <i class="pi pi-inbox text-orange-500" />
        <span class="font-semibold text-sm">未处理</span>
        <Badge :value="pendingTasks.length" severity="warn" />
      </div>
      <div v-if="pendingTasks.length === 0" class="px-4 py-6 text-center text-sm text-surface-400">
        暂无待处理任务
      </div>
      <div v-else class="divide-y divide-surface-100 dark:divide-surface-700">
        <div
          v-for="task in pendingTasks"
          :key="task.id"
          class="flex items-start gap-3 px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-surface-400">#{{ task.remoteTaskId }}</span>
              <Tag :value="task.projectName" severity="secondary" class="text-xs" />
            </div>
            <p class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed">
              {{ truncate(task.content) }}
            </p>
            <span class="text-xs text-surface-400 mt-1 block">
              下发于 {{ formatTime(task.remoteCreatedAt) }}
            </span>
          </div>
          <div class="shrink-0 pt-1">
            <Button
              label="开始处理"
              icon="pi pi-play"
              size="small"
              severity="info"
              :loading="startingTask?.id === task.id && startLoading"
              :disabled="hasRunningTaskForProject(task)"
              v-tooltip="hasRunningTaskForProject(task) ? '该工程已有处理中的任务' : ''"
              @click="handleClickStart(task)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 处理中 ========== -->
    <div class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <i class="pi pi-spin pi-spinner text-blue-500" />
        <span class="font-semibold text-sm">处理中</span>
        <Badge :value="runningTasks.length" severity="info" />
      </div>
      <div v-if="runningTasks.length === 0" class="px-4 py-6 text-center text-sm text-surface-400">
        暂无处理中的任务
      </div>
      <div v-else class="divide-y divide-surface-100 dark:divide-surface-700">
        <div
          v-for="task in runningTasks"
          :key="task.id"
          class="flex items-start gap-3 px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-surface-400">#{{ task.remoteTaskId }}</span>
              <Tag :value="task.projectName" severity="secondary" class="text-xs" />
            </div>
            <p class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed">
              {{ truncate(task.content) }}
            </p>
            <div class="flex items-center gap-3 mt-1">
              <span class="text-xs text-surface-400">开始于 {{ formatTime(task.localStartedAt) }}</span>
              <span
                v-if="task.promptPath"
                class="text-xs text-surface-400 font-mono truncate max-w-48"
                v-tooltip="task.promptPath"
              >
                {{ task.promptPath.split('/').pop() }}
              </span>
            </div>
          </div>
          <div class="shrink-0 pt-1">
            <Button
              label="完成处理"
              icon="pi pi-check"
              size="small"
              severity="success"
              @click="handleClickFinish(task)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 已完成 ========== -->
    <div class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <i class="pi pi-check-circle text-green-500" />
        <span class="font-semibold text-sm">已完成</span>
        <Badge :value="doneTasks.length" severity="secondary" />
      </div>
      <div v-if="doneTasks.length === 0" class="px-4 py-6 text-center text-sm text-surface-400">
        暂无已完成任务
      </div>
      <div v-else class="divide-y divide-surface-100 dark:divide-surface-700">
        <div v-for="task in doneTasksVisible" :key="task.id" class="flex items-start gap-3 px-4 py-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-surface-400">#{{ task.remoteTaskId }}</span>
              <Tag :value="task.projectName" severity="secondary" class="text-xs" />
              <Tag
                :value="task.status === 'completed' ? '成功' : '失败'"
                :severity="task.status === 'completed' ? 'success' : 'danger'"
                class="text-xs"
              />
            </div>
            <p class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed">
              {{ truncate(task.content) }}
            </p>
            <div class="flex items-center gap-3 mt-1">
              <span class="text-xs text-surface-400">完成于 {{ formatTime(task.localFinishedAt) }}</span>
              <span v-if="task.result" class="text-xs text-surface-500 italic">
                {{ truncate(task.result, 40) }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="doneTasks.length > DONE_PREVIEW_COUNT" class="px-4 py-2 text-center">
          <Button
            :label="doneExpanded ? '收起' : `展开全部 (${doneTasks.length} 条)`"
            :icon="doneExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
            size="small"
            severity="secondary"
            text
            @click="doneExpanded = !doneExpanded"
          />
        </div>
      </div>
    </div>

    <!-- ========== 开始处理弹框 ========== -->
    <CustomFormDialog
      v-model:visible="startDialogVisible"
      title="开始处理任务"
      :config="startFormConfig"
      width="640px"
      :close-on-submit="true"
      @submit="handleStartSubmit"
      @cancel="handleStartCancel"
    >
      <!-- 复制按钮 + 提示放在字段下方 -->
      <template #extra>
        <div class="flex flex-col gap-3 mt-2">
          <div class="flex items-center gap-2">
            <Button
              :label="copySuccess ? '已复制 ✓' : '复制 Prompt'"
              :icon="copySuccess ? 'pi pi-check' : 'pi pi-copy'"
              :severity="copySuccess ? 'success' : 'primary'"
              size="small"
              @click="handleCopyPrompt"
            />
          </div>
          <Message severity="info" :closable="false" class="text-sm">
            请复制以上 Prompt，在你选择的 AI 工具中执行任务，完成后回到「处理中」点击「完成处理」。
          </Message>
        </div>
      </template>
    </CustomFormDialog>

    <!-- ========== 完成处理弹框 ========== -->
    <CustomFormDialog
      v-model:visible="finishDialogVisible"
      :title="`完成任务 #${finishingTask?.remoteTaskId}`"
      :config="finishFormConfig"
      width="480px"
      :close-on-submit="true"
      @submit="handleFinishSubmit"
    />
  </div>
</template>
