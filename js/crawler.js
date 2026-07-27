/**
 * 手机端爬虫引擎（增强版）
 * 支持：HTML解析 / API JSON解析 / Cookie注入
 */

const Crawler = (() => {
  const CORS_PROXIES = [
    { name: 'allorigins', fn: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    { name: 'corsproxy',  fn: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}` },
    { name: 'codetabs',   fn: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
  ];

  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];

  let isRunning = false;
  let crawlTimer = null;

  function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  function randomDelay(min = 3000, max = 8000) {
    return new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));
  }

  // ========== 网络/电量检测（不变）==========
  async function checkNetwork() {
    if (!navigator.onLine) return { ok: false, reason: '设备离线' };
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const wifiOnly = await DB.getSetting('crawler_wifi_only', true);
    if (wifiOnly && connection) {
      if (connection.type === 'cellular') {
        return { ok: false, reason: '非WiFi网络，已跳过（节电模式）' };
      }
    }
    return { ok: true };
  }

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

  // ========== 增强版 fetchPage：支持自定义 headers（含Cookie） ==========
  async function fetchPage(url, customHeaders = {}, authConfig = null) {
    const proxyAttempts = [];
    let lastError = null;

    // 合并请求头：随机UA + 用户配置的Cookie/Token
    const headers = {
      'User-Agent': getRandomUA(),
      ...customHeaders,
    };

    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxy = CORS_PROXIES[i];
      const proxyUrl = proxy.fn(url);
      const attempt = {
        proxy: proxy.name,
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
          headers: headers,   // ✅ 带上自定义Cookie/Token
        });

        clearTimeout(timeoutId);
        attempt.durationMs = Date.now() - start;
        attempt.httpStatus = response.status;

        if (!response.ok) {
          attempt.status = 'failed';
          attempt.error = `HTTP ${response.status}`;
          proxyAttempts.push(attempt);
          if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
          continue;
        }

        const text = await response.text();
        attempt.htmlLength = text.length;

        if (!text || text.length < 50) {
          attempt.status = 'failed';
          attempt.error = `内容过短 (${text.length} bytes)`;
          proxyAttempts.push(attempt);
          if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
          continue;
        }

        // 检测是否被重定向到登录页
        const isLoginPage = /登录|login|请登录|请先登录|sign in/i.test(text.slice(0, 2000)) &&
                           text.length < 5000; // 登录页通常很短

        if (isLoginPage) {
          attempt.status = 'failed';
          // 增强提示：区分是否需要用户提供认证
          if (authConfig && authConfig.required) {
            attempt.error = '返回登录页（Cookie失效或未提供，请去"设置→站点认证"填写）';
          } else {
            attempt.error = '返回登录页（Cookie失效或未提供）';
          }
          proxyAttempts.push(attempt);
          console.warn(`[Crawler] 代理 ${proxy.name} 返回登录页${authConfig && authConfig.required ? '（站点需要认证）' : ''}，Cookie可能失效`);
          if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
          continue;
        }

        attempt.status = 'success';
        proxyAttempts.push(attempt);

        return {
          success: true,
          text: text,          // 统一叫 text，可能是HTML也可能是JSON字符串
          isJson: text.trim().startsWith('{') || text.trim().startsWith('['),
          proxyUsed: proxy.name,
          proxyAttempts,
          httpStatus: response.status,
          contentLength: text.length,
          errorDetail: null,
        };

      } catch (err) {
        attempt.status = 'failed';
        attempt.error = err.message || String(err);
        proxyAttempts.push(attempt);
        lastError = err;
        if (i < CORS_PROXIES.length - 1) await randomDelay(1000, 2000);
      }
    }

    const errorDetail = proxyAttempts.map(a =>
      `[${a.proxy}] ${a.status.toUpperCase()}${a.httpStatus ? ' HTTP:' + a.httpStatus : ''}${a.error ? ' | ' + a.error : ''}`
    ).join(' → ');

    return {
      success: false,
      text: null,
      isJson: false,
      proxyUsed: null,
      proxyAttempts,
      httpStatus: null,
      contentLength: 0,
      errorDetail: errorDetail || (lastError ? lastError.message : '所有代理均失败'),
    };
  }

  // ========== 增强版 parsePrices：支持 HTML 和 API 两种模式 ==========
  function parsePrices(fetchResult, config) {
    const parseErrors = [];
    const type = config.type || 'html';

    // ---------- API 模式：直接解析 JSON ----------
    if (type === 'api' || fetchResult.isJson) {
      try {
        let json = JSON.parse(fetchResult.text);

        // 如果配置了 apiPath，按路径提取数组（如 "data.list"）
        if (config.api_path) {
          const parts = config.api_path.split('.');
          for (const part of parts) {
            if (json && json[part] !== undefined) {
              json = json[part];
            } else {
              return {
                results: [],
                matchedElements: 0,
                parseErrors: [{ index: -1, error: `apiPath "${config.api_path}" 未找到` }],
                errorDetail: `JSON路径 "${config.api_path}" 解析失败`,
              };
            }
          }
        }

        if (!Array.isArray(json)) {
          return {
            results: [],
            matchedElements: 0,
            parseErrors: [{ index: -1, error: 'API返回不是数组' }],
            errorDetail: `API返回类型: ${typeof json}`,
          };
        }

        const results = [];
        let fields = config.fields;
        if (typeof fields === 'string') fields = JSON.parse(fields);

        json.forEach((item, idx) => {
          try {
            const name = item[fields.category];
            const priceText = String(item[fields.price] || '');
            const changeText = String(item[fields.change] || '');
            const dateText = String(item[fields.date] || '');

            if (!name || !priceText) {
              parseErrors.push({ index: idx, error: '缺少品名或价格', raw: JSON.stringify(item).slice(0, 100) });
              return;
            }

            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            if (!priceMatch) {
              parseErrors.push({ index: idx, error: `无法解析价格: ${priceText}`, raw: priceText });
              return;
            }
            const price = parseFloat(priceMatch[0].replace(/,/g, ''));

            const matchedCategory = matchCategory(name);
            if (!matchedCategory) {
              parseErrors.push({ index: idx, error: `品名未匹配: ${name}`, raw: name });
              return;
            }

            let change = 0;
            if (changeText) {
              const numMatch = changeText.match(/-?[\d,.]+/);
              if (numMatch) change = parseFloat(numMatch[0].replace(/,/g, ''));
            }

            results.push({
              category_id: matchedCategory.id,
              category_name: matchedCategory.name,
              buy_price: Math.round(price * 0.97),
              sell_price: Math.round(price * 1.01),
              change: change,
              source_detail: config.website_name,
              date_text: dateText,
            });
          } catch (e) {
            parseErrors.push({ index: idx, error: e.message, raw: JSON.stringify(item).slice(0, 100) });
          }
        });

        return {
          results,
          matchedElements: json.length,
          parseErrors,
          errorDetail: `API返回 ${json.length} 条，成功解析 ${results.length} 条`,
        };

      } catch (e) {
        return {
          results: [],
          matchedElements: 0,
          parseErrors: [{ index: -1, error: 'JSON解析失败: ' + e.message }],
          errorDetail: `JSON解析异常: ${e.message}`,
        };
      }
    }

    // ---------- HTML 模式：DOM解析（和之前一样，略增强）----------
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(fetchResult.text, 'text/html');
      const items = doc.querySelectorAll(config.css_selector || config.listSelector);
      const matchedElements = items.length;
      const results = [];

      if (matchedElements === 0) {
        // 额外检测：是不是被反爬或登录拦截了
        const bodyText = doc.body ? doc.body.innerText.slice(0, 500) : '';
        const isBlocked = /验证码|访问频繁|请稍后|403|Forbidden|登录|login/i.test(bodyText);

        return {
          results: [],
          matchedElements: 0,
          parseErrors: [],
          errorDetail: isBlocked
            ? `CSS选择器未匹配，页面疑似被拦截: "${bodyText.slice(0, 80)}"`
            : `CSS选择器 "${config.css_selector}" 未匹配到任何元素`,
        };
      }

      let fields = config.fields;
      if (typeof fields === 'string') fields = JSON.parse(fields);

      items.forEach((item, idx) => {
        try {
          const getText = (sel) => {
            const el = item.querySelector(sel);
            return el ? el.textContent.trim() : '';
          };

          const name = getText(fields.category);
          const priceText = getText(fields.price);
          const changeText = getText(fields.change);
          const dateText = getText(fields.date);

          if (!name || !priceText) {
            parseErrors.push({ index: idx, error: '缺少品名或价格', raw: item.textContent.trim().slice(0, 80) });
            return;
          }

          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          if (!priceMatch) {
            parseErrors.push({ index: idx, error: `无法解析价格: ${priceText}`, raw: priceText });
            return;
          }
          const price = parseFloat(priceMatch[0].replace(/,/g, ''));

          const matchedCategory = matchCategory(name);
          if (!matchedCategory) {
            parseErrors.push({ index: idx, error: `品名未匹配: ${name}`, raw: name });
            return;
          }

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
            source_detail: config.website_name,
            date_text: dateText,
          });
        } catch (e) {
          parseErrors.push({ index: idx, error: e.message, raw: item.textContent.trim().slice(0, 80) });
        }
      });

      return {
        results,
        matchedElements,
        parseErrors,
        errorDetail: `匹配 ${matchedElements} 个元素，解析成功 ${results.length} 条`,
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

  // 品名匹配（不变）
  function matchCategory(name) {
    const lowerName = String(name).toLowerCase().replace(/\s/g, '');
    for (const cat of CATEGORIES) {
      if (lowerName.includes(cat.name) || cat.name.includes(name)) {
        return cat;
      }
    }
    return null;
  }

  // ========== 爬取单个网站（增强版） ==========
  async function crawlSite(config) {
    const startTime = Date.now();
    const log = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      website_name: config.website_name,
      status: 'failed',
      items_scraped: 0,
      error_msg: '',
      error_detail: null,
      proxy_used: null,
      http_status: null,
      matched_elements: 0,
      parse_errors: 0,
      duration_ms: 0,
      crawled_at: new Date().toISOString(),
    };

    try {
      console.log(`[Crawler] 正在爬取: ${config.website_name} [${config.type || 'html'}] (${config.base_url})`);

      // ---------- 解析站点认证配置 ----------
      let siteAuth = null;
      if (config.auth) {
        try {
          siteAuth = typeof config.auth === 'string' ? JSON.parse(config.auth) : config.auth;
        } catch (e) {
          console.warn('[Crawler] auth 配置解析失败:', e.message);
        }
      }

      // 解析用户填入的认证信息（Cookie/Token）
      let userAuth = {};
      if (config.user_auth) {
        try {
          const raw = typeof config.user_auth === 'string' ? JSON.parse(config.user_auth) : config.user_auth;
          userAuth = raw || {};
        } catch (e) {
          console.warn('[Crawler] user_auth 解析失败:', e.message);
        }
      }

      // 检查是否需要认证但未提供有效凭据
      if (siteAuth && siteAuth.required) {
        const hasValidAuth = Object.keys(userAuth).some(k => {
          const v = userAuth[k];
          return v && String(v).trim().length > 3;
        });
        if (!hasValidAuth) {
          log.error_msg = `需要认证（${siteAuth.description}），但未提供 Cookie/Token，请去"设置→站点认证"填写`;
          log.error_detail = JSON.stringify({ stage: 'auth', reason: 'missing_credentials' });
          throw new Error(log.error_msg);
        }
        console.log(`[Crawler] ${config.website_name}: 已携带用户认证 (${Object.keys(userAuth).filter(k => userAuth[k]).join(', ')})`);
      }

      // 构建请求头并抓取（传入 authConfig 用于增强登录页检测）
      const customHeaders = { ...userAuth };

      // 1. 抓取
      const fetchResult = await fetchPage(config.base_url, customHeaders, siteAuth);
      log.proxy_used = fetchResult.proxyUsed;
      log.http_status = fetchResult.httpStatus;

      if (!fetchResult.success) {
        log.error_msg = fetchResult.errorDetail;
        log.error_detail = JSON.stringify({ stage: 'fetch', proxyAttempts: fetchResult.proxyAttempts });
        throw new Error(fetchResult.errorDetail);
      }

      // 2. 解析
      const parseResult = parsePrices(fetchResult, config);
      log.matched_elements = parseResult.matchedElements;
      log.parse_errors = parseResult.parseErrors.length;

      if (parseResult.results.length === 0) {
        log.error_msg = parseResult.errorDetail;
        log.error_detail = JSON.stringify({
          stage: 'parse',
          isJson: fetchResult.isJson,
          contentLength: fetchResult.contentLength,
          parseErrors: parseResult.parseErrors.slice(0, 10),
        });
        throw new Error(parseResult.errorDetail);
      }

      // 3. 入库
      const regionCode = await DB.getSetting('current_region', 'default');
      const priceRecords = parseResult.results.map(p => ({
        id: `crawl_${p.category_id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        category_id: p.category_id,
        buy_price: p.buy_price,
        sell_price: p.sell_price,
        region_code: regionCode,
        source: 'crawler',
        source_detail: config.website_name,
        recorded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }));
      await DB.bulkPut('prices', priceRecords);

      log.status = 'success';
      log.items_scraped = parseResult.results.length;
      log.duration_ms = Date.now() - startTime;
      log.error_detail = JSON.stringify({
        stage: 'success',
        proxyUsed: fetchResult.proxyUsed,
        contentLength: fetchResult.contentLength,
        isJson: fetchResult.isJson,
      });

      await DB.put('crawler_configs', {
        ...config,
        last_success_at: new Date().toISOString(),
        last_error: null,
      });

      console.log(`[Crawler] ${config.website_name}: ✅ ${parseResult.results.length} 条 (${fetchResult.isJson ? 'API' : 'HTML'}, 代理:${fetchResult.proxyUsed})`);

    } catch (err) {
      log.error_msg = err.message;
      log.duration_ms = Date.now() - startTime;
      await DB.put('crawler_configs', { ...config, last_error: err.message });
      console.error(`[Crawler] ${config.website_name} ❌:`, err.message);
    }

    await DB.put('crawl_logs', log);
    return log;
  }

  // ========== 远程数据拉取（从 GitHub Actions 抓取的 JSON） ==========
  const REMOTE_PRICES_URLS = [
    'https://raw.githubusercontent.com/hwq-git/-/main/data/scraped-prices.json',
  ];

  // 本地文件作为后备
  const LOCAL_PRICES_PATH = './data/scraped-prices.json';

  async function fetchRemotePrices() {
    let allResults = [];
    let fetchErrors = [];
    const regionCode = await DB.getSetting('current_region', 'default');

    // 从上一版爬虫配置获取本地文件也尝试
    const sources = [...REMOTE_PRICES_URLS, LOCAL_PRICES_PATH];

    for (const src of sources) {
      try {
        console.log(`[Crawler] 尝试拉取远程价格: ${src}`);
        const resp = await fetch(src, { cache: 'no-store' });
        if (!resp.ok) {
          fetchErrors.push({ source: src, error: `HTTP ${resp.status}` });
          continue;
        }
        const data = await resp.json();

        if (!data.prices || !Array.isArray(data.prices)) {
          fetchErrors.push({ source: src, error: '数据格式错误' });
          continue;
        }

        console.log(`[Crawler] ✅ 从 ${src} 获取 ${data.prices.length} 条价格`);

        // 入库
        const now = new Date().toISOString();
        const records = data.prices.map(p => ({
          id: `remote_${p.category_id}_${now}`,
          category_id: p.category_id,
          buy_price: p.buy_price,
          sell_price: p.sell_price,
          region_code: regionCode,
          source: 'crawler',
          source_detail: data.scraped_at ? `远程数据 · ${new Date(data.scraped_at).toLocaleDateString('zh-CN')}` : '远程数据',
          recorded_at: now,
          created_at: now,
        }));

        await DB.bulkPut('prices', records);
        allResults.push(...records);
        break; // 成功则不再尝试其他源
      } catch (e) {
        fetchErrors.push({ source: src, error: e.message });
      }
    }

    if (allResults.length === 0) {
      console.log('[Crawler] 远程数据获取失败，错误:', fetchErrors);
      return { success: false, errors: fetchErrors };
    }

    const now = new Date().toISOString();
    await DB.setSetting('last_crawl_at', now);
    await DB.setSetting('last_crawl_status', 'success');
    await DB.setSetting('last_crawl_items', allResults.length);
    await DB.setSetting('last_crawl_error_detail', null);

    return { success: true, count: allResults.length, errors: fetchErrors };
  }

  // ========== runCrawl / simulatePriceUpdate / 状态栏 / 定时器（基本不变）==========
  async function runCrawl(deep = false) {
    if (isRunning) return { skipped: true };
    isRunning = true;
    updateStatusBar('running');

    try {
      const netCheck = await checkNetwork();
      if (!netCheck.ok) {
        await DB.setSetting('last_crawl_status', 'skipped');
        await DB.setSetting('last_crawl_skip_reason', netCheck.reason);
        updateStatusBar('skipped', netCheck.reason);
        return { skipped: true, reason: netCheck.reason };
      }

      const batCheck = await checkBattery();
      if (!batCheck.ok) {
        await DB.setSetting('last_crawl_status', 'skipped');
        await DB.setSetting('last_crawl_skip_reason', batCheck.reason);
        updateStatusBar('skipped', batCheck.reason);
        return { skipped: true, reason: batCheck.reason };
      }

      // ===== 优先：拉取远程抓取数据（GitHub Actions 产出） =====
      console.log('[Crawler] 步骤1: 尝试远程数据...');
      const remoteResult = await fetchRemotePrices();
      if (remoteResult.success) {
        updateStatusBar('fresh', `真实数据 ${remoteResult.count} 条`);
        isRunning = false;
        return { successCount: 1, totalItems: remoteResult.count };
      }

      // ===== 备选：浏览器端 CORS 代理爬取 =====
      console.log('[Crawler] 步骤2: 远程数据不可用，尝试浏览器爬取...');
      const configs = await DB.getAll('crawler_configs');
      const enabledConfigs = configs.filter(c => c.enabled);

      if (enabledConfigs.length > 0) {
        let totalItems = 0, successCount = 0, failCount = 0;
        const failDetails = [];

        for (let i = 0; i < enabledConfigs.length; i++) {
          const log = await crawlSite(enabledConfigs[i]);
          if (log.status === 'success') {
            successCount++;
            totalItems += log.items_scraped;
          } else {
            failCount++;
            failDetails.push({
              site: enabledConfigs[i].website_name,
              url: enabledConfigs[i].base_url,
              type: enabledConfigs[i].type || 'html',
              error: log.error_msg,
              proxyUsed: log.proxy_used,
              httpStatus: log.http_status,
              matchedElements: log.matched_elements,
              parseErrors: log.parse_errors,
            });
          }
          if (i < enabledConfigs.length - 1) await randomDelay();
        }

        const now = new Date().toISOString();
        await DB.setSetting('last_crawl_at', now);

        if (successCount > 0) {
          await DB.setSetting('last_crawl_status', 'success');
          await DB.setSetting('last_crawl_items', totalItems);
          await DB.setSetting('last_crawl_error_detail', null);
          updateStatusBar('fresh', `抓取到 ${totalItems} 条`);
          isRunning = false;
          return { successCount, failCount, totalItems, failDetails };
        }

        if (failDetails.length > 0) {
          await DB.setSetting('last_crawl_error_detail', JSON.stringify(failDetails));
        }
      }

      // ===== 兜底：模拟数据 =====
      console.log('[Crawler] 步骤3: 爬取失败，启用模拟数据...');
      const now = new Date().toISOString();
      await simulatePriceUpdate();
      await DB.setSetting('last_crawl_at', now);
      await DB.setSetting('last_crawl_status', 'simulated');
      updateStatusBar('simulated', '行情已更新（模拟数据）');
      return { simulated: true };

    } catch (err) {
      console.error('[Crawler] 异常:', err);
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
    console.log(`[Crawler] 模拟更新: ${updated} 个品类`);
    return updated;
  }

  function updateStatusBar(status, message = '') {
    const bar = document.getElementById('status-bar');
    if (!bar) return;
    let html = '';
    switch (status) {
      case 'running': html = `<span class="status-dot running"></span><span>正在抓取行情...</span>`; break;
      case 'fresh': html = `<span class="status-dot fresh"></span><span>行情已更新 · ${message || '刚刚'}</span>`; break;
      case 'simulated': html = `<span class="status-dot fresh"></span><span>${message || '行情已更新'}</span>`; break;
      case 'failed': html = `<span class="status-dot failed"></span><span>上次同步失败 · 离线可用</span>`; break;
      case 'skipped': html = `<span class="status-dot skipped"></span><span>${message || '已跳过同步'}</span>`; break;
      case 'offline': html = `<span class="status-dot offline"></span><span>离线模式 · 使用历史数据</span>`; break;
      default: html = `<span class="status-dot"></span><span>行情数据</span>`;
    }
    bar.innerHTML = html;
  }

  async function restoreStatusBar() {
    const lastCrawlAt = await DB.getSetting('last_crawl_at', null);
    const lastStatus = await DB.getSetting('last_crawl_status', null);
    if (!lastCrawlAt || !lastStatus) { updateStatusBar('offline'); return; }

    const minutesAgo = Math.floor((Date.now() - new Date(lastCrawlAt).getTime()) / 60000);
    if (lastStatus === 'success' || lastStatus === 'simulated') {
      if (minutesAgo < 60) updateStatusBar('fresh', `${minutesAgo} 分钟前`);
      else if (minutesAgo < 180) updateStatusBar('fresh', `${Math.floor(minutesAgo / 60)} 小时前`);
      else updateStatusBar('skipped', `数据较旧 · ${Math.floor(minutesAgo / 60)} 小时前`);
    } else if (lastStatus === 'failed') {
      updateStatusBar('failed');
    } else {
      updateStatusBar('offline');
    }
  }

  async function startScheduler() {
    if (crawlTimer) clearInterval(crawlTimer);
    const intervalMinutes = await DB.getSetting('crawler_interval_minutes', 120);
    crawlTimer = setInterval(async () => {
      const enabled = await DB.getSetting('crawler_enabled', true);
      if (enabled) await runCrawl(false);
    }, intervalMinutes * 60 * 1000);
    console.log(`[Crawler] 定时器启动: ${intervalMinutes} 分钟`);
  }

  function stopScheduler() {
    if (crawlTimer) { clearInterval(crawlTimer); crawlTimer = null; console.log('[Crawler] 定时器停止'); }
  }

  // return {
  //   runCrawl,
  //   startScheduler,
  //   stopScheduler,
  //   restoreStatusBar,
  //   simulatePriceUpdate,
  //   isRunning: () => isRunning,
  // };
  return {
  runCrawl,
  startScheduler,
  stopScheduler,
  restoreStatusBar,
  simulatePriceUpdate,
  fetchRemotePrices,
  isRunning: () => isRunning,
  _testFetchPage: fetchPage,  // 暴露给 App 测试连接用
};
})();