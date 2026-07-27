/**
 * 废品价格爬虫 - 服务端运行（GitHub Actions）
 * 直接请求目标网站，解析 HTML，输出 JSON
 */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ==================== 品类匹配表 ====================
const CATEGORY_KEYWORDS = {
  // 废纸
  'paper_huangban':   ['黄板纸', '黄板', '黄纸板'],
  'paper_shuzhi':     ['书纸', '书本纸', '书页纸'],
  'paper_baozhi':     ['报纸', '废报纸', '旧报纸'],
  'paper_zhixiang':   ['纸箱', '废纸箱', '箱板纸'],
  'paper_waiboxhi':   ['瓦楞纸', '瓦楞'],
  'paper_baizhibian': ['白纸边', '白边纸', '白纸'],
  'paper_hunhe':      ['混合废纸', '统废纸', '杂纸'],
  // 废塑料
  'plastic_pet':  ['PET', 'pet', '瓶片', 'PET瓶'],
  'plastic_pe':   ['PE', 'pe', 'PE膜', '高压PE'],
  'plastic_pp':   ['PP', 'pp', 'PP编织袋', '聚丙烯'],
  'plastic_pvc':  ['PVC', 'pvc', 'PVC硬质'],
  'plastic_abs':  ['ABS', 'abs'],
  'plastic_pc':   ['PC', 'pc', 'PC塑料'],
  'plastic_ps':   ['PS', 'ps', 'PS塑料'],
  // 废金属
  'metal_iron':     ['废铁', '生铁', '铸铁'],
  'metal_copper':   ['废铜', '紫铜', '黄铜', '铜'],
  'metal_aluminum': ['废铝', '铝'],
  'metal_steel':    ['不锈钢', '废不锈钢'],
  'metal_zinc':     ['废锌', '锌'],
  'metal_lead':     ['废铅', '铅'],
  'metal_tin':      ['废锡', '锡'],
  // 废玻璃
  'glass_flat':   ['平板玻璃', '废平板'],
  'glass_bottle': ['瓶玻璃', '废玻璃瓶', '玻璃瓶'],
  // 废家电
  'appliance_fridge': ['冰箱', '废冰箱'],
  'appliance_washer': ['洗衣机', '废洗衣机'],
  'appliance_ac':     ['空调', '废空调'],
  'appliance_tv':     ['电视', '废电视'],
  'appliance_phone':  ['手机', '废手机'],
  // 废橡胶
  'rubber_tire': ['轮胎', '废轮胎'],
  'rubber_hose': ['胶管', '废胶管'],
};

function matchCategory(name) {
  const lower = name.toLowerCase();
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return catId;
    }
  }
  return null;
}

// ==================== 通用抓取函数 ====================
async function fetchHTML(url, headers = {}) {
  try {
    const resp = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    });
    return { success: true, html: resp.data, url };
  } catch (e) {
    return { success: false, error: e.message, url };
  }
}

function parsePrice(priceText) {
  if (!priceText) return NaN;
  // 提取数字，处理千位分隔符
  const cleaned = String(priceText).replace(/[^\d.,]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? NaN : num;
}

// ==================== 站点爬虫 ====================

// 站点1: 金投网 - 废金属价格
async function scrapeCngoldMetal() {
  const results = [];
  const urls = [
    'https://jiage.cngold.org/feijinshu/tong.shtml',
    'https://jiage.cngold.org/feijinshu/lv.shtml',
    'https://jiage.cngold.org/feijinshu/xin.shtml',
    'https://jiage.cngold.org/feijinshu/qian.shtml',
  ];

  for (const url of urls) {
    const resp = await fetchHTML(url);
    if (!resp.success) {
      results.push({ site: '金投网', url, error: resp.error });
      continue;
    }

    const $ = cheerio.load(resp.html);
    // 金投网价格表格
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const name = $(cells[0]).text().trim();
      const priceText = $(cells[1]).text().trim();
      const price = parsePrice(priceText);

      const catId = matchCategory(name);
      if (!catId || isNaN(price) || price <= 0) return;

      results.push({
        site: '金投网',
        url,
        category_id: catId,
        name: name,
        price: price,
      });
    });
  }

  return results;
}

// 站点2: ZZ91再生网 - 废金属/废塑料/废纸行情
async function scrapeZZ91() {
  const results = [];
  const urls = [
    { url: 'https://www.zz91.com/hangqing/feijinshu/', type: 'metal' },
    { url: 'https://www.zz91.com/hangqing/feisuliao/', type: 'plastic' },
    { url: 'https://www.zz91.com/hangqing/feizhi/', type: 'paper' },
  ];

  for (const { url } of urls) {
    const resp = await fetchHTML(url);
    if (!resp.success) {
      results.push({ site: 'ZZ91再生网', url, error: resp.error });
      continue;
    }

    const $ = cheerio.load(resp.html);

    // 尝试多种选择器
    const selectors = [
      '.hangqing-list .item',
      '.market-list .item',
      '.price-list li',
      'table tr',
      '.list-box .item',
      '.hq-list li',
    ];

    let found = false;
    for (const sel of selectors) {
      const items = $(sel);
      if (items.length === 0) continue;

      items.each((i, item) => {
        // 尝试提取名称和价格
        const text = $(item).text().trim();
        if (text.length < 3 || text.length > 200) return;

        // 使用正则提取品名和价格
        const priceMatch = text.match(/([\d,]+\.?\d*)\s*(?:元|¥|￥)/);
        if (!priceMatch) return;

        const price = parsePrice(priceMatch[1]);
        if (isNaN(price) || price <= 0) return;

        // 品名在价格之前
        const namePart = text.substring(0, text.indexOf(priceMatch[0])).trim();
        const name = namePart.replace(/[\d\s]+/g, '').trim();

        const catId = matchCategory(name);
        if (!catId) return;

        results.push({
          site: 'ZZ91再生网',
          url,
          category_id: catId,
          name: name,
          price: price,
        });
        found = true;
      });

      if (found) break;
    }

    if (!found) {
      results.push({ site: 'ZZ91再生网', url, error: '未匹配到数据' });
    }
  }

  return results;
}

// 站点3: Feijiu.net - 绵阳地区废品价格
async function scrapeFeijiuMianyang() {
  const results = [];
  const urls = [
    'https://www.feijiu.net/mianyang-FeiJinShu/',
    'https://www.feijiu.net/mianyang-FeiZhi/',
    'https://www.feijiu.net/mianyang-FeiSuLiao/',
  ];

  for (const url of urls) {
    const resp = await fetchHTML(url);
    if (!resp.success) {
      results.push({ site: 'Feijiu绵阳', url, error: resp.error });
      continue;
    }

    const $ = cheerio.load(resp.html);

    // Feijiu.net 价格列表
    const selectors = [
      '.hq-list .hq-item',
      '.market-list li',
      'table tr',
      '.list-item',
    ];

    let found = false;
    for (const sel of selectors) {
      const items = $(sel);
      if (items.length === 0) continue;

      items.each((i, item) => {
        const text = $(item).text().trim();
        if (text.length < 3) return;

        const priceMatch = text.match(/([\d,]+\.?\d*)\s*(?:元|¥|￥)/);
        if (!priceMatch) return;

        const price = parsePrice(priceMatch[1]);
        if (isNaN(price) || price <= 0) return;

        const namePart = text.substring(0, text.indexOf(priceMatch[0])).trim();
        const name = namePart.replace(/[\d\s]+/g, '').trim();

        const catId = matchCategory(name);
        if (!catId) return;

        results.push({
          site: 'Feijiu绵阳',
          url,
          category_id: catId,
          name: name,
          price: price,
        });
        found = true;
      });

      if (found) break;
    }

    if (!found) {
      results.push({ site: 'Feijiu绵阳', url, error: '未匹配到数据' });
    }
  }

  return results;
}

// 站点4: 废品之家
async function scrapeFeipinZhijia() {
  const results = [];
  const url = 'https://www.feipinzhijia.com/hangqing/';

  const resp = await fetchHTML(url);
  if (!resp.success) {
    results.push({ site: '废品之家', url, error: resp.error });
    return results;
  }

  const $ = cheerio.load(resp.html);

  $('.price-list li, .list li, table tr, .item').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length < 3) return;

    const priceMatch = text.match(/([\d,]+\.?\d*)\s*(?:元|¥|￥)/);
    if (!priceMatch) return;

    const price = parsePrice(priceMatch[1]);
    if (isNaN(price) || price <= 0) return;

    const namePart = text.substring(0, text.indexOf(priceMatch[0])).trim();
    const name = namePart.replace(/[\d\s]+/g, '').trim();

    const catId = matchCategory(name);
    if (!catId) return;

    results.push({
      site: '废品之家',
      url,
      category_id: catId,
      name: name,
      price: price,
    });
  });

  if (results.length === 0) {
    results.push({ site: '废品之家', url, error: '未匹配到数据' });
  }

  return results;
}

// 站点5: 我的钢铁网 - 废钢价格
async function scrapeMysteel() {
  const results = [];
  const url = 'https://www.mysteel.com/feigang.htm';

  const resp = await fetchHTML(url);
  if (!resp.success) {
    results.push({ site: '我的钢铁网', url, error: resp.error });
    return results;
  }

  const $ = cheerio.load(resp.html);

  $('table tr, .list li, .item').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length < 3) return;

    const priceMatch = text.match(/([\d,]+\.?\d*)\s*(?:元|¥|￥)/);
    if (!priceMatch) return;

    const price = parsePrice(priceMatch[1]);
    if (isNaN(price) || price <= 0) return;

    const namePart = text.substring(0, text.indexOf(priceMatch[0])).trim();
    const name = namePart.replace(/[\d\s]+/g, '').trim();

    const catId = matchCategory(name);
    if (!catId) return;

    results.push({
      site: '我的钢铁网',
      url,
      category_id: catId,
      name: name,
      price: price,
    });
  });

  if (results.length === 0) {
    results.push({ site: '我的钢铁网', url, error: '未匹配到数据' });
  }

  return results;
}

// ==================== 主流程 ====================
async function main() {
  console.log('🚀 开始抓取废品价格...\n');

  const allRaw = [];
  const errors = [];

  // 串行抓取各站点
  const scrapers = [
    { name: '金投网(废金属)', fn: scrapeCngoldMetal },
    { name: 'ZZ91再生网', fn: scrapeZZ91 },
    { name: 'Feijiu绵阳', fn: scrapeFeijiuMianyang },
    { name: '废品之家', fn: scrapeFeipinZhijia },
    { name: '我的钢铁网', fn: scrapeMysteel },
  ];

  for (const { name, fn } of scrapers) {
    console.log(`📡 抓取: ${name}...`);
    const results = await fn();
    const prices = results.filter(r => r.category_id && r.price);
    const errs = results.filter(r => r.error);

    console.log(`   ✅ ${prices.length} 条价格, ❌ ${errs.length} 个错误`);

    if (prices.length > 0) {
      // 详细输出
      prices.slice(0, 5).forEach(p => {
        console.log(`      ${p.name}: ¥${p.price} (${p.category_id})`);
      });
      if (prices.length > 5) console.log(`      ... 还有 ${prices.length - 5} 条`);
    }

    allRaw.push(...prices);
    errors.push(...errs.map(e => ({ site: name, ...e })));
  }

  // ==================== 合并去重，取平均价 ====================
  const byCategory = {};
  for (const r of allRaw) {
    if (!byCategory[r.category_id]) {
      byCategory[r.category_id] = { prices: [], names: [], sites: [] };
    }
    byCategory[r.category_id].prices.push(r.price);
    if (!byCategory[r.category_id].names.includes(r.name)) {
      byCategory[r.category_id].names.push(r.name);
    }
    if (!byCategory[r.category_id].sites.includes(r.site)) {
      byCategory[r.category_id].sites.push(r.site);
    }
  }

  const prices = [];
  for (const [catId, data] of Object.entries(byCategory)) {
    const avgPrice = Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length);
    prices.push({
      category_id: catId,
      name: data.names[0],
      buy_price: Math.round(avgPrice * 0.97),   // 收购 ≈ 行情 * 97%
      sell_price: Math.round(avgPrice * 1.01),   // 卖出 ≈ 行情 * 101%
      raw_avg_price: avgPrice,
      sample_count: data.prices.length,
      sources: data.sites,
      scraped_at: new Date().toISOString(),
    });
  }

  // ==================== 输出 ====================
  const output = {
    version: '1.0.0',
    scraped_at: new Date().toISOString(),
    total_categories: prices.length,
    total_raw: allRaw.length,
    errors: errors,
    prices: prices,
  };

  const outPath = path.join(__dirname, '..', 'data', 'scraped-prices.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n📊 最终输出: ${prices.length} 个品类`);
  console.log(`📁 已保存: ${outPath}`);
  console.log(`⚠️ 错误: ${errors.length} 个`);

  // 详细错误日志
  if (errors.length > 0) {
    console.log('\n错误详情:');
    errors.forEach(e => console.log(`  [${e.site}] ${e.error || '未匹配'}`));
  }
}

main().catch(err => {
  console.error('爬虫异常:', err);
  process.exit(1);
});
