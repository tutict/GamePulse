# 游脉 GamePulse 打包说明

本文档记录 Windows 桌面端和 Android 移动端的本地打包入口。

## Windows 桌面端

桌面端基于 Electron。为了避免 Windows 本机 native 模块 rebuild 带来的不稳定，当前桌面端本地证据库使用纯 JS JSON 存储。

### 生成 Windows 未压缩目录包

适合本地快速验证桌面端打包内容：

```bash
npm run desktop:dist:windows:dir
```

输出目录：`apps/desktop/release/win-unpacked/`

如果提示缺少 `node_modules/electron/dist/electron.exe`，先运行：

```bash
npm approve-scripts electron
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
```

Windows PowerShell 可以改成：`$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'; node node_modules/electron/install.js`。

### 生成 Windows 安装包和便携版

```bash
npm run desktop:dist:windows
```

该命令会先生成 `win-unpacked`，再基于预打包目录交给 electron-builder 生成 NSIS 和 Portable 产物。输出目录：`apps/desktop/release/`

## Android 移动端

Android 端基于 Capacitor，复用 `@gamepulse/web` 的前端构建产物作为 WebView 内容。

### 同步 Android 工程

```bash
npm run mobile:sync:android
```

该命令会先构建 Web 前端，再将 `apps/web/dist` 同步到 Capacitor Android 工程。

### 生成 Debug APK

```bash
npm run mobile:android:assemble
```

输出通常位于：`apps/mobile/android/app/build/outputs/apk/debug/`

### 生成 Release AAB

```bash
npm run mobile:android:bundle
```

输出通常位于：`apps/mobile/android/app/build/outputs/bundle/release/`

### 打开 Android Studio

```bash
npm run mobile:open:android
```

## Android Release 签名

如果需要生成可发布的 Release 包，请在本地环境变量中配置：

```bash
GAMEPULSE_ANDROID_KEYSTORE=C:\\path\\to\\gamepulse-release.keystore
GAMEPULSE_ANDROID_KEYSTORE_PASSWORD=change-me
GAMEPULSE_ANDROID_KEY_ALIAS=gamepulse
GAMEPULSE_ANDROID_KEY_PASSWORD=change-me
```

这些变量会被 `apps/mobile/android/app/build.gradle` 读取。如果未配置，Debug 包仍可构建，Release 包会按 Android 工程默认策略处理。

## 常用验证命令

```bash
npm run typecheck
npm run mobile:sync:android
npm run desktop:dist:windows:dir
```
