@echo off
chcp 65001 >nul
echo ============================
echo  废品价格爬虫 + 推送
echo ============================
echo.

echo [1/5] 检查 Python 依赖...
python -m pip install -r scripts\requirements.txt -q
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败！请检查 Python 环境。
    pause
    exit /b 1
)
echo ✅ 依赖就绪
echo.

echo [2/5] 运行爬虫...
python scripts/scraper.py --mianyang
if %errorlevel% neq 0 (
    echo ❌ 爬虫运行失败！
    pause
    exit /b 1
)
echo.

echo [3/5] 检查数据文件...
if not exist data\scraped-prices.json (
    echo ❌ 未生成数据文件！
    pause
    exit /b 1
)
echo ✅ 数据文件已生成
echo.

echo [4/5] 提交到 Git...
git add data\scraped-prices.json
git diff --staged --quiet
if %errorlevel% equ 0 (
    echo ℹ️ 数据无变化，跳过提交
) else (
    git commit -m "📊 更新废品价格数据 (%date:~0,4%-%date:~5,2%-%date:~8,2%)"
    echo ✅ 已提交
)
echo.

echo [5/5] 推送到远程...
git push origin master
if %errorlevel% neq 0 (
    echo ⚠️ GitHub 推送失败，尝试 Gitee...
    git push gitee master
    if %errorlevel% neq 0 (
        echo ❌ Gitee 推送也失败！请检查网络或远程配置。
        pause
        exit /b 1
    )
    echo ✅ Gitee 推送完成！
) else (
    echo ✅ GitHub 推送完成！
)

echo.
echo ============================
echo  全部完成！
echo ============================
pause
