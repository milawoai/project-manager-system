<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api/modules'

interface Option {
  id: string
  name: string
}

const props = defineProps<{
  modelValue: boolean
  projectOptions: Option[]
  machineOptions: Option[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  success: []
}>()

const saving = ref(false)

const form = reactive({
  title: '',
  description: '',
  priority: 3,
  list: [{ projectId: 0, machineId: 0 }],
})

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      form.title = ''
      form.description = ''
      form.priority = 3
      form.list = [{ projectId: 0, machineId: 0 }]
    }
  },
)

function addItem() {
  form.list.push({ projectId: 0, machineId: 0 })
}

function removeItem(index: number) {
  if (form.list.length === 1) return
  form.list.splice(index, 1)
}

async function submit() {
  if (!form.title.trim()) {
    ElMessage.error('请输入任务名称')
    return
  }

  if (form.list.some((item) => !item.projectId || item.projectId === 0)) {
    ElMessage.error('请为每一行选择工程')
    return
  }

  saving.value = true
  try {
    await api.createTask({
      title: form.title,
      description: form.description,
      priority: form.priority,
      list: form.list.map((item) => ({
        projectId: item.projectId,
        machineId: item.machineId || undefined,  // 0 视为未选择
      })),
    })

    ElMessage.success('任务创建成功')
    emit('update:modelValue', false)
    emit('success')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="创建任务"
    width="760px"
    @close="emit('update:modelValue', false)"
  >
    <el-form label-width="100px">
      <el-form-item label="任务名称" required>
        <el-input v-model="form.title" placeholder="请输入任务名称" />
      </el-form-item>
      <el-form-item label="任务描述">
        <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入任务描述" />
      </el-form-item>
      <el-form-item label="优先级">
        <el-input-number v-model="form.priority" :min="1" :max="5" />
      </el-form-item>

      <el-form-item label="任务项" required>
        <div style="width: 100%">
          <div
            v-for="(item, index) in form.list"
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
            <el-button type="danger" plain @click="removeItem(index)">删除</el-button>
          </div>
          <el-button type="primary" plain @click="addItem">新增一行</el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>
