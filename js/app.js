/**
 * 废品行情通 - 主应用逻辑
 * 4 Tab：行情 | 记账 | 趋势 | 我的
 */
const App = (() => {
  let currentFilter = '';
  let currentSearch = '';
  let currentTrendDays = 30;
  let ledgerType = 'buy';
  let allCategories = [];
  let favoriteIds = new Set();

  // ===== 初始化 =====
  async function init() {
    try {
      // 1. 初始化数据库
      await DB.init();

      // 2. 初始化种子数据
      await initSeedData();

      // 3. 加载收藏
      await loadFavorites();

      // 4. 渲染各页面
      await renderMarket();
      await renderLedger();
      await initTrendControls();
      await renderSettings();

      // 5. 恢复状态栏
      await Crawler.restoreStatusBar();

      // 6. 启动爬虫定时器
      await Crawler.startScheduler();

      // 7. 如果上次同步超过2小时，自动爬取一次
      const lastCrawl = await DB.getSetting('last_crawl_at', null);
      if (lastCrawl) {
        const elapsed = Date.now() - new Date(lastCrawl).getTime();
        if (elapsed > 2 * 3600 * 1000) {
          const enabled = await DB.getSetting('crawler_enabled', true);
          if (enabled) {
            console.log('[App] 数据较旧，自动触发爬取');
            Crawler.runCrawl(false);
          }
        }
      }

      // 8. 注册 Service Worker
      registerSW();

      // 9. 填充表单选项
      await fillCategorySelects();

      console.log('[App] 初始化完成');
    } catch (e) {
      console.error('[App] 初始化失败:', e);
      showToast('❌ 初始化失败: ' + e.message);
    }
  }

  // ===== 注册 Service Worker =====
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[SW] 注册成功'))
        .catch(err => console.warn('[SW] 注册失败:', err));
    }
  }

  // ===== 加载收藏 =====
  async function loadFavorites() {
    const favs = await DB.getAll('favorites');
    favoriteIds = new Set(favs.map(f => f.id));
  }

  // ===== Tab 切换 =====
  function switchTab(tabName) {
    // 更新导航按钮
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // 更新内容
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    // 切换到趋势时重新渲染图表
    if (tabName === 'trends') {
      setTimeout(renderTrendChart, 100);
    }
    // 切换到设置时更新状态
    if (tabName === 'settings') {
      renderCrawlerStatus();
    }
  }

  // ===== 行情页 =====
  async function renderMarket() {
    const listEl = document.getElementById('price-list');
    if (!listEl) return;

    const categories = await DB.getAll('categories');
    const subCategories = categories
      .filter(c => c.parent_id) // 只显示子品类
      .filter(c => !currentFilter || c.parent_id === currentFilter)
      .filter(c => !currentSearch || c.name.includes(currentSearch))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // 收藏的排前面
    subCategories.sort((a, b) => {
      const aFav = favoriteIds.has(a.id) ? 0 : 1;
      const bFav = favoriteIds.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    allCategories = categories;

    if (subCategories.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><div class="text">未找到相关品类</div></div>';
      return;
    }

    const regionCode = await DB.getSetting('current_region', 'default');
    const cards = [];

    for (const cat of subCategories) {
      const latest = await DB.getLatestPrice(cat.id, regionCode);
      if (!latest) continue;

      // 计算涨跌（和上一条比较）
      const history = await DB.getPriceHistory(cat.id, 7, regionCode);
      const prevPrice = history.length >= 2 ? history[history.length - 2] : null;
      const change = prevPrice ? ((latest.buy_price + latest.sell_price) / 2) - ((prevPrice.buy_price + prevPrice.sell_price) / 2) : 0;
      const changePercent = prevPrice ? (change / ((prevPrice.buy_price + prevPrice.sell_price) / 2) * 100) : 0;

      const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
      const changeIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      const changeText = change === 0 ? '持平' : `${changeIcon} ${Math.abs(change).toFixed(0)} (${Math.abs(changePercent).toFixed(1)}%)`;

      const sourceMap = {
        crawler: { tag: '🕷️', label: '爬虫', class: 'crawler' },
        user: { tag: '✏️', label: '我记的', class: 'user' },
        share: { tag: '👥', label: '分享', class: 'share' },
        seed: { tag: '📦', label: '参考', class: 'seed' },
      };
      const src = sourceMap[latest.source] || sourceMap.seed;

      const isFav = favoriteIds.has(cat.id);
      const timeAgo = getTimeAgo(latest.recorded_at);

      cards.push(`
        <div class="price-card ${isFav ? 'favorited' : ''}" onclick="App.showPriceDetail('${cat.id}')">
          <div class="price-card-header">
            <div class="price-card-name">
              <span class="cat-icon">${cat.icon || '📋'}</span>
              <span>${cat.name}</span>
            </div>
            <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); App.toggleFavorite('${cat.id}')">
              ${isFav ? '⭐' : '☆'}
            </button>
          </div>
          <div class="price-card-prices">
            <div class="price-item">
              <div class="price-label">收购价</div>
              <div class="price-value ${changeClass}">${latest.buy_price.toLocaleString()}</div>
            </div>
            <div class="price-item">
              <div class="price-label">卖出价</div>
              <div class="price-value ${changeClass}">${latest.sell_price.toLocaleString()}</div>
            </div>
          </div>
          <div class="price-card-footer">
            <span class="price-change ${changeClass}">${changeText}</span>
            <span class="source-tag ${src.class}">${src.tag} ${src.label} · ${timeAgo}</span>
          </div>
        </div>
      `);
    }

    if (cards.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="text">暂无价格数据</div></div>';
      return;
    }

    listEl.innerHTML = cards.join('');
  }

  // 搜索 & 筛选
  function filterCategories(value) {
    currentSearch = value.trim();
    renderMarket();
  }

  function setFilter(parentId) {
    currentFilter = parentId;
    document.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.parent === parentId);
    });
    renderMarket();
  }

  // 收藏
  async function toggleFavorite(categoryId) {
    if (favoriteIds.has(categoryId)) {
      favoriteIds.delete(categoryId);
      await DB.deleteItem('favorites', categoryId);
      showToast('已取消收藏');
    } else {
      favoriteIds.add(categoryId);
      await DB.put('favorites', { id: categoryId, created_at: new Date().toISOString() });
      showToast('⭐ 已收藏');
    }
    await renderMarket();
  }

  // 价格详情（点击卡片展开录入弹窗）
  async function showPriceDetail(categoryId) {
    await showPriceModal(categoryId);
  }

  // ===== 记账页 =====
  async function renderLedger() {
    const listEl = document.getElementById('ledger-list');
    const summaryEl = document.getElementById('summary-cards');
    if (!listEl) return;

    const records = await DB.getAll('ledger');
    records.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));

    // 统计
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthBuy = 0, monthSell = 0;
    let totalBuy = 0, totalSell = 0;

    for (const r of records) {
      const total = r.total || (r.weight * r.unit_price);
      if (r.type === 'buy') {
        totalBuy += total;
        if (new Date(r.recorded_at) >= monthStart) monthBuy += total;
      } else {
        totalSell += total;
        if (new Date(r.recorded_at) >= monthStart) monthSell += total;
      }
    }

    const monthProfit = monthSell - monthBuy;
    const totalProfit = totalSell - totalBuy;

    summaryEl.innerHTML = `
      <div class="summary-card">
        <div class="label">本月支出</div>
        <div class="value expense">¥${monthBuy.toLocaleString()}</div>
      </div>
      <div class="summary-card">
        <div class="label">本月收入</div>
        <div class="value income">¥${monthSell.toLocaleString()}</div>
      </div>
      <div class="summary-card">
        <div class="label">本月盈亏</div>
        <div class="value ${monthProfit >= 0 ? 'income' : 'expense'}">${monthProfit >= 0 ? '+' : ''}¥${monthProfit.toLocaleString()}</div>
      </div>
      <div class="summary-card">
        <div class="label">总盈亏</div>
        <div class="value ${totalProfit >= 0 ? 'income' : 'expense'}">${totalProfit >= 0 ? '+' : ''}¥${totalProfit.toLocaleString()}</div>
      </div>
    `;

    if (records.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="icon">📋</div><div class="text">暂无记录<br>点击"新建记录"开始记账</div></div>';
      return;
    }

    const items = [];
    for (const r of records.slice(0, 50)) {
      const cat = allCategories.find(c => c.id === r.category_id) || CATEGORIES.find(c => c.id === r.category_id);
      const catName = cat ? cat.name : '未知';
      const catIcon = cat ? (cat.icon || '📋') : '📋';
      const total = r.total || (r.weight * r.unit_price);
      const typeIcon = r.type === 'buy' ? '📥' : '📤';
      const typeLabel = r.type === 'buy' ? '收货' : '卖货';
      const time = new Date(r.recorded_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      items.push(`
        <div class="ledger-item">
          <div class="type-icon ${r.type}">${typeIcon}</div>
          <div class="info">
            <div class="title">${catIcon} ${catName} · ${typeLabel}</div>
            <div class="sub">${r.weight}${cat?.unit?.replace('元/', '') || 'kg'} × ¥${r.unit_price?.toLocaleString() || 0}${r.counterparty ? ' · ' + r.counterparty : ''} · ${time}</div>
          </div>
          <div class="amount ${r.type}">${r.type === 'buy' ? '-' : '+'}¥${total.toLocaleString()}</div>
        </div>
      `);
    }

    listEl.innerHTML = items.join('');
  }

  // ===== 趋势页 =====
  async function initTrendControls() {
    const select1 = document.getElementById('trend-category');
    const select2 = document.getElementById('trend-category2');

    if (!select1) return;

    const categories = CATEGORIES;
    const options = categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    select1.innerHTML = options;
    select2.innerHTML = '<option value="">不对比</option>' + options;

    // 默认选第一个
    if (categories.length > 0) {
      select1.value = categories[0].id;
    }

    await renderTrendChart();
  }

  async function renderTrendChart() {
    const catId = document.getElementById('trend-category')?.value;
    const catId2 = document.getElementById('trend-category2')?.value;
    if (!catId) return;
    Charts.render(catId, currentTrendDays, catId2 || null);
  }

  function setTrendPeriod(days) {
    currentTrendDays = days;
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.days) === days);
    });
    renderTrendChart();
  }

  // ===== 设置页 =====
  async function renderSettings() {
    const crawlerEnabled = await DB.getSetting('crawler_enabled', true);
    const wifiOnly = await DB.getSetting('crawler_wifi_only', true);
    const interval = await DB.getSetting('crawler_interval_minutes', 120);

    document.getElementById('setting-crawler-enabled').checked = crawlerEnabled;
    document.getElementById('setting-wifi-only').checked = wifiOnly;
    document.getElementById('setting-interval').value = interval;

    await renderCrawlerStatus();
  }

  async function renderCrawlerStatus() {
    const el = document.getElementById('crawler-status-detail');
    if (!el) return;

    const lastCrawl = await DB.getSetting('last_crawl_at', null);
    const lastStatus = await DB.getSetting('last_crawl_status', null);
    const lastItems = await DB.getSetting('last_crawl_items', 0);
    const skipReason = await DB.getSetting('last_crawl_skip_reason', null);

    const configs = await DB.getAll('crawler_configs');
    const logs = await DB.getAll('crawl_logs');
    logs.sort((a, b) => new Date(b.crawled_at) - new Date(a.crawled_at));

    const statusMap = {
      success: { text: '成功', class: 'ok' },
      failed: { text: '失败', class: 'err' },
      simulated: { text: '模拟更新', class: 'ok' },
      skipped: { text: '跳过', class: 'err' },
    };
    const statusInfo = lastStatus ? statusMap[lastStatus] || { text: lastStatus, class: '' } : { text: '未运行', class: '' };

    let html = `
      <div class="crawler-status-item">
        <span class="label">上次同步</span>
        <span class="value">${lastCrawl ? new Date(lastCrawl).toLocaleString('zh-CN') : '从未'}</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">同步状态</span>
        <span class="value ${statusInfo.class}">${statusInfo.text}${skipReason ? ' (' + skipReason + ')' : ''}</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">抓取数据</span>
        <span class="value">${lastItems} 条</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">爬虫版本</span>
        <span class="value">${configs[0]?.version || '1.0.0'}</span>
      </div>
    `;

    // 站点状态
    html += '<div style="margin-top:12px;font-size:14px;font-weight:600;margin-bottom:8px;">📡 爬虫站点</div>';
    for (const config of configs) {
      const lastLog = logs.find(l => l.website_name === config.website_name);
      const statusClass = config.last_success_at ? 'ok' : 'err';
      const statusText = config.last_error ? `错误: ${config.last_error}` :
                         config.last_success_at ? `成功 · ${getTimeAgo(config.last_success_at)}` :
                         '未运行';
      html += `
        <div class="crawler-site-item">
          <div class="crawler-site-name">${config.enabled ? '✅' : '⏸️'} ${config.website_name}</div>
          <div class="crawler-site-status"><span class="${statusClass}">${statusText}</span></div>
        </div>
      `;
    }

    // 最近日志
    if (logs.length > 0) {
      html += '<div style="margin-top:12px;font-size:14px;font-weight:600;margin-bottom:8px;">📜 最近日志</div>';
      for (const log of logs.slice(0, 5)) {
        const time = new Date(log.crawled_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const statusText = log.status === 'success' ? `✅ ${log.items_scraped}条` : `❌ ${log.error_msg || '失败'}`;
        html += `
          <div class="crawler-site-item">
            <div class="crawler-site-name">${log.website_name}</div>
            <div class="crawler-site-status">${statusText} · ${time} · ${log.duration_ms}ms</div>
          </div>
        `;
      }
    }

    el.innerHTML = html;
  }

  async function updateSetting(key, value) {
    await DB.setSetting(key, value);
    showToast('✅ 设置已保存');

    // 如果是爬虫相关设置，重启定时器
    if (key === 'crawler_enabled' || key === 'crawler_interval_minutes') {
      const enabled = await DB.getSetting('crawler_enabled', true);
      if (enabled) {
        await Crawler.startScheduler();
      } else {
        Crawler.stopScheduler();
      }
    }
  }

  // ===== 弹窗：录入价格 =====
  async function showPriceModal(categoryId = null) {
    const modal = document.getElementById('modal-price');
    const select = document.getElementById('price-category');

    // 填充品类选项
    if (!select.options.length) {
      await fillCategorySelects();
    }

    if (categoryId) {
      select.value = categoryId;
    }

    // 清空输入
    document.getElementById('price-buy').value = '';
    document.getElementById('price-sell').value = '';
    document.getElementById('price-note').value = '';
    document.getElementById('price-compare-hint').classList.remove('show');

    modal.classList.remove('hidden');

    // 如果有品类选中，预填参考价
    if (select.value) {
      await checkPriceCompare();
    }
  }

  // 检查价格对比
  async function checkPriceCompare() {
    const catId = document.getElementById('price-category').value;
    const buyInput = document.getElementById('price-buy');
    const sellInput = document.getElementById('price-sell');
    const hint = document.getElementById('price-compare-hint');

    const buyVal = parseFloat(buyInput.value);
    const sellVal = parseFloat(sellInput.value);
    if (!catId || (!buyVal && !sellVal)) {
      hint.classList.remove('show');
      return;
    }

    const regionCode = await DB.getSetting('current_region', 'default');
    const latest = await DB.getLatestPrice(catId, regionCode);
    if (!latest) return;

    const checkVal = buyVal || sellVal;
    const refPrice = buyVal ? latest.buy_price : latest.sell_price;
    const diff = checkVal - refPrice;
    const diffPercent = (diff / refPrice * 100);

    if (Math.abs(diffPercent) < 1) {
      hint.className = 'compare-hint show';
      hint.textContent = '💡 与行情价基本持平';
    } else if (diff > 0) {
      hint.className = 'compare-hint show high';
      hint.textContent = `⚠️ 比行情高 ${diff.toFixed(0)} 元 (+${diffPercent.toFixed(1)}%)`;
    } else {
      hint.className = 'compare-hint show low';
      hint.textContent = `✅ 比行情低 ${Math.abs(diff).toFixed(0)} 元 (${diffPercent.toFixed(1)}%)`;
    }
  }

  async function savePrice() {
    const catId = document.getElementById('price-category').value;
    const buyPrice = parseFloat(document.getElementById('price-buy').value);
    const sellPrice = parseFloat(document.getElementById('price-sell').value);
    const note = document.getElementById('price-note').value;

    if (!catId) { showToast('请选择品类'); return; }
    if (!buyPrice && !sellPrice) { showToast('请输入价格'); return; }

    const regionCode = await DB.getSetting('current_region', 'default');
    const now = new Date().toISOString();

    await DB.put('prices', {
      id: `user_${catId}_${Date.now()}`,
      category_id: catId,
      buy_price: buyPrice || 0,
      sell_price: sellPrice || 0,
      region_code: regionCode,
      source: 'user',
      source_detail: note || '我记的',
      recorded_at: now,
      created_at: now,
    });

    closeModal('modal-price');
    showToast('✅ 价格已保存');
    await renderMarket();
  }

  // ===== 弹窗：记账 =====
  function showLedgerModal() {
    const modal = document.getElementById('modal-ledger');
    // 清空输入
    document.getElementById('ledger-weight').value = '';
    document.getElementById('ledger-unit-price').value = '';
    document.getElementById('ledger-counterparty').value = '';
    document.getElementById('ledger-note').value = '';
    modal.classList.remove('hidden');
  }

  function setLedgerType(type) {
    ledgerType = type;
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
  }

  async function saveLedger() {
    const catId = document.getElementById('ledger-category').value;
    const weight = parseFloat(document.getElementById('ledger-weight').value);
    const unitPrice = parseFloat(document.getElementById('ledger-unit-price').value);
    const counterparty = document.getElementById('ledger-counterparty').value;
    const note = document.getElementById('ledger-note').value;

    if (!catId) { showToast('请选择品类'); return; }
    if (!weight || !unitPrice) { showToast('请输入重量和单价'); return; }

    const total = weight * unitPrice;
    const now = new Date().toISOString();

    await DB.put('ledger', {
      id: `ledger_${Date.now()}`,
      type: ledgerType,
      category_id: catId,
      weight: weight,
      unit_price: unitPrice,
      total: total,
      counterparty: counterparty || '',
      note: note || '',
      recorded_at: now,
      created_at: now,
    });

    closeModal('modal-ledger');
    showToast('✅ 记录已保存');
    await renderLedger();
  }

  // ===== 工具函数 =====
  function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2500);
  }

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
  }

  async function fillCategorySelects() {
    const categories = CATEGORIES;
    const priceSelect = document.getElementById('price-category');
    const ledgerSelect = document.getElementById('ledger-category');

    const options = categories.map(c => `<option value="${c.id}">${c.icon} ${c.name} (${c.unit})</option>`).join('');

    if (priceSelect && !priceSelect.options.length) {
      priceSelect.innerHTML = options;
    }
    if (ledgerSelect && !ledgerSelect.options.length) {
      ledgerSelect.innerHTML = options;
    }
  }

  async function refreshData() {
    showToast('🔄 正在刷新...');
    await renderMarket();
    await renderLedger();
    await Crawler.restoreStatusBar();
    showToast('✅ 已刷新');
  }

  // 监听价格输入变化
  document.addEventListener('input', (e) => {
    if (e.target.id === 'price-buy' || e.target.id === 'price-sell' || e.target.id === 'price-category') {
      if (!document.getElementById('modal-price').classList.contains('hidden')) {
        App.checkPriceCompare();
      }
    }
  });

  // 监听在线状态
  window.addEventListener('online', async () => {
    showToast('🌐 网络已恢复');
    const enabled = await DB.getSetting('crawler_enabled', true);
    if (enabled) {
      Crawler.runCrawl(false);
    }
  });

  window.addEventListener('offline', () => {
    showToast('📴 已离线 · 仍可查看历史数据');
  });

  // 点击弹窗背景关闭
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });

  // ESC 键关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(overlay => {
        overlay.classList.add('hidden');
      });
    }
  });

  return {
    init, switchTab, filterCategories, setFilter, toggleFavorite,
    showPriceDetail, showPriceModal, savePrice, checkPriceCompare,
    showLedgerModal, setLedgerType, saveLedger,
    closeModal, showToast, refreshData,
    renderMarket, renderLedger, renderTrendChart, setTrendPeriod,
    renderSettings, renderCrawlerStatus, updateSetting,
  };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
