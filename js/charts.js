/**
 * 价格趋势图 - 基于 Chart.js
 * 支持 7/30/90 天走势 + 双品类对比
 * 不同来源用不同颜色/标记区分
 */
const Charts = (() => {
  let trendChart = null;

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function render(categoryId, days, categoryId2 = null) {
    const canvas = document.getElementById('trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 销毁旧图表
    if (trendChart) trendChart.destroy();

    // 获取暗色模式
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // 获取主题色
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#1a73e8';
    const upColor = getComputedStyle(document.documentElement).getPropertyValue('--up').trim() || '#e53935';
    const downColor = getComputedStyle(document.documentElement).getPropertyValue('--down').trim() || '#43a047';

    DB.getPriceHistory(categoryId, days).then(async (history) => {
      if (!history || history.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.parentElement.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="text">暂无历史数据</div></div>';
        return;
      }

      // 准备数据
      const labels = history.map(p => formatDate(p.recorded_at));
      const crawlerPrices = history.map(p => (p.buy_price + p.sell_price) / 2);

      // 获取用户录入的价格
      const userPrices = await DB.getByIndex('prices', 'category_id', categoryId);
      const userRecords = userPrices
        .filter(p => p.source === 'user' && new Date(p.recorded_at) >= new Date(Date.now() - days * 86400000))
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

      const datasets = [{
        label: '行情价',
        data: crawlerPrices,
        borderColor: primaryColor,
        backgroundColor: primaryColor + '15',
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: primaryColor,
      }];

      // 用户录入价格用红色圆点
      if (userRecords.length > 0) {
        const userData = labels.map(label => {
          const match = userRecords.find(r => formatDate(r.recorded_at) === label);
          return match ? (match.buy_price + match.sell_price) / 2 : null;
        });
        datasets.push({
          label: '我的成交价',
          data: userData,
          borderColor: upColor,
          backgroundColor: upColor,
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointStyle: 'circle',
          showLine: false,
        });
      }

      // 对比品类
      if (categoryId2) {
        const history2 = await DB.getPriceHistory(categoryId2, days);
        if (history2 && history2.length > 0) {
          const cat2 = CATEGORIES.find(c => c.id === categoryId2);
          const prices2 = history2.map(p => (p.buy_price + p.sell_price) / 2);
          datasets.push({
            label: cat2 ? cat2.name : '对比品类',
            data: prices2,
            borderColor: downColor,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 5,
          });
        }
      }

      // 确保画布父容器有正确的结构
      const container = canvas.parentElement;
      if (!document.getElementById('trend-chart')) {
        container.innerHTML = '<canvas id="trend-chart"></canvas>';
      }

      const newCanvas = document.getElementById('trend-chart');
      const newCtx = newCanvas.getContext('2d');

      trendChart = new Chart(newCtx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: textColor, font: { size: 13 }, usePointStyle: true, padding: 16 }
            },
            tooltip: {
              backgroundColor: isDark ? '#1a1a2e' : '#333',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 12,
              cornerRadius: 8,
              titleFont: { size: 14 },
              bodyFont: { size: 13 },
              callbacks: {
                label: function(ctx) {
                  const label = ctx.dataset.label || '';
                  const val = ctx.parsed.y;
                  if (val === null) return null;
                  return `${label}: ¥${val.toFixed(0)}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: gridColor, drawBorder: false },
              ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 20 }
            },
            y: {
              grid: { color: gridColor, drawBorder: false },
              ticks: {
                color: textColor,
                font: { size: 11 },
                callback: v => '¥' + v.toLocaleString()
              }
            }
          }
        }
      });
    });
  }

  // 渲染记账饼图
  function renderLedgerPie(ledgerData, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#9ca3af' : '#6b7280';

    const labels = ledgerData.map(d => d.name);
    const data = ledgerData.map(d => d.total);
    const colors = [
      '#1a73e8', '#e53935', '#43a047', '#ff9800', '#9c27b0',
      '#00bcd4', '#795548', '#607d8b', '#f44336', '#3f51b5'
    ];

    return new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor, font: { size: 12 }, padding: 10, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: ¥${ctx.parsed.toLocaleString()}`
            }
          }
        }
      }
    });
  }

  return { render, renderLedgerPie };
})();
