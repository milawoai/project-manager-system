/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 00:17:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-12 11:40:57
 * @FilePath: /copy_code_desk/src/main/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { initialGlobalShortcut, quitGlobalShortcut } from './globalShortcuts'
import { initializeHandlers } from './handler'
import { initialConfigs } from './services/config/index'
import { WindowManager } from './windowManager'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const windowManager = WindowManager.getInstance()
  const mainWindow = windowManager.createMainWindow()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()
  initializeHandlers()
  initialConfigs()
  initialGlobalShortcut() // 注册所有全局快捷键

  // 初始化服务管理器 (延迟初始化,等待窗口创建完成)
  // setTimeout(async () => {
  //   console.log('[Main] 初始化服务管理器...')
  //   try {
  //     const result = await startAllServices()
  //     console.log('[Main] 服务管理器初始化结果:', result)
  //   } catch (error) {
  //     console.error('[Main] 服务管理器初始化失败:', error)
  //   }
  // }, 3000)

  // 初始化任务执行器系统(延迟初始化,等待配置加载完成)
  // setTimeout(async () => {
  //   try {
  //     await initTaskExecutor()
  //     console.log('[Main] Task executor initialized successfully')

  //     // 初始化Python WebSocket连接
  //     console.log('[Main] Initializing Python WebSocket connection...')
  //     await ensurePythonWebSocketConnection()
  //     console.log('[Main] Python WebSocket initialization completed')
  //   } catch (error) {
  //     console.error('[Main] Failed to initialize task executor or Python WebSocket:', error)
  //   }
  // }, 2000)
  // globalShortcutManager.registerDefaultShortcuts()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出时注销所有全局快捷键并停止所有服务
app.on('will-quit', async () => {
  console.log('[Main] 应用退出，停止所有服务...')
  quitGlobalShortcut()

  // try {
  //   await stopAllServices()
  //   console.log('[Main] 所有服务已停止')
  // } catch (error) {
  //   console.error('[Main] 停止服务时出错:', error)
  // }

  // globalShortcutManager.unregisterAll()
})
