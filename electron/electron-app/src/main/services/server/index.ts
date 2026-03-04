import { WindowManager } from '../../windowManager'
import {
  checkIsServerSurvies,
  closeServer as closeExpressServer,
  initializeServer
} from '../../server/index'

export const startServer = async (port: number = 5679) => {
  const mainWindow = WindowManager.getInstance().getMainWindow()
  await initializeServer(mainWindow, port)
  return true
}

export const stopServer = async () => {
  return await closeExpressServer()
}

export const checkServerStatus = async (port: number = 5679) => {
  return await checkIsServerSurvies(port)
}
