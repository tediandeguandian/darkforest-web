; ============================================================
; 三体 · 黑暗森林 —— Windows 安装程序（NSIS）
; 由 sh build-installer.sh 调用，makensis 在 desktop/build/nsis 下
;
; 说明：
;   · payload 是 electron-packager 产出的 dist/dark-forest-win32-x64/ 整目录
;   · LZMA 固实压缩：238 MB 的 exe 能压到 90 MB 左右
;   · 装到当前用户目录（%LOCALAPPDATA%），不需要管理员权限
;   · Electron 自带 Chromium，不需要 WebView2
; ============================================================
Unicode true
ManifestDPIAware true

!define APPNAME "黑暗森林"
!define EXE "dark-forest.exe"
; 版本号默认 1.0.13，build-installer.sh 会用 -DVERSION=xxx 覆盖
!ifndef VERSION
!define VERSION "1.0.13"
!endif
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\黑暗森林"

Name "${APPNAME}"
OutFile "dist/黑暗森林-${VERSION}-win64-setup.exe"
InstallDir "$LOCALAPPDATA\${APPNAME}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

Icon "build/icon.ico"
UninstallIcon "build/icon.ico"

; 关掉欢迎页上花哨的部分：一个干净的向导就够
AutoCloseWindow false
SpaceTexts none

Section "安装"
  SetOutPath "$INSTDIR"
  File /r "dist/dark-forest-win32-x64/*.*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; 快捷方式：桌面 + 开始菜单
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}"

  ; 注册卸载信息（设置 → 应用 里能看到）
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "三体 · 黑暗森林"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "shuwang"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "${UNKEY}"
SectionEnd
