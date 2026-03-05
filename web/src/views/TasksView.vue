<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api/modules'
import CreateTaskDialog from '../components/CreateTaskDialog.vue'
import { formatDateTime } from '../utils/time'

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
  { label: '待处理', value: 'pending' },
  { label: '已分发', value: 'distributed' },
  { label: '执行中', value: 'running' },
  { label: '已完成', value: 'completed' },
  { label: '失败', value: 'failed' },
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
  for (const item of machineOptions.value) {
    map[item.id] = item.name
  }
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
      <el-select
        v-model="filterStatus"
        placeholder="任务状态"
        clearable
        style="width: 140px"
      >
        <el-option
          v-for="opt in STATUS_OPTIONS"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
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
      <el-table-column prop="description" label="任务描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="priority" label="优先级" width="90" />
      <el-table-column label="状态" width="110">
        <template #default="scope">
          <el-tag
            :type="STATUS_TAG_MAP[scope.row.status]?.type as any"
            size="small"
          >
            {{ STATUS_TAG_MAP[scope.row.status]?.label || scope.row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="分配机器" min-width="160">
        <template #default="scope">
          {{ machineMap[scope.row.assignedMachineId] || scope.row.assignedMachineId || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="180">
        <template #default="scope">
          {{ formatDateTime(scope.row.createdAt) }}
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

  <CreateTaskDialog
    v-model="showCreateDialog"
    :project-options="projectOptions"
    :machine-options="machineOptions"
    @success="loadData"
  />
</template>
