/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 12:13:17
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-12 11:43:52
 * @FilePath: /copy_code_desk/src/main/windowManager.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { generateUserAgent } from './utils'

interface ChildWindowOptions {
  width?: number
  height?: number
  x?: number
  y?: number
  fullscreen?: boolean
  frame?: boolean
  alwaysOnTop?: boolean
  transparent?: boolean
  resizable?: boolean
  routePath?: string
  queryParams?: Record<string, string | number>
  windowId?: string
}

export class WindowManager {
  private static instance: WindowManager
  private mainWindow: BrowserWindow | null = null
  private childWindows: Map<string, BrowserWindow> = new Map()
  private floatWindow: BrowserWindow | null = null

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }

  static getMainWindow(): BrowserWindow | null {
    if (!WindowManager.instance) {
      return null
    }
    return WindowManager.instance.getMainWindow()
  }

  createMainWindow(): BrowserWindow {
    const originWindow = this.mainWindow

    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 870,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        webSecurity: false,
        sandbox: false
      }
    })

    this.setupWindowEvents()
    this.loadContent()

    // 开发环境自动打开 DevTools（可看渲染进程 console / IPC 调用）
    if (is.dev) {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' })
    }

    if (originWindow) {
      originWindow.destroy()
    }

    return this.mainWindow
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private setupWindowEvents(): void {
    if (!this.mainWindow) return

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
    })

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 配置 CSP：允许加载 Blob URL（开发和生产环境都适用）
    this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders }

      // 获取现有的 CSP
      const csp =
        responseHeaders['Content-Security-Policy'] || responseHeaders['content-security-policy']

      if (csp && Array.isArray(csp)) {
        // 更新 CSP，确保包含 blob:
        const updatedCsp = csp.map((policy) => {
          // 确保 img-src 包含 blob:
          if (policy.includes('img-src')) {
            // 移除原有的 img-src 部分，添加包含 blob: 的新版本
            return policy.replace(/img-src[^;]*/, "img-src 'self' https: http: data: blob:")
          }
          return policy
        })
        responseHeaders['Content-Security-Policy'] = updatedCsp
      } else if (!csp) {
        // 如果没有 CSP，添加一个基本的（保护安全）
        responseHeaders['Content-Security-Policy'] = [
          "default-src 'self' https: http:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:"
        ]
      }

      callback({ responseHeaders })
    })
  }

  private loadContent(): void {
    if (!this.mainWindow) return

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'], {
        userAgent: generateUserAgent()
      })
    } else {
      this.mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
    }
  }

  createChildWindow(options: ChildWindowOptions) {
    try {
      const {
        width,
        height,
        x,
        y,
        fullscreen = false,
        frame = true,
        alwaysOnTop = false,
        transparent = false,
        resizable = true,
        routePath = '',
        queryParams = {},
        windowId = `child_${Date.now()}`
      } = options

      // 如果指定窗口ID的窗口已存在，先关闭
      if (this.childWindows.has(windowId)) {
        this.closeChildWindow(windowId)
      }

      // 获取屏幕尺寸作为默认值
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

      // 创建子窗口
      const childWindow = new BrowserWindow({
        width: width || Math.floor(screenWidth * 0.8),
        height: height || Math.floor(screenHeight * 0.8),
        x: x ?? undefined,
        y: y ?? undefined,
        fullscreen,
        frame,
        alwaysOnTop,
        transparent,
        show: false,
        autoHideMenuBar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      // 设置窗口可调整大小属性
      childWindow.setResizable(resizable)

      // 构建URL参数
      let urlWithParams = ''
      if (routePath || Object.keys(queryParams).length > 0) {
        const params = new URLSearchParams()
        Object.entries(queryParams).forEach(([key, value]) => {
          params.set(key, String(value))
        })
        const query = params.toString()

        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          // 开发环境 - 使用 hash 路由
          const baseUrl = process.env['ELECTRON_RENDERER_URL']
          const hashPath = routePath ? `/#${routePath}` : '/#/'
          urlWithParams = query ? `${baseUrl}${hashPath}?${query}` : `${baseUrl}${hashPath}`
        } else {
          // 生产环境
          const hashPath = routePath || '/'
          const hash = query ? `${hashPath}?${query}` : hashPath
          childWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash })
          urlWithParams = '' // 在生产环境中不需要构建完整URL
        }
      }

      // 加载内容
      if (urlWithParams && is.dev) {
        childWindow.loadURL(urlWithParams)
      } else if (!urlWithParams) {
        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          childWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
        } else {
          childWindow.loadFile(join(__dirname, '../renderer/index.html'))
        }
      }

      // 窗口事件处理
      childWindow.on('ready-to-show', () => {
        childWindow.show()
      })

      childWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      childWindow.on('closed', () => {
        this.childWindows.delete(windowId)
      })

      // 存储窗口引用
      this.childWindows.set(windowId, childWindow)

      return { success: true, windowId, window: childWindow }
    } catch (error) {
      console.error('创建子窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  closeChildWindow(windowId: string) {
    try {
      const childWindow = this.childWindows.get(windowId)
      if (childWindow && !childWindow.isDestroyed()) {
        childWindow.close()
        this.childWindows.delete(windowId)
        return { success: true }
      }
      return { success: false, msg: '窗口不存在或已关闭' }
    } catch (error) {
      console.error('关闭子窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  getChildWindow(windowId: string): BrowserWindow | null {
    return this.childWindows.get(windowId) || null
  }

  getAllChildWindows(): Map<string, BrowserWindow> {
    return new Map(this.childWindows)
  }

  closeAllChildWindows() {
    try {
      this.childWindows.forEach((window, windowId) => {
        if (!window.isDestroyed()) {
          window.close()
        }
        this.childWindows.delete(windowId)
      })
      return { success: true }
    } catch (error) {
      console.error('关闭所有子窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  createFloatWindow() {
    try {
      // 关闭之前的悬浮窗口
      if (this.floatWindow && !this.floatWindow.isDestroyed()) {
        this.floatWindow.close()
        this.floatWindow = null
      }

      // 获取屏幕尺寸
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

      // 创建悬浮窗口
      this.floatWindow = new BrowserWindow({
        width: Math.floor(screenWidth * 0.5),
        height: Math.floor(screenHeight * 0.6),
        x: Math.floor((screenWidth - 400) / 2), // 居中显示
        y: 50, // 距离顶部50像素
        frame: false, // 无边框
        alwaysOnTop: true, // 总是在最前
        transparent: false,
        resizable: true,
        show: false,
        autoHideMenuBar: true,
        skipTaskbar: true, // 不在任务栏显示
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      // 加载悬浮窗口页面
      const routePath = '/float-window'
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const baseUrl = process.env['ELECTRON_RENDERER_URL']
        const urlWithRoute = `${baseUrl}/#${routePath}`
        this.floatWindow.loadURL(urlWithRoute)
      } else {
        this.floatWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: routePath })
      }

      // 窗口事件处理
      this.floatWindow.on('ready-to-show', () => {
        this.floatWindow?.show()
      })

      this.floatWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      this.floatWindow.on('closed', () => {
        this.floatWindow = null
      })
      // this.floatWindow?.webContents.openDevTools() // 临时注释
      return { success: true, message: '悬浮窗口创建成功' }
    } catch (error) {
      console.error('创建悬浮窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  closeFloatWindow() {
    try {
      if (this.floatWindow && !this.floatWindow.isDestroyed()) {
        this.floatWindow.close()
        this.floatWindow = null
        return { success: true, message: '悬浮窗口关闭成功' }
      }
      return { success: false, msg: '悬浮窗口不存在或已关闭' }
    } catch (error) {
      console.error('关闭悬浮窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  getFloatWindow(): BrowserWindow | null {
    return this.floatWindow
  }
}
