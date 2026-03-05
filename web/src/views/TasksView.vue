<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/modules'
import CreateTaskDialog from '../components/CreateTaskDialog.vue'
import { formatDateTime } from '../utils/time'

// ==================== 列表 ====================
const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<any[]>([])
const showCreateDialog = ref(false)

const projectOptions = ref<any[]>([])
const machineOptions = ref<any[]>([])

// 过滤条件
const filterTitle = ref('')
const filterStatus = ref('')
const filterDateRange = ref<[string, string] | null>(null)

const STATUS_OPTIONS = [
  { label: '待处理',  value: 'pending' },
  { label: '已分发',  value: 'distributed' },
  { label: '执行中',  value: 'running' },
  { label: '已完成',  value: 'completed' },
  { label: '失败',    value: 'failed' },
]

const STATUS_TAG_MAP: Record<string, { type: string; label: string }> = {
  pending:     { type: 'info',    label: '待处理' },
  distributed: { type: 'warning', label: '已分发' },
  running:     { type: '',        label: '执行中' },
  completed:   { type: 'success', label: '已完成' },
  failed:      { type: 'danger',  label: '失败' },
}

const machineMap = computed(() => {
  const map: Record<string, string> = {}
  for (const item of machineOptions.value) map[item.id] = item.name
  return map
})

async function loadData() {
  loading.value = true
  try {
    const { data } = await api.tasksPageList({
      page: page.value,
      pageSize: pageSize.value,
      title: filterTitle.value.trim() || undefined,
      status: filterStatus.value || undefined,
      startDate: filterDateRange.value?.[0] || undefined,
      endDate: filterDateRange.value?.[1] || undefined,
    })
    rows.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadData()
}

function handleReset() {
  filterTitle.value = ''
  filterStatus.value = ''
  filterDateRange.value = null
  page.value = 1
  loadData()
}

async function loadOptions() {
  try {
    const [projectRes, machineRes] = await Promise.all([
      api.projectsPageList({ page: 1, pageSize: 100 }),
      api.machinesPageList({ page: 1, pageSize: 100 }),
    ])
    projectOptions.value = projectRes.data.list || []
    machineOptions.value = machineRes.data.list || []
  } catch {
    ElMessage.error('加载工程或机器选项失败')
  }
}

// ==================== 重新下发 ====================
const redispatchingId = ref<number | null>(null)

async function handleRedispatch(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认重新下发任务「${row.title}」？将推送到任务配置的目标机器。`,
      '重新下发',
      { type: 'warning', confirmButtonText: '下发', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  redispatchingId.value = row.id
  try {
    const { data } = await api.redispatchTask(row.id)
    ElMessage.success(data?.message || '下发成功')
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '下发失败')
  } finally {
    redispatchingId.value = null
  }
}

// ==================== 编辑弹窗 ====================
const editDialogVisible = ref(false)
const editSaving = ref(false)
const editingRow = ref<any>(null)

const editForm = reactive({
  title: '',
  description: '',
  priority: 3,
  list: [{ projectId: null as number | null, machineId: null as number | null }],
})

function openEdit(row: any) {
  editingRow.value = row
  editForm.title = row.title || ''
  editForm.description = row.description || ''
  editForm.priority = row.priority ?? 3
  editForm.list = (row.taskItems?.length
    ? row.taskItems.map((i: any) => ({ projectId: i.projectId ?? null, machineId: i.machineId ?? null }))
    : [{ projectId: null, machineId: null }])
  editDialogVisible.value = true
}

function editAddItem() {
  editForm.list.push({ projectId: null, machineId: null })
}

function editRemoveItem(index: number) {
  if (editForm.list.length === 1) return
  editForm.list.splice(index, 1)
}

async function handleEditSave() {
  if (!editForm.title.trim()) {
    ElMessage.error('请输入任务名称')
    return
  }
  if (editForm.list.some((item) => !item.projectId)) {
    ElMessage.error('请为每一行选择工程')
    return
  }

  editSaving.value = true
  try {
    await api.updateTask({
      id: editingRow.value.id,
      title: editForm.title,
      description: editForm.description,
      priority: editForm.priority,
      list: editForm.list.map((item) => ({
        projectId: item.projectId as number,
        machineId: item.machineId ?? undefined,
      })),
    })
    ElMessage.success('任务已更新')
    editDialogVisible.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '更新失败')
  } finally {
    editSaving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadData(), loadOptions()])
})
</script>

<template>
  <el-card>
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span>任务列表</span>
        <div>
          <el-button @click="loadData">刷新</el-button>
          <el-button type="primary" @click="showCreateDialog = true">创建任务</el-button>
        </div>
      </div>
    </template>

    <!-- 过滤栏 -->
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; align-items: center">
      <el-input
        v-model="filterTitle"
        placeholder="任务名称"
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
      />
      <el-select v-model="filterStatus" placeholder="任务状态" clearable style="width: 140px">
        <el-option v-for="opt in STATUS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
      <el-date-picker
        v-model="filterDateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 260px"
      />
      <el-button type="primary" @click="handleSearch">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="title" label="任务名称" min-width="180" />
      <el-table-column prop="description" label="任务描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="priority" label="优先级" width="80" />
      <el-table-column label="状态" width="160">
        <template #default="scope">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
            <el-tag :type="STATUS_TAG_MAP[scope.row.status]?.type as any" size="small">
              {{ STATUS_TAG_MAP[scope.row.status]?.label || scope.row.status }}
            </el-tag>
            <el-tag
              v-if="scope.row.isCaptured"
              type="success"
              size="small"
              effect="plain"
            >
              已捕捉
            </el-tag>
            <el-tag
              v-else-if="['pending', 'distributed'].includes(scope.row.status)"
              type="warning"
              size="small"
              effect="plain"
            >
              未捕捉
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="分配机器" min-width="140">
        <template #default="scope">
          {{ machineMap[scope.row.assignedMachineId] || scope.row.assignedMachineId || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="scope">{{ formatDateTime(scope.row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="scope">
          <el-button size="small" @click="openEdit(scope.row)">编辑</el-button>
          <el-button
            size="small"
            type="primary"
            :loading="redispatchingId === scope.row.id"
            @click="handleRedispatch(scope.row)"
          >
            下发
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top: 16px; display: flex; justify-content: flex-end">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-sizes="[10, 20, 50]"
        @current-change="loadData"
        @size-change="loadData"
      />
    </div>
  </el-card>

  <!-- 创建任务弹窗 -->
  <CreateTaskDialog
    v-model="showCreateDialog"
    :project-options="projectOptions"
    :machine-options="machineOptions"
    @success="loadData"
  />

  <!-- 编辑任务弹窗 -->
  <el-dialog v-model="editDialogVisible" title="编辑任务" width="760px">
    <el-form label-width="100px">
      <el-form-item label="任务名称" required>
        <el-input v-model="editForm.title" placeholder="请输入任务名称" />
      </el-form-item>
      <el-form-item label="任务描述">
        <el-input v-model="editForm.description" type="textarea" :rows="4" placeholder="请输入任务描述" />
      </el-form-item>
      <el-form-item label="优先级">
        <el-input-number v-model="editForm.priority" :min="1" :max="5" />
      </el-form-item>
      <el-form-item label="任务项" required>
        <div style="width: 100%">
          <div
            v-for="(item, index) in editForm.list"
            :key="index"
            style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 8px"
          >
            <el-select v-model="item.projectId" placeholder="选择工程" filterable>
              <el-option
                v-for="project in projectOptions"
                :key="project.id"
                :label="project.name"
                :value="project.id"
              />
            </el-select>
            <el-select v-model="item.machineId" placeholder="选择机器（可选）" clearable filterable>
              <el-option
                v-for="machine in machineOptions"
                :key="machine.id"
                :label="machine.name"
                :value="machine.id"
              />
            </el-select>
            <el-button type="danger" plain @click="editRemoveItem(index)">删除</el-button>
          </div>
          <el-button type="primary" plain @click="editAddItem">新增一行</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="editSaving" @click="handleEditSave">保存</el-button>
    </template>
  </el-dialog>
</template>
