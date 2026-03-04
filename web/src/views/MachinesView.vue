<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/modules'
import { formatDateTime } from '../utils/time'

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<any[]>([])

async function loadData() {
  loading.value = true
  try {
    const { data } = await api.machinesPageList({ page: page.value, pageSize: pageSize.value })
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
        <span>工作机器列表</span>
        <el-button @click="loadData">刷新</el-button>
      </div>
    </template>

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="name" label="机器名称" min-width="180" />
      <el-table-column prop="platform" label="平台" width="120" />
      <el-table-column label="状态" width="120">
        <template #default="scope">
          <el-tag :type="scope.row.status === 'online' ? 'success' : scope.row.status === 'busy' ? 'warning' : 'info'">
            {{ scope.row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后心跳" min-width="180">
        <template #default="scope">
          {{ formatDateTime(scope.row.lastHeartbeat) }}
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
</template>
