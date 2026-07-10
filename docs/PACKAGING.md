# Packaging

## Windows

```powershell
npm run desktop:dist:windows
npm run desktop:dist:windows:dir
```

`better-sqlite3` is externalized from Vite, rebuilt for Electron, and included as a native dependency by electron-builder. Validate both the installer and unpacked executable against legacy JSON migration, collection, search, RAG, project import, and project export.

## Android

Install JDK 21 and an Android SDK with the configured platform/build tools, then run:

```powershell
npm run mobile:sync:android
npm run mobile:android:assemble
npm run mobile:android:bundle
```

The APK is produced under `apps/mobile/android/app/build/outputs/apk/debug/`. The release bundle is produced under `apps/mobile/android/app/build/outputs/bundle/release/`.

Capacitor copies the standalone `apps/mobile/dist` output. The Android client does not package desktop collection code or Ollama support.
