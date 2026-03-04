<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api/modules'
import { PLATFORM_OPTIONS } from '../constants/platform'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  success: []
}>()

const saving = ref(false)

const form = reactive({
  name: '',
  gitUrl: '',
  platform: undefined as number | undefined,
  tags: [] as string[],
})

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      form.name = ''
      form.gitUrl = ''
      form.platform = undefined
      form.tags = []
    }
  },
)

async function submit() {
  if (!form.name.trim()) {
    ElMessage.error('请输入工程名称')
    return
  }
  if (!form.gitUrl.trim()) {
    ElMessage.error('请填写仓库地址')
    return
  }
  if (form.platform === undefined) {
    ElMessage.error('请选择平台')
    return
  }

  saving.value = true
  try {
    await api.createProject({
      name: form.name.trim(),
      gitUrl: form.gitUrl.trim(),
      platform: form.platform,
      tags: form.tags.length > 0 ? form.tags.join(',') : undefined,
    })

    ElMessage.success('工程创建成功')
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
    title="新建工程"
    width="680px"
    @close="emit('update:modelValue', false)"
  >
    <el-form label-width="100px">
      <el-form-item label="工程名称" required>
        <el-input v-model="form.name" placeholder="请输入工程名称" />
      </el-form-item>
      <el-form-item label="仓库地址" required>
        <el-input v-model="form.gitUrl" placeholder="例如：https://github.com/org/repo.git" />
      </el-form-item>
      <el-form-item label="平台" required>
        <el-select v-model="form.platform" placeholder="请选择平台" style="width: 100%">
          <el-option
            v-for="option in PLATFORM_OPTIONS"
            :key="option.code"
            :label="option.label"
            :value="option.code"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="可选，输入后回车添加"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>

