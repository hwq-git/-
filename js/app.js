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
  let editingLedgerId = null;   // 正在编辑的记账记录ID
  let editingPriceId = null;    // 正在编辑的价格记录ID

  // ===== 初始化 =====
  async function init() {
    const loadingEl = document.getElementById('status-bar');
    function progress(msg) {
      console.log('[App]', msg);
      if (loadingEl) loadingEl.innerHTML = '<span class="status-dot"></span><span>' + msg + '</span>';
    }

    try {
      progress('初始化数据库...');
      await DB.init();

      progress('加载种子数据...');
      await initSeedData();

      // 立即从远程JSON加载最新行情（非阻塞，静默更新）
      Crawler.fetchRemotePrices().then(result => {
        if (result.success) {
          console.log('[App] 远程数据已加载:', result.count, '条');
          renderMarket();
        }
      }).catch(e => console.warn('[App] 远程数据加载失败:', e));

      progress('加载收藏...');
      await loadFavorites();

      progress('渲染行情...');
      await renderMarket();

      progress('渲染记账...');
      await renderLedger();

      progress('初始化趋势图...');
      await initTrendControls();

      progress('加载设置...');
      await renderSettings();

      await Crawler.restoreStatusBar();
      await Crawler.startScheduler();

      // 检查是否需要刷新数据（非阻塞）
      setTimeout(async () => {
        try {
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
        } catch (e) { console.warn('[App] 爬取检查失败:', e); }
      }, 1000);

      registerSW();
      await fillCategorySelects();
      console.log('[App] 初始化完成');
    } catch (e) {
      console.error('[App] 初始化失败:', e);
      if (loadingEl) loadingEl.innerHTML = '<span class="status-dot failed"></span><span>加载失败，请刷新页面</span>';
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
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    if (tabName === 'trends') {
      setTimeout(renderTrendChart, 100);
    }
    if (tabName === 'settings') {
      renderCrawlerStatus();
      renderUserPrices();
    }
  }

  // ===== 行情页 =====
  async function renderMarket() {
    const listEl = document.getElementById('price-list');
    if (!listEl) return;

    const categories = await DB.getAll('categories');
    const subCategories = categories
      .filter(c => c.parent_id)
      .filter(c => !currentFilter || c.parent_id === currentFilter)
      .filter(c => !currentSearch || c.name.includes(currentSearch))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

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

      const history = await DB.getPriceHistory(cat.id, 7, regionCode);
      const prevPrice = history.length >= 2 ? history[history.length - 2] : null;
      const change = prevPrice ? ((latest.buy_price + latest.sell_price) / 2) - ((prevPrice.buy_price + prevPrice.sell_price) / 2) : 0;
      const changePercent = prevPrice ? (change / ((prevPrice.buy_price + prevPrice.sell_price) / 2) * 100) : 0;

      const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
      const changeIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      const changeText = change === 0 ? '持平' : `${changeIcon} ${Math.abs(change).toFixed(0)} (${Math.abs(changePercent).toFixed(1)}%)`;

      // ✅ 增强：显示具体数据来源
      const sourceMap = {
        crawler: { tag: '🕷️', label: latest.source_detail || '爬虫', class: 'crawler' },
        simulated: { tag: '📊', label: latest.source_detail || '模拟', class: 'simulated' },
        user: { tag: '✏️', label: '我记的', class: 'user' },
        share: { tag: '👥', label: '分享', class: 'share' },
        seed: { tag: '📦', label: '参考', class: 'seed' },
      };
      const src = sourceMap[latest.source] || sourceMap.seed;

      const isFav = favoriteIds.has(cat.id);
      const timeAgo = getTimeAgo(latest.recorded_at);
      const isTonUnit = cat.unit === '元/吨';

      const buyPriceHtml = isTonUnit
        ? `<div class="price-value ${changeClass}">${latest.buy_price.toLocaleString()}<span class="price-unit-ton">元/吨</span></div>
           <div class="price-kg">≈ ${(latest.buy_price / 1000).toFixed(2)} 元/kg</div>`
        : `<div class="price-value ${changeClass}">${latest.buy_price.toLocaleString()}<span class="price-unit-ton">${cat.unit}</span></div>`;

      const sellPriceHtml = isTonUnit
        ? `<div class="price-value ${changeClass}">${latest.sell_price.toLocaleString()}<span class="price-unit-ton">元/吨</span></div>
           <div class="price-kg">≈ ${(latest.sell_price / 1000).toFixed(2)} 元/kg</div>`
        : `<div class="price-value ${changeClass}">${latest.sell_price.toLocaleString()}<span class="price-unit-ton">${cat.unit}</span></div>`;

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
              ${buyPriceHtml}
            </div>
            <div class="price-item">
              <div class="price-label">卖出价</div>
              ${sellPriceHtml}
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

  // 价格详情
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
      const isTon = cat?.unit === '元/吨';
      const unitDisplay = cat?.unit?.replace('元/', '') || 'kg';
      const kgPrice = isTon && r.unit_price ? (r.unit_price / 1000).toFixed(2) : null;

      items.push(`
        <div class="ledger-item">
          <div class="type-icon ${r.type}">${typeIcon}</div>
          <div class="info">
            <div class="title">${catIcon} ${catName} · ${typeLabel}</div>
            <div class="sub">${r.weight}${unitDisplay} × ¥${r.unit_price?.toLocaleString() || 0}/吨${kgPrice ? ` <span class="kg-price">(≈ ${kgPrice} 元/kg)</span>` : ''}${r.counterparty ? ' · ' + r.counterparty : ''} · ${time}</div>
          </div>
          <div class="amount ${r.type}">${r.type === 'buy' ? '-' : '+'}¥${total.toLocaleString()}</div>
          <div class="item-actions">
            <button class="icon-btn-sm edit-btn" onclick="event.stopPropagation(); App.editLedger('${r.id}')" title="编辑">✏️</button>
            <button class="icon-btn-sm del-btn" onclick="event.stopPropagation(); App.deleteLedger('${r.id}')" title="删除">🗑️</button>
          </div>
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

    const enabledEl = document.getElementById('setting-crawler-enabled');
    if (enabledEl) enabledEl.checked = crawlerEnabled;

    const wifiEl = document.getElementById('setting-wifi-only');
    if (wifiEl) wifiEl.checked = wifiOnly;

    const intervalEl = document.getElementById('setting-interval');
    if (intervalEl) intervalEl.value = interval;

    await renderCrawlerStatus();
    await renderUserPrices();
  }

  // 渲染手动录入的价格记录
  async function renderUserPrices() {
    const el = document.getElementById('user-prices-list');
    if (!el) return;

    const allPrices = await DB.getAll('prices');
    const userPrices = allPrices
      .filter(p => p.source === 'user')
      .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));

    if (userPrices.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#888;padding:16px;font-size:14px;">暂无手动录入的价格记录</div>';
      return;
    }

    let html = '';
    for (const p of userPrices.slice(0, 30)) {
      const cat = allCategories.find(c => c.id === p.category_id) || CATEGORIES.find(c => c.id === p.category_id);
      const catName = cat ? `${cat.icon || '📋'} ${cat.name}` : '未知品类';
      const time = new Date(p.recorded_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      html += `
        <div class="user-price-item">
          <div class="user-price-info">
            <div class="user-price-name">${catName}</div>
            <div class="user-price-values">
              ${p.buy_price ? `<span>收: ¥${p.buy_price.toLocaleString()}</span>` : ''}
              ${p.buy_price && p.sell_price ? '<span class="sep">|</span>' : ''}
              ${p.sell_price ? `<span>卖: ¥${p.sell_price.toLocaleString()}</span>` : ''}
            </div>
            <div class="user-price-time">${p.source_detail || ''} · ${time}</div>
          </div>
          <div class="item-actions">
            <button class="icon-btn-sm edit-btn" onclick="App.editUserPrice('${p.id}')" title="编辑">✏️</button>
            <button class="icon-btn-sm del-btn" onclick="App.deleteUserPrice('${p.id}')" title="删除">🗑️</button>
          </div>
        </div>
      `;
    }

    el.innerHTML = html;
  }

  // ✅ 增强：爬虫状态展示，新增错误详情面板
  // 数据状态展示（简化版）
  async function renderCrawlerStatus() {
    const el = document.getElementById('crawler-status-detail');
    if (!el) return;

    const lastCrawl = await DB.getSetting('last_crawl_at', null);
    const lastStatus = await DB.getSetting('last_crawl_status', null);

    const statusMap = {
      success: { text: '✅ 正常', class: 'ok' },
      simulated: { text: '✅ 行情数据', class: 'ok' },
      failed: { text: '⚠️ 失败', class: 'err' },
      skipped: { text: '⏭️ 跳过', class: 'err' },
    };
    const statusInfo = lastStatus ? statusMap[lastStatus] || { text: lastStatus, class: '' } : { text: '待初始化', class: '' };

    const allPrices = await DB.getAll('prices');
    const userCount = allPrices.filter(p => p.source === 'user').length;
    const realCount = allPrices.filter(p => p.source === 'crawler').length;
    const simCount = allPrices.filter(p => p.source === 'simulated' || p.source === 'seed').length;

    el.innerHTML = `
      <div class="crawler-status-item">
        <span class="label">上次更新</span>
        <span class="value">${lastCrawl ? new Date(lastCrawl).toLocaleString('zh-CN') : '从未'}</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">数据状态</span>
        <span class="value ${statusInfo.class}">${statusInfo.text}</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">手动录入</span>
        <span class="value">${userCount} 条</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">🕷️ 真实行情</span>
        <span class="value" style="color:var(--primary);">${realCount} 条</span>
      </div>
      <div class="crawler-status-item">
        <span class="label">📊 模拟行情</span>
        <span class="value" style="color:#ef6c00;">${simCount} 条</span>
      </div>
    `;
  }

  async function updateSetting(key, value) {
    await DB.setSetting(key, value);
    showToast('✅ 设置已保存');

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
    editingPriceId = null;
    document.getElementById('modal-price').querySelector('.modal-header h3').textContent = '✏️ 录入成交价';
    const modal = document.getElementById('modal-price');
    const select = document.getElementById('price-category');

    if (!select.options.length) {
      await fillCategorySelects();
    }

    if (categoryId) {
      select.value = categoryId;
    }

    document.getElementById('price-buy').value = '';
    document.getElementById('price-sell').value = '';
    document.getElementById('price-note').value = '';
    document.getElementById('price-compare-hint').classList.remove('show');
    const kgHint = document.getElementById('price-kg-hint');
    if (kgHint) { kgHint.innerHTML = ''; kgHint.classList.remove('show'); }

    modal.classList.remove('hidden');

    if (select.value) {
      await checkPriceCompare();
    }
  }

  async function editUserPrice(id) {
    const record = await DB.get('prices', id);
    if (!record) { showToast('记录不存在'); return; }

    editingPriceId = id;
    document.getElementById('modal-price').querySelector('.modal-header h3').textContent = '✏️ 编辑成交价';
    const select = document.getElementById('price-category');
    if (!select.options.length) await fillCategorySelects();
    select.value = record.category_id;
    document.getElementById('price-buy').value = record.buy_price || '';
    document.getElementById('price-sell').value = record.sell_price || '';
    document.getElementById('price-note').value = record.source_detail || '';
    document.getElementById('price-compare-hint').classList.remove('show');
    const kgHint = document.getElementById('price-kg-hint');
    if (kgHint) { kgHint.innerHTML = ''; kgHint.classList.remove('show'); }
    document.getElementById('modal-price').classList.remove('hidden');
    showPriceKgHint();
  }

  async function deleteUserPrice(id) {
    if (!confirm('确定要删除这条价格记录吗？此操作不可撤销。')) return;
    await DB.deleteItem('prices', id);
    showToast('🗑️ 价格记录已删除');
    await renderMarket();
    await renderUserPrices();
  }

  function showPriceKgHint() {
    const buyInput = document.getElementById('price-buy');
    const sellInput = document.getElementById('price-sell');
    const hint = document.getElementById('price-kg-hint');
    if (!hint) return;

    const buyVal = parseFloat(buyInput?.value);
    const sellVal = parseFloat(sellInput?.value);

    if (!buyVal && !sellVal) {
      hint.classList.remove('show');
      return;
    }

    let text = '';
    if (buyVal) text += `收购: ≈ ${(buyVal / 1000).toFixed(2)} 元/kg`;
    if (buyVal && sellVal) text += '&nbsp;&nbsp;|&nbsp;&nbsp;';
    if (sellVal) text += `卖出: ≈ ${(sellVal / 1000).toFixed(2)} 元/kg`;

    hint.innerHTML = text;
    hint.className = 'compare-hint show';
  }

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

    if (editingPriceId) {
      // 编辑模式
      const existing = await DB.get('prices', editingPriceId);
      await DB.put('prices', {
        ...existing,
        category_id: catId,
        buy_price: buyPrice || 0,
        sell_price: sellPrice || 0,
        source_detail: note || existing.source_detail || '我记的',
      });
      showToast('✅ 价格已更新');
    } else {
      // 新建模式
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
      showToast('✅ 价格已保存');
    }

    editingPriceId = null;
    closeModal('modal-price');
    await renderMarket();
    await renderUserPrices();
  }

  // ===== 弹窗：记账 =====
  function showLedgerModal() {
    editingLedgerId = null;
    document.getElementById('modal-ledger').querySelector('.modal-header h3').textContent = '📋 新建记录';
    const modal = document.getElementById('modal-ledger');
    document.getElementById('ledger-weight').value = '';
    document.getElementById('ledger-unit-price').value = '';
    document.getElementById('ledger-counterparty').value = '';
    document.getElementById('ledger-note').value = '';
    const jinHint = document.getElementById('ledger-jin-hint');
    if (jinHint) { jinHint.innerHTML = ''; jinHint.classList.remove('show'); }
    setLedgerType('buy');
    modal.classList.remove('hidden');
  }

  async function editLedger(id) {
    const record = await DB.get('ledger', id);
    if (!record) { showToast('记录不存在'); return; }

    editingLedgerId = id;
    document.getElementById('modal-ledger').querySelector('.modal-header h3').textContent = '✏️ 编辑记录';
    setLedgerType(record.type);
    document.getElementById('ledger-category').value = record.category_id;
    document.getElementById('ledger-weight').value = record.weight;
    document.getElementById('ledger-unit-price').value = record.unit_price;
    document.getElementById('ledger-counterparty').value = record.counterparty || '';
    document.getElementById('ledger-note').value = record.note || '';
    document.getElementById('modal-ledger').classList.remove('hidden');
    showLedgerJinHint();
  }

  async function deleteLedger(id) {
    if (!confirm('确定要删除这条记录吗？此操作不可撤销。')) return;
    await DB.deleteItem('ledger', id);
    showToast('🗑️ 记录已删除');
    await renderLedger();
  }

  function showLedgerJinHint() {
    const input = document.getElementById('ledger-unit-price');
    const hint = document.getElementById('ledger-jin-hint');
    if (!hint) return;
    const val = parseFloat(input?.value);
    if (!val) { hint.classList.remove('show'); return; }
    hint.innerHTML = `≈ ${(val / 1000).toFixed(2)} 元/kg`;
    hint.className = 'compare-hint show';
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

    if (editingLedgerId) {
      // 编辑模式：保留原有 id 和 created_at
      const existing = await DB.get('ledger', editingLedgerId);
      await DB.put('ledger', {
        ...existing,
        type: ledgerType,
        category_id: catId,
        weight: weight,
        unit_price: unitPrice,
        total: total,
        counterparty: counterparty || '',
        note: note || '',
      });
      showToast('✅ 记录已更新');
    } else {
      // 新建模式
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
      showToast('✅ 记录已保存');
    }

    editingLedgerId = null;
    closeModal('modal-ledger');
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

    // ===== 站点认证管理 =====
  let currentAuthConfigId = null;

  async function showAuthModal(configId) {
    currentAuthConfigId = configId;
    const configs = await DB.getAll('crawler_configs');
    const config = configs.find(c => c.id === configId);
    if (!config) return;

    let authInfo = { required: false, fields: [] };
    try { authInfo = JSON.parse(config.auth || '{}'); } catch (e) {}

    let userAuth = {};
    try { userAuth = JSON.parse(config.user_auth || '{}'); } catch (e) {}

    const body = document.getElementById('auth-modal-body');
    let html = `
      <div style="margin-bottom:12px;padding:10px;background:#f5f6f8;border-radius:8px;">
        <div style="font-weight:600;">${config.website_name}</div>
        <div style="font-size:13px;color:#666;margin-top:4px;">${config.base_url}</div>
        ${authInfo.required ? `<div style="font-size:12px;color:#e53935;margin-top:4px;">⚠️ ${authInfo.description}</div>` : ''}
      </div>
    `;

    if (!authInfo.required) {
      html += '<div style="text-align:center;color:#666;padding:20px;">该站点无需认证</div>';
    } else {
      for (const field of (authInfo.fields || [])) {
        const val = userAuth[field.key] || '';
        if (field.type === 'textarea') {
          html += `
            <div class="form-group">
              <label>${field.label}</label>
              <textarea id="auth-${field.key}" rows="3" placeholder="${field.placeholder || ''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;">${val}</textarea>
            </div>
          `;
        } else {
          html += `
            <div class="form-group">
              <label>${field.label}</label>
              <input type="text" id="auth-${field.key}" value="${val}" placeholder="${field.placeholder || ''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
            </div>
          `;
        }
      }

      html += `
        <div style="margin-top:12px;font-size:12px;color:#888;line-height:1.6;">
          💡 <strong>如何获取？</strong><br>
          1. 用电脑浏览器打开目标网站并登录<br>
          2. F12 → Network → 刷新页面 → 任意请求右键 Copy → Copy as cURL (bash)<br>
          3. 提取 Cookie / Token 填入上方
        </div>
      `;
    }

    body.innerHTML = html;
    document.getElementById('modal-auth').classList.remove('hidden');
  }

  async function saveAuth() {
    if (!currentAuthConfigId) return;
    const configs = await DB.getAll('crawler_configs');
    const config = configs.find(c => c.id === currentAuthConfigId);
    if (!config) return;

    let authInfo = { required: false, fields: [] };
    try { authInfo = JSON.parse(config.auth || '{}'); } catch (e) {}

    const userAuth = {};
    if (authInfo.fields) {
      for (const field of authInfo.fields) {
        const el = document.getElementById(`auth-${field.key}`);
        if (el && el.value.trim()) {
          userAuth[field.key] = el.value.trim();
        }
      }
    }

    await DB.put('crawler_configs', {
      ...config,
      user_auth: JSON.stringify(userAuth),
    });

    closeModal('modal-auth');
    showToast('✅ 认证信息已保存');
    await renderCrawlerStatus();
  }

  async function testAuth() {
    if (!currentAuthConfigId) return;
    showToast('🧪 正在测试连接...');

    const configs = await DB.getAll('crawler_configs');
    const config = configs.find(c => c.id === currentAuthConfigId);
    if (!config) return;

    // 解析认证配置
    let siteAuth = null;
    try { siteAuth = JSON.parse(config.auth || '{}'); } catch (e) {}

    // 解析用户填入的认证信息
    let userAuth = {};
    try { userAuth = JSON.parse(config.user_auth || '{}'); } catch (e) {}

    const customHeaders = { ...userAuth };

    // 调用 fetchPage 测试（传入 authConfig 以增强登录检测）
    const result = await Crawler._testFetchPage(config.base_url, customHeaders, siteAuth);

    if (result.success) {
      showToast('✅ 连接成功！可以正常抓取');
    } else if (result.errorDetail && /登录页/.test(result.errorDetail)) {
      showToast('❌ 返回登录页，Cookie 可能已失效，请去"设置→站点认证"更新');
    } else {
      showToast('❌ 连接失败: ' + (result.errorDetail || '未知错误').slice(0, 50));
    }
  }

  return {
    init, switchTab, filterCategories, setFilter, toggleFavorite,
    showPriceDetail, showPriceModal, savePrice, checkPriceCompare,
    showLedgerModal, setLedgerType, saveLedger,
    closeModal, showToast, refreshData,
    renderMarket, renderLedger, renderTrendChart, setTrendPeriod,
    renderSettings, renderCrawlerStatus, updateSetting,
    showAuthModal, saveAuth, testAuth,
    showPriceKgHint,
    editLedger, deleteLedger, editUserPrice, deleteUserPrice,
    showLedgerJinHint,
  };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});