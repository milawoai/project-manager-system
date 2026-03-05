<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import { inject, onMounted, onUnmounted, ref, computed, nextTick } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import type { DistProject, LocalDistProject, AddLocalProjectParams } from '@shared/types/distribute'
import { PLATFORM_OPTIONS } from '@shared/datas/platform'
import type { OptionTag } from '@shared/types/project'
import type { AgentType, AgentOutputPayload, AgentDonePayload, AgentErrorPayload } from '@shared/types/aigent'
import TagInput from '@renderer/components/TagInput.vue'

defineProps<{ connected: boolean }>()

const ipc = inject<IpcProxy>('ipc')!
const { t } = useI18n()

// ==================== 数据 ====================

const remoteProjects = ref<DistProject[]>([])
const localProjects = ref<LocalDistProject[]>([])
const loading = ref(false)
/** 正在操作中的工程本地 id，number | null */
const actioningId = ref<number | null>(null)

// ==================== 合并列表 ====================

interface MergedProject {
  localId?: number
  remoteId?: string
  name: string
  gitUrl: string
  description?: string
  platform: number
  tags: string
  localPath?: string
  branch?: string
  syncedAt?: string
  uploadedAt?: string
  createdAt?: string
  _localOnly: boolean
}

const mergedProjects = computed((): MergedProject[] => {
  const remoteIds = new Set(remoteProjects.value.map((p) => p.id))
  const localMap = new Map(
    localProjects.value.filter((p) => p.remoteId).map((p) => [p.remoteId!, p])
  )

  const localOnly: MergedProject[] = localProjects.value
    .filter((p) => !p.remoteId || !remoteIds.has(p.remoteId))
    .map((p) => ({
      localId: p.id,
      remoteId: p.remoteId,
      name: p.name,
      gitUrl: p.gitUrl,
      description: p.description,
      platform: p.platform,
      tags: p.tags,
      localPath: p.localPath,
      branch: p.branch,
      syncedAt: p.syncedAt,
      uploadedAt: p.uploadedAt,
      createdAt: p.createdAt,
      _localOnly: true,
    }))

  const fromRemote: MergedProject[] = remoteProjects.value.map((p) => {
    const local = localMap.get(p.id)
    return {
      localId: local?.id,
      remoteId: p.id,
      name: p.name,
      gitUrl: p.gitUrl,
      description: p.description,
      platform: p.platform ?? 0,
      tags: p.tags ?? '',
      localPath: local?.localPath,
      branch: local?.branch,
      syncedAt: local?.syncedAt,
      uploadedAt: local?.uploadedAt,
      createdAt: p.createdAt,
      _localOnly: false,
    }
  })

  return [...localOnly, ...fromRemote]
})

// ==================== 加载 ====================

const loadAll = async () => {
  loading.value = true
  try {
    const [remoteRes, localRes] = await Promise.all([
      ipc.distribute.getDistProjects(),
      ipc.distribute.getLocalDistProjects()
    ])
    if (remoteRes.success && remoteRes.data) remoteProjects.value = remoteRes.data
    if (localRes.success && localRes.data) localProjects.value = localRes.data
  } catch (e) {
    console.error('加载工程列表失败', e)
  } finally {
    loading.value = false
  }
}

// ==================== 操作：关联 ====================

const handleAssociate = async (project: MergedProject) => {
  if (!project.remoteId) return
  actioningId.value = project.localId ?? null
  try {
    const folderRes = await ipc.file.selectFolder({ defaultPath: '' })
    if (!folderRes.success || !folderRes.data) return

    const syncRes = await ipc.distribute.syncRemoteProject({
      id: project.remoteId,
      name: project.name,
      gitUrl: project.gitUrl,
      description: project.description,
      platform: project.platform,
      tags: project.tags,
      createdAt: project.createdAt ?? '',
      updatedAt: '',
    } as DistProject)
    if (!syncRes.success || !syncRes.data) return

    const localId: number = syncRes.data.id
    actioningId.value = localId
    const res = await ipc.distribute.setProjectLocalPath(localId, folderRes.data)
    if (res.success && res.data) localProjects.value = res.data
  } catch (e) {
    console.error('关联失败', e)
  } finally {
    actioningId.value = null
  }
}

// ==================== 操作：修改路径 ====================

const handleChangePath = async (project: MergedProject) => {
  if (project.localId === undefined) return
  actioningId.value = project.localId
  try {
    const folderRes = await ipc.file.selectFolder({ defaultPath: project.localPath || '' })
    if (!folderRes.success || !folderRes.data) return
    const res = await ipc.distribute.setProjectLocalPath(project.localId, folderRes.data)
    if (res.success && res.data) localProjects.value = res.data
  } catch (e) {
    console.error('修改路径失败', e)
  } finally {
    actioningId.value = null
  }
}

// ==================== 操作：上传 ====================

const handleUpload = async (project: MergedProject) => {
  if (project.localId === undefined) return
  actioningId.value = project.localId
  try {
    const res = await ipc.distribute.uploadLocalProject(project.localId)
    if (res.success) await loadAll()
  } catch (e) {
    console.error('上传失败', e)
  } finally {
    actioningId.value = null
  }
}

// ==================== 操作：移除 ====================

const handleRemove = async (project: MergedProject) => {
  if (project.localId === undefined) return
  actioningId.value = project.localId
  try {
    const res = await ipc.distribute.removeLocalProject(project.localId)
    if (res.success && res.data) localProjects.value = res.data
  } catch (e) {
    console.error('移除失败', e)
  } finally {
    actioningId.value = null
  }
}

// ==================== 操作：编辑本地工程 ====================

/** tags 字符串 ↔ OptionTag[] 互转 */
const tagsToOptionTags = (tags: string): OptionTag[] =>
  tags ? tags.split(',').map((s) => ({ name: s.trim() })).filter((t) => t.name) : []

const optionTagsToString = (tags: OptionTag[]): string =>
  tags.map((t) => t.name).join(',')

interface EditForm {
  name: string
  gitUrl: string
  description: string
  platform: number
  tags: OptionTag[]
  localPath: string
}

const editDialogVisible = ref(false)
const editingLocalId = ref<number | null>(null)
const editLoading = ref(false)
const editForm = ref<EditForm>({
  name: '', gitUrl: '', description: '', platform: 0, tags: [], localPath: ''
})

const openEditDialog = (project: MergedProject) => {
  if (project.localId === undefined) return
  editingLocalId.value = project.localId
  editForm.value = {
    name: project.name,
    gitUrl: project.gitUrl ?? '',
    description: project.description ?? '',
    platform: project.platform,
    tags: tagsToOptionTags(project.tags),
    localPath: project.localPath ?? '',
  }
  editDialogVisible.value = true
}

const handleEditSelectFolder = async () => {
  const res = await ipc.file.selectFolder({ defaultPath: editForm.value.localPath || '' })
  if (res.success && res.data) editForm.value.localPath = res.data
}

const handleEditSave = async () => {
  if (!editingLocalId.value || !editForm.value.name) return
  editLoading.value = true
  try {
    const res = await ipc.distribute.updateLocalProject(editingLocalId.value, {
      name: editForm.value.name,
      gitUrl: editForm.value.gitUrl,
      description: editForm.value.description,
      platform: editForm.value.platform,
      tags: optionTagsToString(editForm.value.tags),
      localPath: editForm.value.localPath || undefined,
    })
    if (res.success && res.data) {
      localProjects.value = res.data
      editDialogVisible.value = false
    }
  } catch (e) {
    console.error('更新工程失败', e)
  } finally {
    editLoading.value = false
  }
}

// ==================== 操作：打开文件夹 ====================

const handleOpenFolder = async (localPath: string) => {
  await ipc.file.openFolder(localPath)
}

// ==================== 添加本地工程对话框 ====================

/** step: 0 = 选择目录, 1 = 填写信息 */
const addDialogVisible = ref(false)
const addStep = ref<0 | 1>(0)
const addResolving = ref(false)
const addLoading = ref(false)
const addDragOver = ref(false)
const addFormTags = ref<OptionTag[]>([])   // TagInput 绑定，提交时转字符串

const addForm = ref<AddLocalProjectParams>({
  name: '',
  gitUrl: '',
  description: '',
  platform: 0,
  tags: '',
  localPath: '',
})

const openAddDialog = () => {
  addStep.value = 0
  addDragOver.value = false
  addFormTags.value = []
  addForm.value = { name: '', gitUrl: '', description: '', platform: 0, tags: '', localPath: '' }
  addDialogVisible.value = true
}

/** 解析路径并跳到 step1 */
const resolveAndStep = async (folderPath: string) => {
  addResolving.value = true
  try {
    const res = await ipc.file.resolveProjectMeta(folderPath)
    const meta = res.success && res.data
      ? res.data
      : { name: folderPath.split('/').pop() ?? '', gitUrl: '', hasGit: false }
    addFormTags.value = []
    addForm.value = {
      name: meta.name,
      gitUrl: meta.gitUrl,
      description: '',
      platform: 0,
      tags: '',
      localPath: folderPath,
    }
    addStep.value = 1
  } catch (e) {
    console.error('解析工程元信息失败', e)
    addFormTags.value = []
    addForm.value = {
      name: folderPath.split('/').pop() ?? '',
      gitUrl: '',
      description: '',
      platform: 0,
      tags: '',
      localPath: folderPath,
    }
    addStep.value = 1
  } finally {
    addResolving.value = false
  }
}

/** 点击「选择文件夹」按钮 */
const handleAddSelectFolder = async () => {
  const res = await ipc.file.selectFolder({ defaultPath: '' })
  if (res.success && res.data) {
    await resolveAndStep(res.data)
  }
}

/** 拖拽放下 */
const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  addDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const filePath = window.api.getPathForFile(files[0])
    if (filePath) await resolveAndStep(filePath)
  }
}

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  addDragOver.value = true
}

const handleDragLeave = () => {
  addDragOver.value = false
}

/** 提交添加 */
const handleAddProject = async () => {
  if (!addForm.value.name) return
  addLoading.value = true
  try {
    const res = await ipc.distribute.addLocalProject({
      ...addForm.value,
      tags: optionTagsToString(addFormTags.value),
    })
    if (res.success && res.data) {
      localProjects.value = [res.data as LocalDistProject, ...localProjects.value]
      addDialogVisible.value = false
    }
  } catch (e) {
    console.error('添加工程失败', e)
  } finally {
    addLoading.value = false
  }
}

// ==================== 工具函数 ====================

const getPlatformIcon = (platform: number) => {
  switch (platform) {
    case 3: return 'pi pi-desktop'
    case 4: return 'pi pi-mobile'
    case 6: return 'pi pi-code'
    case 14: return 'pi pi-gamepad'
    default: return 'pi pi-box'
  }
}

const truncatePath = (p: string, len = 38) =>
  p && p.length > len ? '...' + p.slice(-(len - 3)) : p

onMounted(loadAll)

// ==================== Agent 任务执行 ====================

const AGENT_OPTIONS: { label: string; value: AgentType }[] = [
  { label: 'Claude Code', value: 'claude-code' },
]

const agentDialogVisible = ref(false)
const agentProject = ref<MergedProject | null>(null)
const agentType = ref<AgentType>('claude-code')
const agentTask = ref('')
const agentRunning = ref(false)
const agentTaskId = ref<string | null>(null)
const agentLogs = ref<string>('')
const agentLogEl = ref<HTMLElement | null>(null)

const openAgentDialog = (project: MergedProject) => {
  agentProject.value = project
  agentType.value = 'claude-code'
  agentTask.value = ''
  agentLogs.value = ''
  agentRunning.value = false
  agentTaskId.value = null
  agentDialogVisible.value = true
}

const handleExecuteTask = async () => {
  if (!agentProject.value?.localPath || !agentTask.value.trim()) return
  agentLogs.value = ''
  agentRunning.value = true

  const res = await ipc.aigent.executeTask({
    projectPath: agentProject.value.localPath,
    taskContent: agentTask.value.trim(),
    agentType: agentType.value
  })

  if (res.success && res.data?.taskId) {
    agentTaskId.value = res.data.taskId
  } else {
    agentRunning.value = false
    agentLogs.value = `[错误] ${res.msg || '启动任务失败'}`
  }
}

const handleStopTask = async () => {
  if (!agentTaskId.value) return
  await ipc.aigent.stopTask({ taskId: agentTaskId.value })
}

const scrollLogsToBottom = () => {
  nextTick(() => {
    if (agentLogEl.value) {
      agentLogEl.value.scrollTop = agentLogEl.value.scrollHeight
    }
  })
}

// 监听主进程推送的流式输出事件
const onAgentOutput = (_: unknown, payload: AgentOutputPayload) => {
  if (payload.taskId !== agentTaskId.value) return
  agentLogs.value += payload.content
  scrollLogsToBottom()
}

const onAgentDone = (_: unknown, payload: AgentDonePayload) => {
  if (payload.taskId !== agentTaskId.value) return
  agentRunning.value = false
  agentLogs.value += `\n[完成] 退出码: ${payload.exitCode ?? 'null'}`
  scrollLogsToBottom()
}

const onAgentError = (_: unknown, payload: AgentErrorPayload) => {
  if (payload.taskId !== agentTaskId.value) return
  agentRunning.value = false
  agentLogs.value += `\n[错误] ${payload.message}`
  scrollLogsToBottom()
}

onMounted(() => {
  window.electron.ipcRenderer.on('aigent:output', onAgentOutput)
  window.electron.ipcRenderer.on('aigent:done', onAgentDone)
  window.electron.ipcRenderer.on('aigent:error', onAgentError)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('aigent:output', onAgentOutput)
  window.electron.ipcRenderer.removeListener('aigent:done', onAgentDone)
  window.electron.ipcRenderer.removeListener('aigent:error', onAgentError)
})
</script>

<template>
  <div>
    <!-- 工具栏 -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-surface-500">
        共 {{ mergedProjects.length }} 个工程
      </span>
      <div class="flex gap-2">
        <Button
          label="添加本地工程"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          @click="openAddDialog"
        />
        <Button
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          v-tooltip="'刷新'"
          @click="loadAll"
        />
      </div>
    </div>

    <!-- 工程列表 -->
    <DataTable
      :value="mergedProjects"
      :loading="loading"
      striped-rows
      class="text-sm"
    >
      <Column header="工程名" style="min-width: 160px">
        <template #body="{ data }">
          <div class="flex items-center gap-2 flex-wrap">
            <i :class="getPlatformIcon(data.platform)" class="text-surface-400" />
            <span class="font-medium">{{ data.name }}</span>
            <Tag v-if="data._localOnly && !data.uploadedAt" severity="warn" value="仅本地" class="text-xs" />
            <Tag v-else-if="data._localOnly && data.uploadedAt" severity="info" value="已上报" class="text-xs" />
            <Tag v-else-if="data.syncedAt && data.localPath" severity="success" value="已关联" class="text-xs" />
            <Tag v-else severity="secondary" value="未关联" class="text-xs" />
          </div>
        </template>
      </Column>

      <Column header="平台" style="width: 110px">
        <template #body="{ data }">
          <span class="text-xs text-surface-500">
            {{ PLATFORM_OPTIONS.find(p => p.code === data.platform)?.label ?? '其他' }}
          </span>
        </template>
      </Column>

      <Column field="gitUrl" header="Git 地址" style="min-width: 180px">
        <template #body="{ data }">
          <span class="font-mono text-xs text-surface-500">{{ data.gitUrl || '-' }}</span>
        </template>
      </Column>

      <Column header="本地路径" style="min-width: 200px">
        <template #body="{ data }">
          <div v-if="data.localPath" class="flex items-center gap-1">
            <span
              class="font-mono text-xs text-primary cursor-pointer hover:underline"
              v-tooltip="data.localPath"
              @click="handleOpenFolder(data.localPath)"
            >
              {{ truncatePath(data.localPath) }}
            </span>
          </div>
          <span v-else class="text-surface-400 text-xs">未设置</span>
        </template>
      </Column>

      <Column header="操作" style="width: 180px">
        <template #body="{ data }">
          <div class="flex gap-1 flex-wrap items-center">
            <Button
              v-if="!data._localOnly && !data.localPath"
              label="关联"
              icon="pi pi-link"
              size="small"
              severity="info"
              :loading="actioningId === data.localId"
              @click="handleAssociate(data)"
            />
            <Button
              v-if="data._localOnly && !data.uploadedAt"
              label="上传"
              icon="pi pi-upload"
              size="small"
              severity="success"
              :disabled="!data.gitUrl"
              :loading="actioningId === data.localId"
              v-tooltip="!data.gitUrl ? '需要配置 Git 地址才能上传到服务端' : undefined"
              @click="handleUpload(data)"
            />
            <!-- 执行 Agent 任务 -->
            <Button
              v-if="data.localPath"
              icon="pi pi-play"
              size="small" text rounded severity="primary"
              v-tooltip="'执行 Agent 任务'"
              @click="openAgentDialog(data)"
            />
            <!-- 编辑 -->
            <Button
              v-if="data.localId !== undefined"
              icon="pi pi-pencil"
              size="small" text rounded severity="secondary"
              v-tooltip="'编辑'"
              @click="openEditDialog(data)"
            />
            <Button
              v-if="data.localId !== undefined"
              icon="pi pi-trash"
              size="small" text rounded severity="danger"
              v-tooltip="'移除本地记录'"
              :loading="actioningId === data.localId"
              @click="handleRemove(data)"
            />
          </div>
        </template>
      </Column>

      <template #empty>
        <div class="text-center py-6 text-surface-400">
          暂无工程，请添加本地工程或连接服务端后刷新
        </div>
      </template>
    </DataTable>

    <!-- 添加本地工程对话框 -->
    <Dialog
      v-model:visible="addDialogVisible"
      :header="addStep === 0 ? '选择工程目录' : '添加本地工程'"
      :style="{ width: addStep === 0 ? '420px' : '520px' }"
      :modal="addStep !== 0"
    >
      <!-- ===== Step 0：拖拽 / 点击选目录 ===== -->
      <div
        v-if="addStep === 0"
        class="flex flex-col gap-4 py-2"
        @drop.prevent="handleDrop"
        @dragover.prevent="handleDragOver"
        @dragleave="handleDragLeave"
      >
        <!-- 拖拽 + 点击区域 -->
        <div
          class="border-2 border-dashed rounded-lg p-10 w-full text-center select-none transition-colors cursor-pointer"
          :class="addDragOver
            ? 'border-primary bg-primary/5'
            : 'border-surface-300 hover:border-primary hover:bg-surface-50'"
          @click="handleAddSelectFolder"
        >
          <i
            class="pi pi-folder-open text-5xl mb-3 block"
            :class="addDragOver ? 'text-primary' : 'text-surface-400'"
          />
          <p class="text-sm text-surface-500">
            {{ addResolving ? '解析中...' : '点击或拖拽文件夹到这里' }}
          </p>
        </div>
      </div>

      <!-- ===== Step 1：表单 ===== -->
      <div v-else class="flex flex-col gap-4 pt-1">
        <!-- 路径只读 + 重选 -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">本地路径</label>
          <div class="flex gap-2 items-center">
            <span
              class="flex-1 font-mono text-xs text-surface-600 bg-surface-100 rounded px-3 py-2 truncate"
              v-tooltip="addForm.localPath"
            >
              {{ addForm.localPath || '未选择' }}
            </span>
            <Button
              icon="pi pi-folder-open"
              size="small"
              severity="secondary"
              v-tooltip="'重新选择'"
              @click="handleAddSelectFolder"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">
            工程名 <span class="text-red-400">*</span>
          </label>
          <InputText v-model="addForm.name" placeholder="我的工程" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">
            Git 地址
            <span v-if="!addForm.gitUrl" class="text-orange-400 text-xs font-normal ml-1">
              （无 Git 则不可上传到服务端）
            </span>
          </label>
          <InputText v-model="addForm.gitUrl" placeholder="https://github.com/..." />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">描述</label>
          <Textarea
            v-model="addForm.description"
            placeholder="工程简介..."
            :rows="3"
            auto-resize
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">平台</label>
          <Select
            v-model="addForm.platform"
            :options="PLATFORM_OPTIONS"
            option-label="label"
            option-value="code"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">标签</label>
          <TagInput v-model="addFormTags" placeholder="输入标签后按 Enter" />
        </div>
      </div>

      <template #footer>
        <!-- Step 0 footer：选择文件夹按钮 + 取消 -->
        <div v-if="addStep === 0" class="flex gap-2 justify-between w-full">
          <Button
            label="取消"
            severity="secondary"
            text
            @click="addDialogVisible = false"
          />
          <Button
            label="选择文件夹"
            icon="pi pi-folder-open"
            :loading="addResolving"
            @click="handleAddSelectFolder"
          />
        </div>
        <!-- Step 1 footer -->
        <div v-else class="flex gap-2 justify-between w-full">
          <Button
            label="返回"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            @click="addStep = 0"
          />
          <Button
            label="添加"
            icon="pi pi-plus"
            :disabled="!addForm.name"
            :loading="addLoading"
            @click="handleAddProject"
          />
        </div>
      </template>
    </Dialog>

    <!-- 编辑本地工程对话框 -->
    <Dialog
      v-model:visible="editDialogVisible"
      header="编辑工程"
      :style="{ width: '520px' }"
      modal
    >
      <div class="flex flex-col gap-4 pt-1">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">
            工程名 <span class="text-red-400">*</span>
          </label>
          <InputText v-model="editForm.name" placeholder="我的工程" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">
            Git 地址
            <span v-if="!editForm.gitUrl" class="text-orange-400 text-xs font-normal ml-1">
              （无 Git 则不可上传到服务端）
            </span>
          </label>
          <InputText v-model="editForm.gitUrl" placeholder="https://github.com/..." />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">描述</label>
          <Textarea
            v-model="editForm.description"
            placeholder="工程简介..."
            :rows="3"
            auto-resize
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">平台</label>
          <Select
            v-model="editForm.platform"
            :options="PLATFORM_OPTIONS"
            option-label="label"
            option-value="code"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">标签</label>
          <TagInput v-model="editForm.tags" placeholder="输入标签后按 Enter" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-surface-700">本地路径</label>
          <div class="flex gap-2 items-center">
            <span
              class="flex-1 font-mono text-xs text-surface-600 bg-surface-100 rounded px-3 py-2 truncate"
              v-tooltip="editForm.localPath"
            >
              {{ editForm.localPath || '未设置' }}
            </span>
            <Button
              icon="pi pi-folder-open"
              size="small"
              severity="secondary"
              v-tooltip="'选择路径'"
              @click="handleEditSelectFolder"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <Button label="取消" severity="secondary" text @click="editDialogVisible = false" />
          <Button
            label="保存"
            icon="pi pi-check"
            :disabled="!editForm.name"
            :loading="editLoading"
            @click="handleEditSave"
          />
        </div>
      </template>
    </Dialog>

  </div>

  <!-- Agent 任务执行对话框 -->
  <Dialog
    v-model:visible="agentDialogVisible"
    :header="`执行 Agent 任务 — ${agentProject?.name ?? ''}`"
    :style="{ width: '600px' }"
    modal
    :closable="!agentRunning"
  >
    <div class="flex flex-col gap-4 pt-1">
      <!-- Agent 类型选择 -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-700">Agent 类型</label>
        <Select
          v-model="agentType"
          :options="AGENT_OPTIONS"
          option-label="label"
          option-value="value"
          :disabled="agentRunning"
        />
      </div>

      <!-- 任务描述 -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-700">
          任务描述 <span class="text-red-400">*</span>
        </label>
        <Textarea
          v-model="agentTask"
          placeholder="描述你希望 Agent 完成的任务..."
          :rows="4"
          auto-resize
          :disabled="agentRunning"
        />
      </div>

      <!-- 实时日志 -->
      <div v-if="agentLogs || agentRunning" class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-700">执行日志</label>
        <div
          ref="agentLogEl"
          class="bg-surface-900 text-green-400 font-mono text-xs rounded p-3 overflow-y-auto whitespace-pre-wrap"
          style="max-height: 280px; min-height: 80px"
        >
          <span v-if="!agentLogs" class="text-surface-500">等待输出...</span>
          <span v-else>{{ agentLogs }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2 justify-between w-full">
        <!-- 左：中断按钮（执行中才显示） -->
        <Button
          v-if="agentRunning"
          label="中断"
          icon="pi pi-stop"
          severity="danger"
          @click="handleStopTask"
        />
        <span v-else />

        <!-- 右：取消 / 执行 -->
        <div class="flex gap-2">
          <Button
            label="关闭"
            severity="secondary"
            text
            :disabled="agentRunning"
            @click="agentDialogVisible = false"
          />
          <Button
            label="执行"
            icon="pi pi-play"
            :disabled="!agentTask.trim() || agentRunning"
            :loading="agentRunning"
            @click="handleExecuteTask"
          />
        </div>
      </div>
    </template>
  </Dialog>

</template>
