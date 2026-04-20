# 启动说明

## 首次安装或更新依赖后

由于项目使用了 native 模块（如 `better-sqlite3`），需要先重新编译以匹配 Electron 内嵌的 Node.js 版本。

```bash
cd electron/electron-app

# 1. 安装依赖（使用 yarn）
yarn install

# 2. 重新编译 native 模块
npx @electron/rebuild -f -m .
```

## 启动开发服务器

```bash
yarn dev
```

## 常见问题

### native 模块报错 (ERR_DLOPEN_FAILED)

如果遇到类似错误：
```
The module was compiled against a different Node.js version
NODE_MODULE_VERSION mismatch
```

运行 `npx @electron/rebuild -f -m .` 即可解决。
