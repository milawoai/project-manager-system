/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 10:59:08
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-26 10:09:43
 * @FilePath: /copy_code_desk/src/shared/datas/ipcKey.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

export const defineHandlers = {
  common: {
    basicTest: {
      desc: '测试'
    },
    getProcessPlatform: {
      servicesName: 'common',
      funcName: 'getProcessPlatform',
      desc: '获取系统平台'
    },
    isLinux: {
      desc: '是否是Linux'
    },
    isMacOS: {
      desc: '是否是Mac'
    },
    isWindows: {
      desc: '是否是windows'
    },
    getStore: {
      desc: '获取缓存'
    },
    setStore: {
      desc: '设置缓存'
    },
    apiRequest: {
      desc: '通用API请求'
    },
    getLocale: {
      desc: '获取当前语言设置'
    },
    setLocale: {
      desc: '设置语言'
    },
    getGlobalShortcuts: {
      desc: '获取全局快捷键信息'
    },
  },
  file: {
    openFolder: {
      desc: '打开文件夹'
    },
    selectFolder: {
      desc: '选择文件夹'
    },
    selectFile: {
      desc: '选择文件'
    },
    saveFile: {
      desc: '保存文件'
    },
    openFiles: {
      desc: '选择文件'
    },
    imageToBase64: {
      desc: '将图片文件转换为base64格式'
    },
    openInTerminal: {
      desc: '在终端中打开路径'
    },
    resolveProjectMeta: {
      desc: '解析文件夹的工程元信息（名称、git地址等）'
    }
  },
  config: {
    getAllConfigs: {
      desc: '生成configs'
    },
    saveConfig: {
      desc: '保存config'
    },
    getConfigByKey: {
      desc: '获取单个配置项'
    },
    saveConfigItem: {
      desc: '保存单个配置项'
    },
    getSystemVarKeys: {
      desc: '获取系统变量键列表'
    },
    getSystemVarValues: {
      desc: '获取系统变量值列表'
    },
    setSystemVarValues: {
      desc: '设置系统变量值'
    }
  },
  distribute: {
    testConnection: {
      desc: '测试服务端连通性'
    },
    getSavedConfig: {
      desc: '获取已保存的连接配置'
    },
    resetRegistration: {
      desc: '清除本机注册信息（apiKey/machineId），下次连接时重新注册'
    },
    connectServer: {
      desc: '连接到分布式任务服务端'
    },
    disconnectServer: {
      desc: '断开服务端连接'
    },
    getConnectionStatus: {
      desc: '获取当前连接状态'
    },
    getDistProjects: {
      desc: '获取服务端工程列表'
    },
    getDistMachines: {
      desc: '获取工作机器列表'
    },
    registerMachine: {
      desc: '注册本机为工作机器'
    },
    bindProject: {
      desc: '绑定工程到机器'
    },
    unbindProject: {
      desc: '解绑工程'
    },
    getMachineProjects: {
      desc: '获取机器绑定的工程列表'
    },
    getDistTasks: {
      desc: '获取任务列表'
    },
    getDistTaskDetail: {
      desc: '获取任务详情'
    },
    startTask: {
      desc: '开始执行任务'
    },
    completeTask: {
      desc: '标记任务完成'
    },
    failTask: {
      desc: '标记任务失败'
    },
    syncProjects: {
      desc: '同步服务端工程到本地'
    },
    getLocalDistProjects: {
      desc: '获取本地已同步的工程列表'
    },
    setProjectLocalPath: {
      desc: '设置工程的本地路径'
    },
    addLocalProject: {
      desc: '添加纯本地工程（未上报到服务端）'
    },
    uploadLocalProject: {
      desc: '将本地工程上报到服务端'
    },
    syncRemoteProject: {
      desc: '将单个远端工程关联到本地'
    },
    updateLocalProject: {
      desc: '更新本地工程信息'
    },
    removeLocalProject: {
      desc: '移除本地工程记录'
    },
    getLocalTasks: {
      desc: '获取本地任务列表（从本地 SQLite 读取）'
    },
    startLocalTask: {
      desc: '开始处理本地任务：生成 prompt 文件 + 更新状态 + WS 上报'
    },
    finishLocalTask: {
      desc: '完成处理本地任务：更新状态 + WS 上报结果'
    },
    cancelStartLocalTask: {
      desc: '取消开始处理：删除已生成的 prompt 文件，状态回退到 pending'
    }
  },
  server: {
    startServer: {
      desc: '启动自动化服务器'
    },
    stopServer: {
      desc: '停止自动化服务器'
    },
    checkServerStatus: {
      desc: '检查服务器状态'
    }
  },
  aigent: {
    executeTask: {
      desc: '执行 Agent 任务'
    },
    stopTask: {
      desc: '中断 Agent 任务'
    },
    getTaskStatus: {
      desc: '获取任务状态'
    }
  }
}
