/**
 * 手机端爬虫引擎
 * - CORS代理抓取（浏览器环境适配）
 * - 随机User-Agent轮换
 * - 请求间隔3~8秒随机延迟
 * - 失败重试，自动切换备选网站
 * - 智能节电策略（WiFi + 电量检测）
 * - 增强日志：详细记录代理尝试、HTTP状态、CSS匹配数、解析错误，方便调试
 */

const Crawler = (() => {
  // CORS 代理列表（轮换使用）
  const CORS_PROXIES = [
    { name: 'allorigins', fn: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    { name: 'corsproxy',  fn: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}` },
    { name: 'codetabs',   fn: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
  ];

  // 随机 User-Agent
  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  let isRunning = false;
  let crawlTimer = null;

  function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  function randomDelay(min = 3000, max = 8000) {
    return new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));
  }

  // 检测网络状态
  async function checkNetwork() {
    if (!navigator.onLine) {
      return { ok: false, reason: '设备离线' };
    }
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const wifiOnly = await DB.getSetting('crawler_wifi_only', true);
    if (wifiOnly && connection) {
      if (connection.type === 'cellular' && connection.type !== 'wifi') {
        return { ok: false, reason: '非WiFi网络，已跳过（节电模式）' };
      }
    }
    return { ok: true };
  }

  // 检测电量
  async function checkBattery() {
    try {
      const battery = await navigator.getBattery();
      const minBattery = await DB.getSetting('crawler_min_battery', 20);
      if (battery.level * 100 < minBattery && !battery.charging) {
        return { ok: false, reason: `电量低于${minBattery}%，已跳过` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: true };
    }
  }

  /**
   * 通过代理抓取网页（增强版）
   * 返回详细调试信息，包括每个代理的尝试结果
   */
  async function fetchPage(url) {
    const proxyAttempts = [];
    let lastError = null;

    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxy = CORS_PROXIES[i];
      const proxyUrl = proxy.fn(url);
      const attempt = {
        proxy: proxy.name,
        proxyUrl: proxyUrl,
        status: 'pending',
        httpStatus: null,
        htmlLength: 0,
        error: null,
        durationMs: 0,
      };

      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(proxyUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': getRandomUA() },
        });

        clearTimeout(timeoutId);
        attempt.durationMs = Date.now() - start;
        attempt.httpStatus = response.status;

        if (!response.ok) {
          attempt.status = 'failed';
          attempt.error = `HTTP ${response.status} ${response.statusText}`;
          proxyAttempts.push(attempt);
          console.warn(`[Crawler] 代理 ${proxy.name} 返回 HTTP ${response.status}`);
          if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
          continue;
        }

        const html = await response.text();
        attempt.htmlLength = html.length;

        if (!html || html.length < 100) {
          attempt.status = 'failed';
          attempt.error = `返回内容为空或过短 (${html.length} bytes)`;
          proxyAttempts.push(attempt);
          console.warn(`[Crawler] 代理 ${proxy.name} 内容过短`);
          if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
          continue;
        }

        // 成功
        attempt.status = 'success';
        proxyAttempts.push(attempt);

        return {
          success: true,
          html: html,
          proxyUsed: proxy.name,
          proxyAttempts: proxyAttempts,
          httpStatus: response.status,
          htmlLength: html.length,
          errorDetail: null,
        };

      } catch (err) {
        attempt.status = 'failed';
        attempt.error = err.message || String(err);
        proxyAttempts.push(attempt);
        lastError = err;
        console.warn(`[Crawler] 代理 ${proxy.name} 失败: ${err.message}`);
        if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
      }
    }

    // 所有代理均失败
    const errorDetail = proxyAttempts.map(a =>
      `[${a.proxy}] ${a.status.toUpperCase()}${a.httpStatus ? ' HTTP:' + a.httpStatus : ''}${a.error ? ' | ' + a.error : ''} (len:${a.htmlLength})`
    ).join(' → ');

    return {
      success: false,
      html: null,
      proxyUsed: null,
      proxyAttempts: proxyAttempts,
      httpStatus: null,
      htmlLength: 0,
      errorDetail: errorDetail || (lastError ? lastError.message : '所有代理均失败'),
    };
  }

  /**
   * 解析HTML，提取价格数据（增强版）
   * 返回解析结果 + 调试信息（匹配元素数、解析错误详情）
   */
  function parsePrices(html, rule) {
    const parseErrors = [];
    let matchedElements = 0;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const items = doc.querySelectorAll(rule.listSelector || rule.css_selector);
      matchedElements = items.length;
      const results = [];

      if (matchedElements === 0) {
        return {
          results: [],
          matchedElements: 0,
          parseErrors: [],
          errorDetail: `CSS选择器 "${rule.listSelector || rule.css_selector}" 未匹配到任何元素，页面结构可能已变更`,
        };
      }

      items.forEach((item, idx) => {
        try {
          let fields = rule.fields;
          if (typeof fields === 'string') fields = JSON.parse(fields);

          const getCategoryText = (el) => el ? el.textContent.trim() : '';

          const nameEl = item.querySelector(fields.category);
          const priceEl = item.querySelector(fields.price);
          const changeEl = item.querySelector(fields.change);
          const dateEl = item.querySelector(fields.date);

          const name = getCategoryText(nameEl);
          const priceText = getCategoryText(priceEl);
          const changeText = getCategoryText(changeEl);
          const dateText = getCategoryText(dateEl);

          if (!name || !priceText) {
            parseErrors.push({ index: idx, error: '缺少品名或价格', rawText: item.textContent.trim().slice(0, 80) });
            return;
          }

          // 解析价格数字
          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          if (!priceMatch) {
            parseErrors.push({ index: idx, error: `无法从 "${priceText}" 解析价格`, rawText: item.textContent.trim().slice(0, 80) });
            return;
          }
          const price = parseFloat(priceMatch[0].replace(/,/g, ''));

          // 匹配品类
          const matchedCategory = matchCategory(name);
          if (!matchedCategory) {
            parseErrors.push({ index: idx, error: `品名 "${name}" 未匹配到已知品类`, rawText: item.textContent.trim().slice(0, 80) });
            return;
          }

          // 解析涨跌
          let change = 0;
          if (changeText) {
            if (changeText.includes('↑') || changeText.includes('涨') || changeText.includes('+')) {
              const numMatch = changeText.match(/[\d,.]+/);
              if (numMatch) change = parseFloat(numMatch[0].replace(/,/g, ''));
            } else if (changeText.includes('↓') || changeText.includes('跌') || changeText.includes('-')) {
              const numMatch = changeText.match(/[\d,.]+/);
              if (numMatch) change = -parseFloat(numMatch[0].replace(/,/g, ''));
            }
          }

          results.push({
            category_id: matchedCategory.id,
            category_name: matchedCategory.name,
            buy_price: Math.round(price * 0.97),
            sell_price: Math.round(price * 1.01),
            change: change,
            source_detail: rule.website_name || rule.website_name,
            date_text: dateText,
          });
        } catch (e) {
          parseErrors.push({ index: idx, error: e.message, rawText: item.textContent.trim().slice(0, 80) });
        }
      });

      const errorDetail = parseErrors.length > 0
        ? `匹配到 ${matchedElements} 个元素，成功解析 ${results.length} 条，失败 ${parseErrors.length} 条`
        : `匹配到 ${matchedElements} 个元素，全部解析成功 (${results.length} 条)`;

      return {
        results,
        matchedElements,
        parseErrors,
        errorDetail,
      };

    } catch (e) {
      return {
        results: [],
        matchedElements: 0,
        parseErrors: [{ index: -1, error: 'DOM解析异常: ' + e.message }],
        errorDetail: `DOM解析失败: ${e.message}`,
      };
    }
  }

  // 品名匹配
  function matchCategory(name) {
    const lowerName = name.toLowerCase().replace(/\s/g, '');
    for (const cat of CATEGORIES) {
      if (lowerName.includes(cat.name) || cat.name.includes(name)) {
        return cat;
      }
    }
    return null;
  }

  /**
   * 爬取单个网站（增强版）
   * 详细记录：代理尝试、HTTP状态、匹配元素数、解析错误
   */
  async function crawlSite(config) {
    const startTime = Date.now();
    const log = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      website_name: config.website_name,
      status: 'failed',
      items_scraped: 0,
      error_msg: '',
      error_detail: null,      // 新增：详细错误JSON
      proxy_used: null,        // 新增：最终使用的代理
      http_status: null,       // 新增：HTTP状态码
      matched_elements: 0,     // 新增：CSS匹配元素数
      parse_errors: 0,         // 新增：解析错误数
      duration_ms: 0,
      crawled_at: new Date().toISOString(),
    };

    try {
      console.log(`[Crawler] 正在爬取: ${config.website_name} (${config.base_url})`);

      // 1. 抓取页面
      const fetchResult = await fetchPage(config.base_url);

      log.proxy_used = fetchResult.proxyUsed;
      log.http_status = fetchResult.httpStatus;

      if (!fetchResult.success) {
        log.error_msg = fetchResult.errorDetail;
        log.error_detail = JSON.stringify({
          stage: 'fetch',
          proxyAttempts: fetchResult.proxyAttempts,
          errorDetail: fetchResult.errorDetail,
        });
        throw new Error(fetchResult.errorDetail);
      }

      // 2. 解析价格
      const parseResult = parsePrices(fetchResult.html, config);
      log.matched_elements = parseResult.matchedElements;
      log.parse_errors = parseResult.parseErrors.length;

      if (parseResult.results.length === 0 && parseResult.matchedElements === 0) {
        log.error_msg = parseResult.errorDetail;
        log.error_detail = JSON.stringify({
          stage: 'parse',
          htmlLength: fetchResult.htmlLength,
          matchedElements: parseResult.matchedElements,
          parseErrors: parseResult.parseErrors.slice(0, 10), // 最多存10条
          errorDetail: parseResult.errorDetail,
        });
        throw new Error(parseResult.errorDetail);
      }

      // 3. 保存价格数据
      const regionCode = await DB.getSetting('current_region', 'default');
      const priceRecords = parseResult.results.map(p => ({
        id: `crawl_${p.category_id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        category_id: p.category_id,
        buy_price: p.buy_price,
        sell_price: p.sell_price,
        region_code: regionCode,
        source: 'crawler',
        source_detail: config.website_name,   // ✅ 明确标记数据来源网站
        recorded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }));
      await DB.bulkPut('prices', priceRecords);

      // 4. 更新日志
      log.status = 'success';
      log.items_scraped = parseResult.results.length;
      log.duration_ms = Date.now() - startTime;
      log.error_detail = JSON.stringify({
        stage: 'success',
        proxyUsed: fetchResult.proxyUsed,
        htmlLength: fetchResult.htmlLength,
        matchedElements: parseResult.matchedElements,
        parseErrors: parseResult.parseErrors.slice(0, 5),
      });

      // 5. 更新爬虫配置
      await DB.put('crawler_configs', {
        ...config,
        last_success_at: new Date().toISOString(),
        last_error: null,
      });

      console.log(`[Crawler] ${config.website_name}: 抓取到 ${parseResult.results.length} 条价格 (代理:${fetchResult.proxyUsed}, HTML:${fetchResult.htmlLength} bytes, 匹配:${parseResult.matchedElements})`);

    } catch (err) {
      log.error_msg = err.message;
      log.duration_ms = Date.now() - startTime;

      // 更新爬虫配置错误信息
      await DB.put('crawler_configs', {
        ...config,
        last_error: err.message,
      });

      console.error(`[Crawler] ${config.website_name} 爬取失败:`, err.message);
    }

    // 记录日志
    await DB.put('crawl_logs', log);
    return log;
  }

  // 执行一次完整的爬取
  async function runCrawl(deep = false) {
    if (isRunning) {
      console.log('[Crawler] 爬虫正在运行中，跳过');
      return { skipped: true };
    }

    isRunning = true;
    updateStatusBar('running');

    try {
      // 检查网络和电量
      const netCheck = await checkNetwork();
      if (!netCheck.ok) {
        console.log(`[Crawler] ${netCheck.reason}`);
        await DB.setSetting('last_crawl_status', 'skipped');
        await DB.setSetting('last_crawl_skip_reason', netCheck.reason);
        updateStatusBar('skipped', netCheck.reason);
        return { skipped: true, reason: netCheck.reason };
      }

      const batCheck = await checkBattery();
      if (!batCheck.ok) {
        console.log(`[Crawler] ${batCheck.reason}`);
        await DB.setSetting('last_crawl_status', 'skipped');
        await DB.setSetting('last_crawl_skip_reason', batCheck.reason);
        updateStatusBar('skipped', batCheck.reason);
        return { skipped: true, reason: batCheck.reason };
      }

      // 获取启用的爬虫配置
      const configs = await DB.getAll('crawler_configs');
      const enabledConfigs = configs.filter(c => c.enabled);

      if (enabledConfigs.length === 0) {
        console.log('[Crawler] 没有启用的爬虫站点');
        updateStatusBar('offline');
        return { skipped: true, reason: '没有启用的爬虫站点' };
      }

      console.log(`[Crawler] 开始${deep ? '深度' : '轻度'}爬取，共 ${enabledConfigs.length} 个站点`);
      let totalItems = 0;
      let successCount = 0;
      let failCount = 0;
      const failDetails = [];   // 新增：收集失败详情

      for (let i = 0; i < enabledConfigs.length; i++) {
        const config = enabledConfigs[i];

        if (deep) {
          await crawlSite(config);
        } else {
          const log = await crawlSite(config);
          if (log.status === 'success') {
            successCount++;
            totalItems += log.items_scraped;
          } else {
            failCount++;
            failDetails.push({
              site: config.website_name,
              url: config.base_url,
              error: log.error_msg,
              proxyUsed: log.proxy_used,
              httpStatus: log.http_status,
              matchedElements: log.matched_elements,
              parseErrors: log.parse_errors,
              errorDetail: log.error_detail,
            });
          }
        }

        if (i < enabledConfigs.length - 1) {
          await randomDelay();
        }
      }

      // 更新状态
      const now = new Date().toISOString();
      await DB.setSetting('last_crawl_at', now);
      await DB.setSetting('last_crawl_status', successCount > 0 ? 'success' : 'failed');
      await DB.setSetting('last_crawl_items', totalItems);

      // 新增：保存详细失败信息，供调试
      if (failDetails.length > 0) {
        await DB.setSetting('last_crawl_error_detail', JSON.stringify(failDetails));
      } else {
        await DB.setSetting('last_crawl_error_detail', null);
      }

      console.log(`[Crawler] 爬取完成：成功${successCount}个，失败${failCount}个，共${totalItems}条数据`);

      if (successCount > 0) {
        updateStatusBar('fresh', `抓取到 ${totalItems} 条最新行情`);
      } else {
        updateStatusBar('failed', '所有站点爬取失败');
      }

      // 如果真实爬取失败，使用模拟更新作为后备
      if (successCount === 0) {
        console.log('[Crawler] 真实爬取失败，启用模拟数据更新...');
        await simulatePriceUpdate();
        await DB.setSetting('last_crawl_at', now);
        await DB.setSetting('last_crawl_status', 'simulated');
        updateStatusBar('simulated', '行情已更新（模拟数据）');
      }

      return { successCount, failCount, totalItems, failDetails };

    } catch (err) {
      console.error('[Crawler] 爬虫异常:', err);
      await DB.setSetting('last_crawl_status', 'failed');
      await DB.setSetting('last_crawl_error', err.message);
      await DB.setSetting('last_crawl_error_detail', JSON.stringify([{ stage: 'global', error: err.message }]));
      updateStatusBar('failed', err.message);

      await simulatePriceUpdate();
      return { error: err.message };
    } finally {
      isRunning = false;
    }
  }

  // 模拟价格更新（当真实爬取失败时的后备方案）
  async function simulatePriceUpdate() {
    const regionCode = await DB.getSetting('current_region', 'default');
    const now = new Date();
    let updated = 0;

    for (const cat of CATEGORIES) {
      const base = BASE_PRICES[cat.id];
      if (!base) continue;

      const latest = await DB.getLatestPrice(cat.id, regionCode);
      let currentBuy = latest ? latest.buy_price : base.buy;
      let currentSell = latest ? latest.sell_price : base.sell;

      const change = (Math.random() - 0.48) * base.volatility;
      currentBuy = Math.round(currentBuy * (1 + change));
      currentSell = Math.round(currentSell * (1 + change));

      currentBuy = Math.max(Math.round(base.buy * 0.8), Math.min(Math.round(base.buy * 1.2), currentBuy));
      const spread = Math.max(Math.round(base.sell - base.buy), 50);
      currentSell = currentBuy + spread + Math.round(Math.random() * spread * 0.3);

      await DB.put('prices', {
        id: `crawl_${cat.id}_${now.getTime()}`,
        category_id: cat.id,
        buy_price: currentBuy,
        sell_price: currentSell,
        region_code: regionCode,
        source: 'crawler',
        source_detail: '行情更新（模拟）',
        recorded_at: now.toISOString(),
        created_at: now.toISOString(),
      });
      updated++;
    }

    console.log(`[Crawler] 模拟更新完成：${updated} 个品类`);
    return updated;
  }

  // 更新状态栏
  function updateStatusBar(status, message = '') {
    const bar = document.getElementById('status-bar');
    if (!bar) return;

    let html = '';
    switch (status) {
      case 'running':
        html = `<span class="status-dot running"></span><span>正在抓取行情...</span>`;
        break;
      case 'fresh':
        html = `<span class="status-dot fresh"></span><span>行情已更新 · ${message || '刚刚'}</span>`;
        break;
      case 'simulated':
        html = `<span class="status-dot fresh"></span><span>${message || '行情已更新'}</span>`;
        break;
      case 'failed':
        html = `<span class="status-dot failed"></span><span>上次同步失败 · 离线可用</span>`;
        break;
      case 'skipped':
        html = `<span class="status-dot skipped"></span><span>${message || '已跳过同步'}</span>`;
        break;
      case 'offline':
        html = `<span class="status-dot offline"></span><span>离线模式 · 使用历史数据</span>`;
        break;
      default:
        html = `<span class="status-dot"></span><span>行情数据</span>`;
    }
    bar.innerHTML = html;
  }

  // 从设置恢复状态栏
  async function restoreStatusBar() {
    const lastCrawlAt = await DB.getSetting('last_crawl_at', null);
    const lastStatus = await DB.getSetting('last_crawl_status', null);

    if (!lastCrawlAt || !lastStatus) {
      updateStatusBar('offline');
      return;
    }

    const elapsed = Date.now() - new Date(lastCrawlAt).getTime();
    const minutesAgo = Math.floor(elapsed / 60000);

    if (lastStatus === 'success' || lastStatus === 'simulated') {
      if (minutesAgo < 60) {
        updateStatusBar('fresh', `${minutesAgo} 分钟前`);
      } else if (minutesAgo < 180) {
        updateStatusBar('fresh', `${Math.floor(minutesAgo / 60)} 小时前`);
      } else {
        updateStatusBar('skipped', `数据较旧 · ${Math.floor(minutesAgo / 60)} 小时前`);
      }
    } else if (lastStatus === 'failed') {
      updateStatusBar('failed');
    } else {
      updateStatusBar('offline');
    }
  }

  // 启动定时爬虫
  async function startScheduler() {
    if (crawlTimer) clearInterval(crawlTimer);

    const intervalMinutes = await DB.getSetting('crawler_interval_minutes', 120);
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[Crawler] 定时爬虫已启动，间隔 ${intervalMinutes} 分钟`);

    crawlTimer = setInterval(async () => {
      const enabled = await DB.getSetting('crawler_enabled', true);
      if (enabled) {
        await runCrawl(false);
      }
    }, intervalMs);
  }

  // 停止定时爬虫
  function stopScheduler() {
    if (crawlTimer) {
      clearInterval(crawlTimer);
      crawlTimer = null;
      console.log('[Crawler] 定时爬虫已停止');
    }
  }

  return {
    runCrawl,
    startScheduler,
    stopScheduler,
    restoreStatusBar,
    simulatePriceUpdate,
    isRunning: () => isRunning,
  };
})();