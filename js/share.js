/**
 * 点对点分享 - 二维码生成/扫描
 * 纯本地：生成二维码让隔壁老王扫，或扫老王的二维码导入数据
 * 依赖：qrcode.js (CDN) + html5-qrcode (CDN)
 */
const Share = (() => {
  let scanActive = false;
  let html5QrScanner = null;

  // ========== 二维码生成 ==========
  async function showShareQR() {
    const modal = document.getElementById('modal-share-qr');
    const container = document.getElementById('qr-container');
    if (!modal || !container) return;

    // 收集要分享的数据
    const shareData = await collectShareData();
    if (!shareData || shareData.prices.length === 0) {
      showToast('⚠️ 暂无价格数据可分享');
      return;
    }

    const jsonStr = JSON.stringify(shareData);
    const compressed = compressData(jsonStr);

    modal.classList.remove('hidden');

    // 生成分页二维码（每页约400字符）
    renderQRCodes(container, compressed);

    // 显示数据摘要
    document.getElementById('qr-summary').textContent =
      `${shareData.prices.length} 条价格 · ${shareData.categories} 个品类 · ${new Date(shareData.shareTime).toLocaleString('zh-CN')}`;
  }

  async function collectShareData() {
    const regionCode = await DB.getSetting('current_region', 'default');
    const allPrices = await DB.getAll('prices');

    // 优先分享爬虫数据，其次用户录入数据
    let prices = allPrices
      .filter(p => p.source === 'crawler' || p.source === 'user')
      .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));

    // 去重：每个品类只取最新一条
    const seen = new Set();
    const unique = [];
    for (const p of prices) {
      if (!seen.has(p.category_id)) {
        seen.add(p.category_id);
        unique.push({
          category_id: p.category_id,
          buy_price: p.buy_price,
          sell_price: p.sell_price,
          source: p.source,
          recorded_at: p.recorded_at,
        });
      }
    }

    if (unique.length === 0) return null;

    return {
      v: 1,
      shareTime: new Date().toISOString(),
      categories: unique.length,
      region: regionCode,
      prices: unique,
    };
  }

  function compressData(jsonStr) {
    // 压缩JSON：移除空格和缩短key名
    const data = JSON.parse(jsonStr);
    const compressed = {
      v: data.v,
      t: data.shareTime,
      n: data.categories,
      r: data.region,
      p: data.prices.map(p => [
        p.category_id,
        p.buy_price,
        p.sell_price,
        p.source === 'user' ? 1 : 0,
        p.recorded_at ? new Date(p.recorded_at).getTime() : 0
      ])
    };
    const result = JSON.stringify(compressed);
    // 如果数据太大，只取前15条
    if (result.length > 1200) {
      compressed.p = compressed.p.slice(0, 15);
      return JSON.stringify(compressed);
    }
    return result;
  }

  function decompressData(jsonStr) {
    const data = JSON.parse(jsonStr);
    // 兼容新旧格式
    if (data.v && data.p && Array.isArray(data.p)) {
      const prices = data.p.map(p => {
        if (Array.isArray(p)) {
          return {
            category_id: p[0],
            buy_price: p[1],
            sell_price: p[2],
            source: p[3] === 1 ? 'user' : 'crawler',
            recorded_at: p[4] ? new Date(p[4]).toISOString() : new Date().toISOString(),
          };
        }
        // 旧格式
        return {
          category_id: p.category_id,
          buy_price: p.buy_price,
          sell_price: p.sell_price,
          source: p.source || 'crawler',
          recorded_at: p.recorded_at || new Date().toISOString(),
        };
      });
      return {
        prices,
        region: data.r || data.region || 'default',
        shareTime: data.t || data.shareTime,
      };
    }
    return null;
  }

  function renderQRCodes(container, compressedData) {
    container.innerHTML = '';

    // 如果数据小，一个二维码就够了
    if (compressedData.length <= 2800) {
      const div = document.createElement('div');
      div.className = 'qr-code';
      container.appendChild(div);
      try {
        new QRCode(div, {
          text: compressedData,
          width: 240,
          height: 240,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.L,
        });
      } catch (e) {
        div.innerHTML = '<div class="qr-error">QR生成失败</div>';
      }
      return;
    }

    // 分页显示（每2800字符一页）
    const totalPages = Math.ceil(compressedData.length / 2800);
    const pageInfo = document.createElement('div');
    pageInfo.style.cssText = 'text-align:center;margin-bottom:12px;font-size:13px;color:#666;';
    pageInfo.textContent = `数据较大，共 ${totalPages} 个二维码，请依次扫描`;
    container.appendChild(pageInfo);

    for (let i = 0; i < totalPages; i++) {
      const chunk = `P${i+1}/${totalPages}|` + compressedData.substring(i * 2800, (i + 1) * 2800);
      const div = document.createElement('div');
      div.className = 'qr-code';
      div.style.marginBottom = '16px';
      container.appendChild(div);

      const label = document.createElement('div');
      label.style.cssText = 'text-align:center;font-size:12px;color:#888;margin-bottom:4px;';
      label.textContent = `第 ${i+1}/${totalPages} 页`;
      container.appendChild(label);

      try {
        new QRCode(div, {
          text: chunk,
          width: 240,
          height: 240,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.L,
        });
      } catch (e) {
        div.innerHTML = '<div class="qr-error">生成失败</div>';
      }
    }
  }

  // ========== 二维码扫描 ==========
  async function startScan() {
    const modal = document.getElementById('modal-scan-qr');
    const reader = document.getElementById('qr-reader');
    if (!modal || !reader) return;

    modal.classList.remove('hidden');

    reader.innerHTML = '<div id="qr-reader-inner" style="width:100%;max-width:300px;margin:0 auto;"></div>';

    try {
      html5QrScanner = new Html5Qrcode('qr-reader-inner');
      scanActive = true;

      await html5QrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => onScanSuccess(decodedText),
        (errorMessage) => { /* 忽略扫描中错误 */ }
      );
    } catch (e) {
      reader.innerHTML = `<div class="scan-error">⚠️ 无法启动摄像头<br><small>${e.message || '请授予摄像头权限'}</small></div>`;
      scanActive = false;
    }
  }

  // 缓存多页扫描数据
  let scannedPages = {};

  async function onScanSuccess(decodedText) {
    if (!scanActive) return;

    // 检测分页格式
    const pageMatch = decodedText.match(/^P(\d+)\/(\d+)\|(.+)/);
    if (pageMatch) {
      const page = parseInt(pageMatch[1]);
      const total = parseInt(pageMatch[2]);
      const chunk = pageMatch[3];
      scannedPages[page] = chunk;

      // 检查是否收集完毕
      if (Object.keys(scannedPages).length >= total) {
        const full = Array.from({ length: total }, (_, i) => scannedPages[i + 1] || '').join('');
        scannedPages = {};
        await stopScan();
        processImportedData(full);
      } else {
        showToast(`📸 第${page}/${total}页已扫，继续扫下一页...`);
      }
      return;
    }

    // 单页数据直接处理
    await stopScan();
    processImportedData(decodedText);
  }

  async function stopScan() {
    scanActive = false;
    scannedPages = {};
    if (html5QrScanner) {
      try {
        await html5QrScanner.stop();
      } catch (e) { /* ignore */ }
      html5QrScanner = null;
    }
    document.getElementById('modal-scan-qr').classList.add('hidden');
  }

  async function processImportedData(jsonStr) {
    const shareData = decompressData(jsonStr);
    if (!shareData || !shareData.prices || shareData.prices.length === 0) {
      showToast('❌ 无效的分享数据');
      return;
    }

    const regionCode = shareData.region || await DB.getSetting('current_region', 'default');
    const now = new Date().toISOString();
    const records = shareData.prices.map(p => ({
      id: `share_${p.category_id}_${now}_${Math.random().toString(36).substr(2, 6)}`,
      category_id: p.category_id,
      buy_price: p.buy_price,
      sell_price: p.sell_price,
      region_code: regionCode,
      source: 'share',
      source_detail: '👥 老王分享 · ' + new Date(shareData.shareTime || now).toLocaleDateString('zh-CN'),
      recorded_at: p.recorded_at || now,
      created_at: now,
    }));

    await DB.bulkPut('prices', records);
    showToast(`✅ 已导入 ${records.length} 条价格`);

    // 刷新行情页
    if (typeof App !== 'undefined' && App.renderMarket) {
      App.renderMarket();
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  return { showShareQR, startScan, stopScan };
})();
