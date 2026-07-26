/**
 * 数据导出 & 分享
 * - JSON 导出（可分享到微信）
 * - Excel 导出（CSV 格式，Excel可打开）
 * - JSON 导入（恢复数据）
 */
const Export = (() => {

  // 导出 JSON
  async function exportJSON() {
    try {
      const data = await collectAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `废品行情数据_${formatDate(new Date())}.json`;

      downloadFile(url, filename);
      URL.revokeObjectURL(url);

      App.showToast('✅ 数据已导出');

      // 尝试分享
      if (navigator.share) {
        try {
          const file = new File([blob], filename, { type: 'application/json' });
          await navigator.share({
            title: '废品行情数据',
            text: `导出于 ${new Date().toLocaleString()}`,
            files: [file]
          });
        } catch (e) {
          // 用户取消分享，忽略
        }
      }
    } catch (e) {
      console.error('Export error:', e);
      App.showToast('❌ 导出失败: ' + e.message);
    }
  }

  // 导出 Excel（CSV）
  async function exportExcel() {
    try {
      const categories = await DB.getAll('categories');
      const subCategories = categories.filter(c => c.parent_id);
      const regionCode = await DB.getSetting('current_region', 'default');

      let csv = '\uFEFF'; // BOM for Excel
      csv += '品类,单位,收购价,卖出价,数据来源,更新时间\n';

      for (const cat of subCategories) {
        const latest = await DB.getLatestPrice(cat.id, regionCode);
        if (latest) {
          const sourceMap = { crawler: '爬虫', user: '我记的', share: '分享', seed: '系统参考' };
          const source = sourceMap[latest.source] || latest.source;
          const date = new Date(latest.recorded_at).toLocaleString('zh-CN');
          csv += `${cat.name},${cat.unit},${latest.buy_price},${latest.sell_price},${source},${date}\n`;
        }
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const filename = `废品行情_${formatDate(new Date())}.csv`;

      downloadFile(url, filename);
      URL.revokeObjectURL(url);
      App.showToast('✅ Excel已导出');
    } catch (e) {
      console.error('Excel export error:', e);
      App.showToast('❌ 导出失败: ' + e.message);
    }
  }

  // 导入 JSON
  function importJSON() {
    document.getElementById('import-file').click();
  }

  async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.categories) {
        throw new Error('文件格式不正确');
      }

      if (!confirm(`确定导入数据？\n品类: ${data.categories.length}\n价格记录: ${data.prices?.length || 0}\n\n注意：导入会覆盖现有数据！`)) {
        return;
      }

      // 清空并导入
      if (data.categories) await DB.bulkPut('categories', data.categories);
      if (data.prices) await DB.bulkPut('prices', data.prices);
      if (data.ledger) await DB.bulkPut('ledger', data.ledger);
      if (data.regions) await DB.bulkPut('regions', data.regions);

      App.showToast('✅ 数据导入成功');
      await App.refreshData();
    } catch (e) {
      console.error('Import error:', e);
      App.showToast('❌ 导入失败: ' + e.message);
    }

    event.target.value = '';
  }

  // 收集所有数据
  async function collectAllData() {
    const [categories, prices, ledger, regions, crawlerConfigs, crawlLogs, settings] = await Promise.all([
      DB.getAll('categories'),
      DB.getAll('prices'),
      DB.getAll('ledger'),
      DB.getAll('regions'),
      DB.getAll('crawler_configs'),
      DB.getAll('crawl_logs'),
      DB.getAll('settings'),
    ]);

    return {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      app_name: '废品行情通',
      categories,
      prices,
      ledger,
      regions,
      crawler_configs: crawlerConfigs,
      crawl_logs: crawlLogs,
      settings,
    };
  }

  // 生成二维码数据（价格数据编码）
  async function generateQRData(categoryId) {
    const latest = await DB.getLatestPrice(categoryId);
    if (!latest) return null;

    const cat = CATEGORIES.find(c => c.id === categoryId);
    const data = {
      type: 'feipin_price',
      category: cat.name,
      buy: latest.buy_price,
      sell: latest.sell_price,
      source: latest.source_detail,
      time: latest.recorded_at,
    };

    return JSON.stringify(data);
  }

  // 工具函数
  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return { exportJSON, exportExcel, importJSON, handleImport, generateQRData };
})();
