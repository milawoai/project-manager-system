export interface PlatformOption {
  code: number
  key: string
  label: string
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { code: 0, key: 'other', label: '其他' },
  { code: 1, key: 'frontend', label: '前端' },
  { code: 2, key: 'backend', label: '后端' },
  { code: 3, key: 'desktop', label: '桌面端' },
  { code: 4, key: 'mobile', label: '移动端' },
  { code: 5, key: 'fullstack', label: '全栈' },
  { code: 6, key: 'shell', label: 'Shell' },
  { code: 7, key: 'miniprogram', label: '小程序' },
  { code: 8, key: 'cli', label: 'CLI工具' },
  { code: 9, key: 'library', label: '库/SDK' },
  { code: 10, key: 'extension', label: '浏览器插件' },
  { code: 11, key: 'microservice', label: '微服务' },
  { code: 12, key: 'datascience', label: '数据科学/AI' },
  { code: 13, key: 'devops', label: 'DevOps/基础设施' },
  { code: 14, key: 'game', label: '游戏' },
  { code: 15, key: 'embedded', label: '嵌入式/IoT' },
  { code: 16, key: 'crawler', label: '爬虫' }
]

/** 根据 code 获取 label */
export function getPlatformLabel(code: number | undefined): string {
  return PLATFORM_OPTIONS.find((p) => p.code === code)?.label ?? '其他'
}
