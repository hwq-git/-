/**
 * 点对点分享 - 二维码生成/扫描
 * 分页协议：每页 {"p":页码,"t":总页数,"d":"数据片段"}
 * 扫描端按页码去重存储，凑齐后按序拼接，支持乱序扫描
 */
const Share = (() => {
  let scanActive = false;
  let html5QrScanner = null;
  let scanPages = {};      // {页码: 数据片段}
  let scanTotalPages = 0;
  let scannedSet = new Set();

  // ========== 二维码生成 ==========
  async function showShareQR() {
    const container = document.getElementById('qr-page');
    if (!container) return;

    // 收集数据 - 极简格式
    const allPrices = await DB.getAll('prices');
    const seen = {};
    const items = [];
    for (const p of allPrices) {
      if (seen[p.category_id]) continue;
      seen[p.category_id] = 1;
      items.push([p.category_id, p.buy_price, p.sell_price]);
    }

    if (items.length === 0) {
      showToast('⚠️ 暂无价格数据');
      return;
    }

    // 极简JSON：单字母key，无空格
    const json = JSON.stringify({ d: items });
    document.getElementById('qr-data-size').textContent = `${items.length}品类 · ${json.length}字符`;

    // 分页：每页150字符（QR更稀疏，手机扫描成功率更高）
    const PAGE_SIZE = 150;
    const totalPages = Math.ceil(json.length / PAGE_SIZE);

    // 每页包装成 {p, t, d} 带页码标识
    const pages = [];
    for (let i = 0; i < totalPages; i++) {
      const chunk = json.substring(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
      pages.push(JSON.stringify({ p: i + 1, t: totalPages, d: chunk }));
    }

    container.dataset.pages = JSON.stringify(pages);
    container.dataset.page = '1';
    container.dataset.total = totalPages;

    document.getElementById('modal-share-qr').classList.remove('hidden');
    renderCurrentPage();
  }

  function renderCurrentPage() {
    const container = document.getElementById('qr-page');
    const pages = JSON.parse(container.dataset.pages);
    const page = parseInt(container.dataset.page);
    const total = parseInt(container.dataset.total);

    const qrDiv = document.getElementById('qr-code-display');
    qrDiv.innerHTML = '';

    document.getElementById('qr-page-info').textContent = `第 ${page}/${total} 页`;
    document.getElementById('qr-prev').style.display = page > 1 ? 'inline-block' : 'none';
    document.getElementById('qr-next').style.display = page < total ? 'inline-block' : 'none';

    // 生成QR - 每页内容是 {"p":1,"t":3,"d":"..."} 格式
    const text = pages[page - 1];
    try {
      new QRCode(qrDiv, {
        text: text,
        width: 280,
        height: 280,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L,
      });
    } catch (e) {
      qrDiv.innerHTML = '<div style="color:red;padding:20px;">QR生成失败</div>';
    }
  }

  function prevPage() {
    const c = document.getElementById('qr-page');
    let p = parseInt(c.dataset.page);
    if (p > 1) { c.dataset.page = p - 1; renderCurrentPage(); }
  }

  function nextPage() {
    const c = document.getElementById('qr-page');
    let p = parseInt(c.dataset.page);
    let t = parseInt(c.dataset.total);
    if (p < t) { c.dataset.page = p + 1; renderCurrentPage(); }
  }

  // ========== 二维码扫描 ==========
  async function startScan() {
    const modal = document.getElementById('modal-scan-qr');
    const reader = document.getElementById('qr-reader');
    if (!modal || !reader) return;

    // 重置状态
    scanPages = {};
    scanTotalPages = 0;
    scannedSet = new Set();

    modal.classList.remove('hidden');
    reader.innerHTML = '<div id="qr-reader-inner" style="width:100%;max-width:300px;margin:0 auto;"></div>';
    document.getElementById('scan-status').textContent = '请对准二维码';

    try {
      html5QrScanner = new Html5Qrcode('qr-reader-inner');
      scanActive = true;
      await html5QrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScan,
        () => {}
      );
    } catch (e) {
      reader.innerHTML = `<div style="color:#e53935;padding:20px;text-align:center;">⚠️ 无法启动摄像头<br><small>${e.message || '请授予权限'}</small></div>`;
    }
  }

  function onScan(text) {
    if (!scanActive || !text) return;

    // 尝试解析为分页格式 {"p":1,"t":3,"d":"..."}
    let pageData;
    try {
      pageData = JSON.parse(text);
    } catch (e) {
      return; // 不是有效JSON，忽略（误扫）
    }

    // 验证是否是我们的分页格式
    if (typeof pageData.p !== 'number' ||
        typeof pageData.t !== 'number' ||
        typeof pageData.d !== 'string') {
      return; // 不是我们的格式，忽略
    }

    const pageNum = pageData.p;
    const totalPages = pageData.t;

    // 去重：已扫过的页码不重复处理
    if (scannedSet.has(pageNum)) {
      return; // 同一页重复扫描，忽略
    }

    // 记录这一页
    scannedSet.add(pageNum);
    scanPages[pageNum] = pageData.d;
    scanTotalPages = totalPages;

    // 更新进度提示
    const statusEl = document.getElementById('scan-status');
    if (scannedSet.size < totalPages) {
      const missing = [];
      for (let i = 1; i <= totalPages; i++) {
        if (!scannedSet.has(i)) missing.push(i);
      }
      statusEl.textContent = `已扫 ${scannedSet.size}/${totalPages} 页，还缺第 ${missing.join(',')} 页`;
      statusEl.style.color = '#1a73e8';
    } else {
      statusEl.textContent = `✅ ${totalPages} 页全部扫描完成，正在导入...`;
      statusEl.style.color = '#34a853';
    }

    // 凑齐所有页 → 按页码顺序拼接 → 导入
    if (scannedSet.size >= totalPages) {
      let fullJson = '';
      for (let i = 1; i <= totalPages; i++) {
        fullJson += scanPages[i];
      }
      stopAndImport(fullJson);
    }
  }

  async function stopAndImport(jsonStr) {
    await stopScan();
    try {
      const data = JSON.parse(jsonStr);
      if (!data.d || !Array.isArray(data.d)) {
        showToast('❌ 数据格式无效');
        return;
      }

      const now = new Date().toISOString();
      const records = data.d.map(p => ({
        id: `share_${p[0]}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        category_id: p[0],
        buy_price: p[1],
        sell_price: p[2],
        region_code: 'default',
        source: 'share',
        source_detail: '👥 好友分享',
        recorded_at: now,
        created_at: now,
      }));

      await DB.bulkPut('prices', records);
      showToast(`✅ 已导入 ${records.length} 条价格`);
      if (typeof App !== 'undefined' && App.renderMarket) App.renderMarket();
    } catch (e) {
      console.error('[Share] 导入失败:', e);
      showToast('❌ 数据解析失败: ' + e.message);
    }
  }

  async function stopScan() {
    scanActive = false;
    if (html5QrScanner) {
      try { await html5QrScanner.stop(); } catch (e) {}
      html5QrScanner = null;
    }
    const modal = document.getElementById('modal-scan-qr');
    if (modal) modal.classList.add('hidden');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  return { showShareQR, startScan, stopScan, prevPage, nextPage };
})();
