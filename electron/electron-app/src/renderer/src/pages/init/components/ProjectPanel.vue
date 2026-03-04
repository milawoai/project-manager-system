<script setup lang="ts">
import CustomFormDialog from '@renderer/components/CustomFormDialog.vue'
import type { FormConfig } from '@shared/types/render'
import { ref } from 'vue'

interface ComponentDemo {
  name: string
  description: string
  dialogTitle: string
  config: FormConfig
}

// 可用组件列表 - 每个组件有不同的演示配置
const availableComponents: ComponentDemo[] = [
  {
    name: 'CustomForm',
    description: '动态表单组件，支持多种表单项类型',
    dialogTitle: '试用 CustomForm',
    config: {
      fields: [
        {
          key: 'username',
          renderLabel: '用户名',
          renderType: 'input',
          renderParams: { placeholder: '请输入用户名' },
          value: '',
          rules: [{ required: true, message: '用户名是必填项' }]
        },
        {
          key: 'email',
          renderLabel: '邮箱',
          renderType: 'input',
          renderParams: { placeholder: '请输入邮箱' },
          value: ''
        },
        {
          key: 'gender',
          renderLabel: '性别',
          renderType: 'select',
          options: [
            { label: '男', value: 'male' },
            { label: '女', value: 'female' },
            { label: '保密', value: 'unknown' }
          ],
          value: ''
        },
        {
          key: 'bio',
          renderLabel: '简介',
          renderType: 'textarea',
          renderParams: { placeholder: '请输入个人简介', rows: 3 },
          value: ''
        },
        {
          key: 'subscribe',
          renderLabel: '订阅新闻',
          renderType: 'switch',
          value: false
        }
      ],
      layout: 'vertical',
      labelWidth: '100px'
    }
  },
  {
    name: 'CustomSelect',
    description: '自定义选择器，支持搜索和多选',
    dialogTitle: '试用 CustomSelect',
    config: {
      fields: [
        {
          key: 'country',
          renderLabel: '选择国家',
          renderType: 'customSelect',
          renderParams: {
            placeholder: '请搜索并选择国家',
            multiple: false,
            options: ['中国', '美国', '日本', '英国', '法国', '德国']
          },
          value: ''
        },
        {
          key: 'colors',
          renderLabel: '选择颜色',
          renderType: 'customSelect',
          renderParams: {
            placeholder: '请选择多个颜色',
            multiple: true,
            options: ['红色', '绿色', '蓝色', '黄色']
          },
          value: []
        }
      ],
      layout: 'vertical',
      labelWidth: '100px'
    }
  },
  {
    name: 'TagInput',
    description: '标签输入组件，支持创建和管理标签',
    dialogTitle: '试用 TagInput',
    config: {
      fields: [
        {
          key: 'tags',
          renderLabel: '标签',
          renderType: 'tagInput',
          renderParams: {
            placeholder: '输入标签后按回车',
            availableTags: [
              { name: 'Vue' },
              { name: 'React' },
              { name: 'Angular' },
              { name: 'TypeScript' },
              { name: 'Node.js' }
            ]
          },
          value: [{ name: 'Vue' }, { name: 'TypeScript' }]
        },
        {
          key: 'skills',
          renderLabel: '技能',
          renderType: 'tagInput',
          renderParams: {
            placeholder: '输入技能后按回车',
            availableTags: [
              { name: '前端' },
              { name: '后端' },
              { name: '全栈' },
              { name: 'DevOps' },
              { name: 'AI' }
            ]
          },
          value: [{ name: '前端' }]
        }
      ],
      layout: 'vertical',
      labelWidth: '100px'
    }
  },
  {
    name: 'SelectFolderLine',
    description: '文件夹选择组件，带路径显示',
    dialogTitle: '试用 SelectFolderLine',
    config: {
      fields: [
        {
          key: 'projectPath',
          renderLabel: '项目路径',
          renderType: 'folderPath',
          value: ''
        },
        {
          key: 'outputPath',
          renderLabel: '输出路径',
          renderType: 'folderPath',
          value: ''
        }
      ],
      layout: 'vertical',
      labelWidth: '100px'
    }
  },
  {
    name: 'GlobalLoading',
    description: '全局加载指示器',
    dialogTitle: '试用 GlobalLoading',
    config: {
      fields: [
        {
          key: 'loadingText',
          renderLabel: '加载文本',
          renderType: 'input',
          renderParams: { placeholder: '请输入加载提示文字' },
          value: '加载中...'
        },
        {
          key: 'delay',
          renderLabel: '模拟延迟(秒)',
          renderType: 'number',
          renderParams: { min: 1, max: 10 },
          value: 2
        }
      ],
      layout: 'vertical',
      labelWidth: '120px'
    }
  },
  {
    name: 'CustomToast',
    description: '自定义提示消息组件',
    dialogTitle: '试用 CustomToast',
    config: {
      fields: [
        {
          key: 'message',
          renderLabel: '消息内容',
          renderType: 'input',
          renderParams: { placeholder: '请输入提示消息' },
          value: '操作成功！'
        },
        {
          key: 'severity',
          renderLabel: '消息类型',
          renderType: 'select',
          options: [
            { label: '成功', value: 'success' },
            { label: '信息', value: 'info' },
            { label: '警告', value: 'warn' },
            { label: '错误', value: 'error' }
          ],
          value: 'success'
        }
      ],
      layout: 'vertical',
      labelWidth: '100px'
    }
  },
  {
    name: 'LanguageSwitcher',
    description: '语言切换组件',
    dialogTitle: '试用 LanguageSwitcher',
    config: {
      fields: [
        {
          key: 'currentLang',
          renderLabel: '当前语言',
          renderType: 'select',
          options: [
            { label: '简体中文', value: 'zh-CN' },
            { label: 'English', value: 'en-US' },
            { label: '日本語', value: 'ja-JP' }
          ],
          value: 'zh-CN'
        },
        {
          key: 'showFlag',
          renderLabel: '显示国旗',
          renderType: 'switch',
          value: true
        }
      ],
      layout: 'vertical',
      labelWidth: '100px'
    }
  }
]

// 弹窗显示状态
const dialogVisible = ref(false)
const dialogTitle = ref('')
const currentConfig = ref<FormConfig>({ fields: [] })

// 表单数据
const formData = ref<Record<string, any>>({})

// 打开弹窗
const openDialog = (component: ComponentDemo) => {
  dialogTitle.value = component.dialogTitle
  currentConfig.value = component.config
  dialogVisible.value = true
}

// 处理表单提交
const handleSubmit = (data: Record<string, any>) => {
  console.log('表单提交:', data)
  formData.value = data
}

// 处理表单取消
const handleCancel = () => {
  console.log('表单取消')
}
</script>

<template>
  <div class="project-panel">
    <div class="panel-header">
      <h2>可用组件</h2>
      <p class="text-muted">点击"试用"按钮打开组件演示对话框</p>
    </div>

    <div class="component-grid">
      <div v-for="component in availableComponents" :key="component.name" class="component-card">
        <div class="card-header">
          <h3>{{ component.name }}</h3>
          <span class="badge">Vue Component</span>
        </div>
        <p class="card-description">{{ component.description }}</p>
        <div class="card-actions">
          <Button label="试用" icon="pi pi-play" size="small" @click="openDialog(component)" />
        </div>
      </div>
    </div>

    <!-- 试用弹窗 -->
    <CustomFormDialog
      v-model:visible="dialogVisible"
      :title="dialogTitle"
      :config="currentConfig"
      :model-value="formData"
      width="600px"
      @submit="handleSubmit"
      @cancel="handleCancel"
    />
  </div>
</template>

<style scoped lang="less">
.project-panel {
  padding: 16px;

  .panel-header {
    margin-bottom: 24px;

    h2 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--text-color);
    }

    .text-muted {
      margin: 0;
      color: var(--text-color-secondary);
      font-size: 14px;
    }
  }

  .component-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .component-card {
    padding: 16px;
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    transition: all 0.2s ease;

    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      border-color: var(--primary-color);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-color);
      }

      .badge {
        padding: 2px 8px;
        font-size: 12px;
        color: var(--primary-color);
        background: var(--primary-color);
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
      }
    }

    .card-description {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: var(--text-color-secondary);
      line-height: 1.5;
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
    }
  }
}
</style>
