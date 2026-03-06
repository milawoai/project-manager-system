<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import type { ConnectionStatusInfo, WsTaskAssignedPayload } from '@shared/types/distribute'
import { WsConnectionStatus } from '@shared/types/distribute'
import TaskListPanel from './components/TaskListPanel.vue'
import ProjectPanel from './components/ProjectPanel.vue'
import MachinePanel from './components/MachinePanel.vue'

const ipc = inject<IpcProxy>('ipc')!
const { t } = useI18n()

const activeTab = ref('tasks')
const connectionStatus = ref<ConnectionStatusInfo>({
  status: WsConnectionStatus.DISCONNECTED
})

// 本地服务器状态
const localServerEnabled = ref(false)
const localServerLoading = ref(false)
const localServerPort = 10010

const checkLocalServerStatus = async () => {
  try {
    const res = await ipc.server.checkServerStatus(localServerPort)
    localServerEnabled.value = res.isAlive
  } catch (error) {
    console.error('检查本地服务器状态失败', error)
  }
}

const toggleLocalServer = async () => {
  localServerLoading.value = true
  const targetState = localServerEnabled.value
  try {
    if (targetState) {
      // 开启服务器
      await ipc.server.startServer(localServerPort)
    } else {
      // 关闭服务器
      await ipc.server.stopServer()
    }
    // 操作成功，状态以 v-model 当前值为准，无需重新心跳检查
  } catch (error) {
    console.error('操作本地服务器失败', error)
    localServerEnabled.value = !targetState // 发生错误时回滚状态
  } finally {
    localServerLoading.value = false
  }
}

const testLocalServer = async () => {
  try {
    console.log(`正在请求: http://localhost:${localServerPort}/common/hello`)
    const response = await fetch(`http://localhost:${localServerPort}/common/hello`, {
      method: 'POST'
    })
    const data = await response.json()
    if (data.success) {
      console.log('本地服务响应成功:', data)
      // 使用更温和的提示方式（如果项目中已安装相关组件可替换，这里先用 console）
      // 如果你希望看到明显反馈，可以暂时保留 alert 但加上延迟，
      // 或者在页面上显示一个小提示。
      // alert('本地服务响应成功: ' + data.msg) 
    } else {
      console.error('本地服务响应异常:', data)
    }
  } catch (error) {
    console.error('请求本地服务失败 (服务可能未启动):', error)
  }
}

// 连接对话框
const connectDialogVisible = ref(false)
const connectStep = ref(1) // 1: 填地址, 2: 注册, 3: 连接中
const serverUrl = ref('')
const connectLoading = ref(false)
const connectMessage = ref('')
const connectError = ref('')

// 防止 autoConnect 重入（disconnect 触发 DISCONNECTED 事件会再次触发 autoConnect）
let autoConnecting = false

// 注册表单
const registerForm = ref({
  name: '',
  platform: 'macos',
  hasOpenClaw: false
})
const openClawChecking = ref(false)
const platformOptions = [
  { label: 'macOS', value: 'macos' },
  { label: 'Windows', value: 'windows' },
  { label: 'Linux', value: 'linux' }
]

/** 获取连接状态 */
const refreshStatus = async () => {
  try {
    const res = await ipc.distribute.getConnectionStatus()
    if (res.success && res.data) {
      connectionStatus.value = res.data
    }
  } catch (e) {
    console.error('获取连接状态失败', e)
  }
}

/** 页面加载时自动尝试连接（有 serverUrl + apiKey 才执行） */
const autoConnect = async () => {
  if (autoConnecting) {
    console.log('[autoConnect] 防重入，已在连接中，跳过')
    return
  }
  autoConnecting = true
  console.log('[autoConnect] 开始')

  try {
    await refreshStatus()
    console.log('[autoConnect] 当前 WS 状态:', connectionStatus.value.status)

    if (isConnected()) {
      console.log('[autoConnect] 已连接，跳过')
      autoConnecting = false
      return
    }

    const configRes = await ipc.distribute.getSavedConfig()
    console.log('[autoConnect] getSavedConfig 结果:', configRes)

    if (!configRes.success || !configRes.data) {
      console.log('[autoConnect] 无法获取配置，终止')
      autoConnecting = false
      return
    }

    const { serverUrl: savedUrl, apiKey } = configRes.data
    console.log(`[autoConnect] serverUrl=${savedUrl} hasApiKey=${!!apiKey}`)

    if (!savedUrl) {
      console.log('[autoConnect] 无 serverUrl，终止')
      autoConnecting = false
      return
    }
    if (!apiKey) {
      console.log('[autoConnect] 无 apiKey（未注册），终止')
      autoConnecting = false
      return
    }

    serverUrl.value = savedUrl

    console.log(`[autoConnect] 测试连通性 → ${savedUrl}`)
    const testRes = await ipc.distribute.testConnection(savedUrl)
    console.log('[autoConnect] testConnection 结果:', testRes)

    if (!testRes.success || !testRes.data?.reachable) {
      console.log('[autoConnect] 服务端不可达，终止')
      autoConnecting = false
      return
    }

    console.log('[autoConnect] 服务端可达，开始建立 WebSocket 连接')
    const connectRes = await ipc.distribute.connectServer({ serverUrl: savedUrl })
    console.log('[autoConnect] connectServer 结果:', connectRes)

    if (!connectRes.success) {
      console.log('[autoConnect] connectServer 失败，释放锁')
      autoConnecting = false
    }
    // 成功时锁由 onConnectionChange(CONNECTED) 释放
  } catch (e) {
    console.error('[autoConnect] 异常:', e)
    autoConnecting = false
  }
}

/** 打开连接对话框，预填已保存的地址 */
const openConnectDialog = async () => {
  connectStep.value = 1
  connectMessage.value = ''
  connectError.value = ''
  connectLoading.value = false
  connectDialogVisible.value = true

  // 读取已保存的配置
  try {
    const res = await ipc.distribute.getSavedConfig()
    if (res.success && res.data) {
      if (res.data.serverUrl) serverUrl.value = res.data.serverUrl
    }
  } catch (error) {
    // 忽略
    console.log(error)
  }
}

/** Step 1: 测试连通性 → 判断是否需要注册 */
const handleTestConnection = async () => {
  if (!serverUrl.value) return
  console.log(`[handleTestConnection] 开始，url=${serverUrl.value}`)
  connectLoading.value = true
  connectError.value = ''
  connectMessage.value = ''

  try {
    const res = await ipc.distribute.testConnection(serverUrl.value)
    console.log('[handleTestConnection] testConnection 结果:', res)

    if (!res.success || !res.data?.reachable) {
      connectError.value = res.data?.message || '无法连接到服务端'
      console.log('[handleTestConnection] 服务端不可达，停在 Step 1')
      return
    }

    connectMessage.value = '服务端连接正常'

    const configRes = await ipc.distribute.getSavedConfig()
    const hasApiKey = !!(configRes.success && configRes.data?.apiKey)
    console.log(`[handleTestConnection] hasApiKey=${hasApiKey}`)

    if (hasApiKey) {
      console.log('[handleTestConnection] 已有 apiKey → 直接 doConnect')
      await doConnect()
    } else {
      console.log('[handleTestConnection] 无 apiKey → 进入 Step 2 注册')
      connectStep.value = 2
      connectMessage.value = ''
      // 进入注册步骤时自动检测 OpenClaw
      checkOpenClaw()
    }
  } catch (e: any) {
    console.error('[handleTestConnection] 异常:', e)
    connectError.value = e.message || '连接测试失败'
  } finally {
    connectLoading.value = false
  }
}

/** 检测本机是否安装了 OpenClaw（通过访问 http://127.0.0.1:18789/） */
const checkOpenClaw = async () => {
  openClawChecking.value = true
  try {
    const res = await fetch('http://127.0.0.1:18789/', { method: 'GET', signal: AbortSignal.timeout(3000) })
    registerForm.value.hasOpenClaw = res.ok
    console.log(`[checkOpenClaw] 检测结果: ${res.ok} (status=${res.status})`)
  } catch {
    registerForm.value.hasOpenClaw = false
    console.log('[checkOpenClaw] 检测结果: 不可达')
  } finally {
    openClawChecking.value = false
  }
}

/** Step 2: 注册本机 → 自动连接（WS 连接成功后由 onConnectionChange 关闭对话框） */
const handleRegister = async () => {
  if (!registerForm.value.name) return
  console.log('[handleRegister] 开始注册，参数:', JSON.stringify(registerForm.value))
  connectLoading.value = true
  connectError.value = ''

  try {
    const res = await ipc.distribute.registerMachine(registerForm.value)
    console.log('[handleRegister] registerMachine 结果:', res)

    if (!res.success) {
      console.log('[handleRegister] 注册失败:', res.msg)
      connectError.value = res.msg || '注册失败'
      return
    }
    // registerMachine 内部已自动触发 WS 连接，等 connection-change 事件
    console.log('[handleRegister] 注册成功，等待 WS 连接（connection-change 事件）')
    connectMessage.value = '注册成功，正在建立连接...'
    connectStep.value = 3
  } catch (e: any) {
    console.error('[handleRegister] 异常:', e)
    connectError.value = e.message || '注册失败'
  } finally {
    connectLoading.value = false
  }
}

/** 用已保存的 apiKey 直接连接 WebSocket（连接成功后由 onConnectionChange 关闭对话框） */
const doConnect = async () => {
  console.log(`[doConnect] 开始，serverUrl=${serverUrl.value}`)
  connectLoading.value = true
  connectStep.value = 3
  connectMessage.value = '正在建立连接...'

  try {
    const res = await ipc.distribute.connectServer({ serverUrl: serverUrl.value })
    console.log('[doConnect] connectServer IPC 结果:', res)

    if (!res.success) {
      console.log('[doConnect] connectServer 失败:', res.msg)
      connectError.value = res.msg || '连接失败'
      connectStep.value = 1
    } else {
      console.log('[doConnect] connectServer 调用成功，等待 WS 连接（connection-change 事件）')
      // WS 连接结果通过 connection-change 事件异步推送，在 onConnectionChange 里处理
    }
  } catch (e: any) {
    console.error('[doConnect] 异常:', e)
    connectError.value = e.message || '连接失败'
    connectStep.value = 1
  } finally {
    connectLoading.value = false
  }
}

/** 重置对话框状态 */
const resetConnectDialog = () => {
  connectStep.value = 1
  connectMessage.value = ''
  connectError.value = ''
  connectLoading.value = false
  registerForm.value = { name: '', platform: 'macos', hasOpenClaw: false }
}

/** 断开连接 */
const handleDisconnect = async () => {
  try {
    await ipc.distribute.disconnectServer()
    refreshStatus()
  } catch (e) {
    console.error('断开失败', e)
  }
}

/** store 中是否有已保存的 apiKey（用于控制重置按钮可用性） */
const savedApiKey = ref(false)
const checkSavedApiKey = async () => {
  const res = await ipc.distribute.getSavedConfig()
  savedApiKey.value = !!(res.success && res.data?.apiKey)
  console.log(`[checkSavedApiKey] apiKey 存在: ${savedApiKey.value}`)
}

/** 重置注册（清除 apiKey/machineId，下次连接走注册流程） */
const handleResetRegistration = async () => {
  try {
    await ipc.distribute.resetRegistration()
    savedApiKey.value = false
    refreshStatus()
  } catch (e) {
    console.error('重置注册失败', e)
  }
}

/** 监听主进程推送的连接状态变更 */
const onConnectionChange = (_event: any, status: string) => {
  console.log(`[onConnectionChange] 收到状态变更: ${status}，对话框是否打开: ${connectDialogVisible.value}`)
  connectionStatus.value = { ...connectionStatus.value, status: status as WsConnectionStatus }

  // WS 连接成功：释放锁 + 关闭对话框
  if (status === WsConnectionStatus.CONNECTED) {
    autoConnecting = false
    checkSavedApiKey()
    if (connectDialogVisible.value) {
      console.log('[onConnectionChange] WS 已连接，关闭对话框')
      connectDialogVisible.value = false
      resetConnectDialog()
    }
  }

  // 断线：释放锁（socket.io 内置重连机制会自动处理重连，无需手动 autoConnect）
  if (status === WsConnectionStatus.DISCONNECTED) {
    console.log('[onConnectionChange] WS 断线，释放 autoConnecting 锁（socket.io 自动重连）')
    autoConnecting = false
  }
}

/** 监听主进程推送的新任务 */
const onTaskReceived = (_event: any, _payload: WsTaskAssignedPayload) => {
  console.log(_event)
  console.log(_payload)
  activeTab.value = 'tasks'
}

onMounted(() => {
  window.electron.ipcRenderer.on('distribute:connection-change', onConnectionChange)
  window.electron.ipcRenderer.on('distribute:task-received', onTaskReceived)
  checkLocalServerStatus()
  checkSavedApiKey()
  autoConnect() // 有历史配置时静默自动连接
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('distribute:connection-change')
  window.electron.ipcRenderer.removeAllListeners('distribute:task-received')
})

const isConnected = () => connectionStatus.value.status === WsConnectionStatus.CONNECTED
const isConnecting = () =>
  connectionStatus.value.status === WsConnectionStatus.CONNECTING ||
  connectionStatus.value.status === WsConnectionStatus.RECONNECTING

const statusColor = () => {
  switch (connectionStatus.value.status) {
    case WsConnectionStatus.CONNECTED:
      return 'success'
    case WsConnectionStatus.CONNECTING:
    case WsConnectionStatus.RECONNECTING:
      return 'warn'
    default:
      return 'danger'
  }
}
const statusLabel = () => {
  switch (connectionStatus.value.status) {
    case WsConnectionStatus.CONNECTED:
      return t('distribute.status.connected')
    case WsConnectionStatus.CONNECTING:
      return t('distribute.status.connecting')
    case WsConnectionStatus.RECONNECTING:
      return t('distribute.status.reconnecting')
    default:
      return t('distribute.status.disconnected')
  }
}
</script>

<template>
  <div class="card w-full p-4">
    <!-- 顶部：连接状态 + 操作 -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <h2 class="text-xl font-semibold m-0">{{ t('distribute.title') }}</h2>
        <Tag :severity="statusColor()" :value="statusLabel()" />
        <span v-if="isConnected() && connectionStatus.machineId" class="text-sm text-surface-500">
          ID: {{ connectionStatus.machineId?.substring(0, 8) }}...
        </span>
      </div>
      <div class="flex gap-2 items-center">
        <!-- 本地服务器控制 -->
        <div class="flex items-center gap-2 mr-2 border-r pr-3 border-surface-200">
          <span class="text-xs font-medium text-surface-600">本地服务 (10010)</span>
          <ToggleSwitch
            v-model="localServerEnabled"
            :loading="localServerLoading"
            @change="toggleLocalServer"
          />
          <Button
            v-if="localServerEnabled"
            icon="pi pi-play"
            size="small"
            severity="success"
            text
            tooltip="测试本地服务"
            @click.stop="testLocalServer"
          />
        </div>

        <!-- 已连接：断开按钮 -->
        <Button
          v-if="isConnected()"
          :label="t('distribute.actions.disconnect')"
          icon="pi pi-times"
          size="small"
          severity="secondary"
          @click="handleDisconnect"
        />
        <!-- 连接中/重连中：不可操作，显示 loading -->
        <Button
          v-else-if="isConnecting()"
          :label="t('distribute.status.connecting')"
          icon="pi pi-spin pi-spinner"
          size="small"
          severity="secondary"
          disabled
        />
        <!-- 未连接：显示连接按钮 -->
        <Button
          v-else
          :label="t('distribute.actions.connect')"
          icon="pi pi-link"
          size="small"
          @click="openConnectDialog"
        />
        <!-- 刷新状态 -->
        <Button
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          v-tooltip="'刷新状态'"
          @click="autoConnect"
        />
        <!-- 重置注册：始终显示，有 apiKey 时可用 -->
        <Button
          icon="pi pi-user-minus"
          size="small"
          severity="danger"
          text
          v-tooltip="t('distribute.actions.resetRegistration')"
          :disabled="!savedApiKey"
          @click="handleResetRegistration"
        />
      </div>
    </div>

    <!-- 标签页 -->
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="tasks">{{ t('distribute.tabs.tasks') }}</Tab>
        <Tab value="projects">{{ t('distribute.tabs.projects') }}</Tab>
        <Tab value="machines">{{ t('distribute.tabs.machines') }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="tasks">
          <TaskListPanel :connected="isConnected()" />
        </TabPanel>
        <TabPanel value="projects">
          <ProjectPanel :connected="isConnected()" />
        </TabPanel>
        <TabPanel value="machines">
          <MachinePanel :connected="isConnected()" />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- 连接对话框（分步流程） -->
    <Dialog
      v-model:visible="connectDialogVisible"
      :header="t('distribute.dialogs.connect')"
      :style="{ width: '480px' }"
      modal
      @hide="resetConnectDialog"
    >
      <!-- 步骤指示器 -->
      <div class="flex items-center gap-2 mb-4 text-sm text-surface-500">
        <span :class="{ 'text-primary font-semibold': connectStep === 1 }"
          >1. {{ t('distribute.steps.connect') }}</span
        >
        <i class="pi pi-chevron-right text-xs" />
        <span :class="{ 'text-primary font-semibold': connectStep === 2 }"
          >2. {{ t('distribute.steps.register') }}</span
        >
        <i class="pi pi-chevron-right text-xs" />
        <span :class="{ 'text-primary font-semibold': connectStep === 3 }"
          >3. {{ t('distribute.steps.done') }}</span
        >
      </div>

      <!-- Step 1: 服务端地址 -->
      <div v-if="connectStep === 1" class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label for="serverUrl">{{ t('distribute.fields.serverUrl') }}</label>
          <InputText
            id="serverUrl"
            v-model="serverUrl"
            placeholder="http://192.168.1.100:3000"
            @keyup.enter="handleTestConnection"
          />
        </div>
      </div>

      <!-- Step 2: 注册表单 -->
      <div v-else-if="connectStep === 2" class="flex flex-col gap-4">
        <Message severity="info" :closable="false" class="text-sm">
          {{ t('distribute.steps.registerHint') }}
        </Message>
        <div class="flex flex-col gap-2">
          <label>{{ t('distribute.machine.name') }}</label>
          <InputText
            v-model="registerForm.name"
            :placeholder="t('distribute.machine.namePlaceholder')"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ t('distribute.machine.platform') }}</label>
          <Select
            v-model="registerForm.platform"
            :options="platformOptions"
            option-label="label"
            option-value="value"
          />
        </div>
        <div class="flex items-center gap-3 mt-1">
          <label>{{ t('distribute.machine.openClaw') }}</label>
          <Tag
            v-if="openClawChecking"
            severity="secondary"
            class="text-xs"
          >
            <i class="pi pi-spin pi-spinner mr-1" />{{ t('distribute.machine.openClawChecking') }}
          </Tag>
          <Tag
            v-else
            :severity="registerForm.hasOpenClaw ? 'success' : 'warn'"
            :value="registerForm.hasOpenClaw ? t('distribute.machine.openClawInstalled') : t('distribute.machine.openClawNotInstalled')"
            class="text-xs"
          />
          <Button
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            :loading="openClawChecking"
            v-tooltip="t('common.refresh')"
            @click="checkOpenClaw"
          />
        </div>
      </div>

      <!-- Step 3: 连接中 -->
      <div v-else class="flex flex-col items-center gap-3 py-4">
        <i class="pi pi-spin pi-spinner text-2xl text-primary" />
        <span>{{ connectMessage }}</span>
      </div>

      <!-- 反馈消息 -->
      <Message v-if="connectError" severity="error" :closable="false" class="mt-3 text-sm">
        {{ connectError }}
      </Message>
      <Message
        v-else-if="connectMessage && connectStep === 1"
        severity="success"
        :closable="false"
        class="mt-3 text-sm"
      >
        {{ connectMessage }}
      </Message>

      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          @click="connectDialogVisible = false"
        />
        <!-- Step 1 按钮 -->
        <Button
          v-if="connectStep === 1"
          :label="t('distribute.actions.connect')"
          icon="pi pi-link"
          :disabled="!serverUrl"
          :loading="connectLoading"
          @click="handleTestConnection"
        />
        <!-- Step 2 按钮 -->
        <Button
          v-else-if="connectStep === 2"
          :label="t('distribute.machine.register')"
          icon="pi pi-plus"
          :disabled="!registerForm.name"
          :loading="connectLoading"
          @click="handleRegister"
        />
      </template>
    </Dialog>
  </div>
</template>
