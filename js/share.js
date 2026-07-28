/**
 * 点对点分享 - 二维码生成/扫描
 * 极简版：超小数据 + 大QR + 手动翻页
 */
const Share = (() => {
  let scanActive = false;
  let html5QrScanner = null;
  let scanBuffer = '';
  let scannedPageCount = 0;

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
    const json = JSON.stringify({d:items});
    document.getElementById('qr-data-size').textContent = `${items.length}品类 · ${json.length}字符`;

    // 分页：每页300字符
    const PAGE = 300;
    const totalPages = Math.ceil(json.length / PAGE);
    document.getElementById('qr-page-info').textContent = `第 1/${totalPages} 页`;

    // 存储数据
    container.dataset.json = json;
    container.dataset.page = '1';
    container.dataset.total = totalPages;
    container.dataset.pages = JSON.stringify(
      Array.from({length: totalPages}, (_,i) => json.substring(i*PAGE, (i+1)*PAGE))
    );

    document.getElementById('modal-share-qr').classList.remove('hidden');
    renderCurrentPage();
  }

  function renderCurrentPage() {
    const container = document.getElementById('qr-page');
    const json = container.dataset.json;
    const page = parseInt(container.dataset.page);
    const total = parseInt(container.dataset.total);
    const pages = JSON.parse(container.dataset.pages);

    // 清空
    const qrDiv = document.getElementById('qr-code-display');
    qrDiv.innerHTML = '';

    document.getElementById('qr-page-info').textContent = `第 ${page}/${total} 页`;

    // 上一页/下一页按钮
    document.getElementById('qr-prev').style.display = page > 1 ? 'inline-block' : 'none';
    document.getElementById('qr-next').style.display = page < total ? 'inline-block' : 'none';

    // 生成QR
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
    } catch(e) {
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

    scanBuffer = '';
    scannedPageCount = 0;
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
    } catch(e) {
      reader.innerHTML = `<div style="color:#e53935;padding:20px;text-align:center;">⚠️ 无法启动摄像头<br><small>${e.message||'请授予权限'}</small></div>`;
    }
  }

  function onScan(text) {
    if (!scanActive || !text) return;

    // 检测是否是完整数据: {"d":[[...]]}
    if (text.startsWith('{"d":')) {
      scanBuffer = text;
      scannedPageCount = 1;
    } else {
      scanBuffer += text;
      scannedPageCount++;
    }

    document.getElementById('scan-status').textContent = `已扫描 ${scannedPageCount} 段`;

    // 试试解析
    try {
      const data = JSON.parse(scanBuffer);
      if (data.d && Array.isArray(data.d)) {
        stopAndImport(scanBuffer);
        return;
      }
    } catch(e) {}

    // 等待更多扫描
    if (scannedPageCount >= 5) {
      stopAndImport(scanBuffer);
    }
  }

  async function stopAndImport(jsonStr) {
    await stopScan();
    try {
      const data = JSON.parse(jsonStr);
      if (!data.d) { showToast('❌ 无效数据'); return; }

      const records = data.d.map(p => ({
        id: `share_${p[0]}_${Date.now()}_${Math.random().toString(36).substr(2,4)}`,
        category_id: p[0],
        buy_price: p[1],
        sell_price: p[2],
        region_code: 'default',
        source: 'share',
        source_detail: '👥 好友分享',
        recorded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }));

      await DB.bulkPut('prices', records);
      showToast(`✅ 已导入 ${records.length} 条价格`);
      if (typeof App !== 'undefined' && App.renderMarket) App.renderMarket();
    } catch(e) {
      showToast('❌ 数据解析失败');
    }
  }

  async function stopScan() {
    scanActive = false;
    if (html5QrScanner) {
      try { await html5QrScanner.stop(); } catch(e) {}
      html5QrScanner = null;
    }
    document.getElementById('modal-scan-qr').classList.add('hidden');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  return { showShareQR, startScan, stopScan, prevPage, nextPage };
})();
