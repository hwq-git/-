@echo off
echo ============================================
echo   废品行情通 APK 打包脚本
echo ============================================
echo.

cd /d "%~dp0"

echo [1/5] 安装依赖...
call npm install @capacitor/core @capacitor/cli @capacitor/android
if %errorlevel% neq 0 (
    echo 安装失败，请检查 Node.js 是否安装
    pause
    exit /b 1
)

echo [2/5] 初始化 Capacitor...
call npx cap init 废品行情通 com.feipin.hangqing --web-dir=.
if %errorlevel% neq 0 (
    echo 初始化失败
    pause
    exit /b 1
)

echo [3/5] 添加 Android 平台...
call npx cap add android
if %errorlevel% neq 0 (
    echo 请确保已安装 Android Studio 和 Android SDK
    pause
    exit /b 1
)

echo [4/5] 同步资源...
call npx cap sync
if %errorlevel% neq 0 (
    echo 同步失败
    pause
    exit /b 1
)

echo.
echo [5/5] 正在打开 Android Studio...
echo 请在 Android Studio 中选择 Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
call npx cap open android

echo.
echo ============================================
echo   APK 编译完成后位于:
echo   android\app\build\outputs\apk\debug\app-debug.apk
echo ============================================
pause
