#!/bin/bash
set -e

echo "============================"
echo " 废品价格爬虫 + 推送"
echo "============================"
echo ""

echo "[1/5] 检查 Python 依赖..."
python3 -m pip install -r scripts/requirements.txt -q
echo "✅ 依赖就绪"
echo ""

echo "[2/5] 运行爬虫..."
python3 scripts/scraper.py --mianyang
echo ""

echo "[3/5] 检查数据文件..."
if [ ! -f data/scraped-prices.json ]; then
    echo "❌ 未生成数据文件！"
    exit 1
fi
echo "✅ 数据文件已生成"
echo ""

echo "[4/5] 提交到 Git..."
git add data/scraped-prices.json
if git diff --staged --quiet; then
    echo "ℹ️ 数据无变化，跳过提交"
else
    git commit -m "📊 更新废品价格数据 ($(date +%Y-%m-%d))"
    echo "✅ 已提交"
fi
echo ""

echo "[5/5] 推送到远程..."
git push origin master || {
    echo "⚠️ GitHub 推送失败，尝试 Gitee..."
    git push gitee master || {
        echo "❌ Gitee 推送也失败！请检查网络或远程配置。"
        exit 1
    }
    echo "✅ Gitee 推送完成！"
}
echo "✅ 推送完成！"
echo ""

echo "============================"
echo " 全部完成！"
echo "============================"
