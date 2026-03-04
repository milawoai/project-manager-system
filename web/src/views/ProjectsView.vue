<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/modules'
import { formatDateTime } from '../utils/time'
import CreateProjectDialog from '../components/CreateProjectDialog.vue'
import { getPlatformLabel } from '../constants/platform'

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<any[]>([])
const showCreateDialog = ref(false)

async function loadData() {
  loading.value = true
  try {
    const { data } = await api.projectsPageList({ page: page.value, pageSize: pageSize.value })
    rows.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <el-card>
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span>工程列表</span>
        <div>
          <el-button @click="loadData">刷新</el-button>
          <el-button type="primary" @click="showCreateDialog = true">新建工程</el-button>
        </div>
      </div>
    </template>

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="name" label="工程名称" min-width="220" />
      <el-table-column prop="gitUrl" label="仓库地址" min-width="240" show-overflow-tooltip />
      <el-table-column label="平台" width="120">
        <template #default="scope">
          {{ getPlatformLabel(scope.row.platform) }}
        </template>
      </el-table-column>
      <el-table-column prop="tags" label="标签" min-width="200" show-overflow-tooltip />
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

  <CreateProjectDialog v-model="showCreateDialog" @success="loadData" />
</template>
