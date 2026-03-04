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
    const { data } = await api.tasksPageList({ page: page.value, pageSize: pageSize.value })
    rows.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
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

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="title" label="任务名称" min-width="180" />
      <el-table-column prop="description" label="任务描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="priority" label="优先级" width="90" />
      <el-table-column prop="status" label="状态" width="130" />
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
