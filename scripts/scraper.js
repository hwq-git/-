/**
 * 废品价格爬虫 - Puppeteer 版
 * 使用无头浏览器渲染 JS，抓取真实价格数据
 * 运行: node scripts/scraper.js
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ==================== 品类匹配表 ====================
const CATEGORY_KEYWORDS = {
  'paper_huangban':   ['黄板纸', '黄板', '黄纸板'],
  'paper_shuzhi':     ['书纸', '书本纸', '书页纸'],
  'paper_baozhi':     ['报纸', '废报纸', '旧报纸'],
  'paper_zhixiang':   ['纸箱', '废纸箱', '箱板纸'],
  'paper_waiboxhi':   ['瓦楞纸', '瓦楞'],
  'paper_baizhibian': ['白纸边', '白边纸', '白纸'],
  'paper_hunhe':      ['混合废纸', '统废纸', '杂纸', '混合'],
  'plastic_pet':  ['PET', 'pet', '瓶片', 'PET瓶'],
  'plastic_pe':   ['PE', 'pe', 'PE膜', '高压PE', '低压PE'],
  'plastic_pp':   ['PP', 'pp', '编织袋', '聚丙烯'],
  'plastic_pvc':  ['PVC', 'pvc'],
  'plastic_abs':  ['ABS', 'abs'],
  'plastic_pc':   ['PC', 'pc', 'PC塑料'],
  'plastic_ps':   ['PS', 'ps', 'PS塑料', '聚苯乙烯'],
  'metal_iron':     ['废铁', '生铁', '铸铁', '铁'],
  'metal_copper':   ['废铜', '紫铜', '黄铜', '铜'],
  'metal_aluminum': ['废铝', '铝'],
  'metal_steel':    ['不锈钢', '废不锈钢'],
  'metal_zinc':     ['废锌', '锌'],
  'metal_lead':     ['废铅', '铅'],
  'metal_tin':      ['废锡', '锡'],
  'glass_flat':   ['平板玻璃', '废平板', '平板'],
  'glass_bottle': ['瓶玻璃', '废玻璃瓶', '玻璃瓶', '碎玻璃'],
  'appliance_fridge': ['冰箱'],
  'appliance_washer': ['洗衣机'],
  'appliance_ac':     ['空调'],
  'appliance_tv':     ['电视'],
  'appliance_phone':  ['手机'],
  'rubber_tire': ['轮胎', '废轮胎'],
  'rubber_hose': ['胶管', '废胶管'],
};

function matchCategory(name) {
  const lower = name.toLowerCase().replace(/\s/g, '');
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return catId;
    }
  }
  return null;
}

function parsePrice(text) {
  if (!text) return NaN;
  const cleaned = String(text).replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? NaN : num;
}

// ==================== 各站点爬取逻辑 ====================

async function scrapeGoldPrice(page) {
  const results = [];
  console.log('  📡 金投网-废金属...');
  
  try {
    await page.goto('https://jiage.cngold.org/feijinshu/', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // 尝试提取表格数据
    const data = await page.evaluate(() => {
      const rows = [];
      // 尝试多种选择器
      const selectors = ['table tr', '.table-cont tr', '.price-table tr', 'tr'];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const name = cells[0].textContent.trim();
            const price = cells[1].textContent.trim();
            if (name && price && name.length < 50) {
              rows.push({ name, price });
            }
          }
        });
        if (rows.length > 0) break;
      }
      return rows;
    });
    
    for (const item of data) {
      const price = parsePrice(item.price);
      const catId = matchCategory(item.name);
      if (catId && !isNaN(price)) {
        results.push({ category_id: catId, name: item.name, price });
      }
    }
    console.log(`     ✅ ${results.length} 条`);
  } catch (e) {
    console.log(`     ❌ ${e.message}`);
  }
  
  return results;
}

async function scrapeFeijiu(page) {
  const results = [];
  console.log('  📡 Feijiu-绵阳废金属...');
  
  try {
    await page.goto('https://www.feijiu.net/mianyang-FeiJinShu/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 2000));
    
    const data = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('.hq-item, .hq-list li, table tr, .list-item').forEach(row => {
        const text = row.textContent.trim();
        if (text.length < 3 || text.length > 200) return;
        const priceMatch = text.match(/([\d,]+\.?\d*)\s*(?:元|¥)/);
        if (!priceMatch) return;
        const name = text.substring(0, text.indexOf(priceMatch[0])).replace(/[\d\s]+/g, '').trim();
        const price = priceMatch[1].replace(/,/g, '');
        if (name && price) rows.push({ name, price });
      });
      return rows;
    });
    
    for (const item of data) {
      const price = parsePrice(item.price);
      const catId = matchCategory(item.name);
      if (catId && !isNaN(price)) {
        results.push({ category_id: catId, name: item.name, price });
      }
    }
    console.log(`     ✅ ${results.length} 条`);
  } catch (e) {
    console.log(`     ❌ ${e.message}`);
  }
  
  return results;
}

async function scrapeZZ91(page) {
  const results = [];
  console.log('  📡 ZZ91再生网...');
  
  const urls = [
    'https://www.zz91.com/hangqing/feijinshu/',
    'https://www.zz91.com/hangqing/feizhi/',
  ];
  
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      
      const data = await page.evaluate(() => {
        const rows = [];
        document.querySelectorAll('.item, .hangqing-item, li, table tr').forEach(row => {
          const text = row.textContent.trim();
          if (text.length < 3 || text.length > 200) return;
          const priceMatch = text.match(/([\d,]+\.?\d*)\s*(?:元|¥)/);
          if (!priceMatch) return;
          const name = text.substring(0, text.indexOf(priceMatch[0])).replace(/[\d\s]+/g, '').trim();
          const price = priceMatch[1].replace(/,/g, '');
          if (name && price) rows.push({ name, price });
        });
        return rows;
      });
      
      for (const item of data) {
        const price = parsePrice(item.price);
        const catId = matchCategory(item.name);
        if (catId && !isNaN(price)) {
          results.push({ category_id: catId, name: item.name, price });
        }
      }
    } catch (e) {
      // skip individual URL errors
    }
  }
  console.log(`     ✅ ${results.length} 条`);
  return results;
}

// ==================== 主流程 ====================
async function main() {
  console.log('🚀 启动 Puppeteer 爬虫...\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 768 });
  
  let allResults = [];
  
  // 依次爬取各站点
  allResults.push(...(await scrapeGoldPrice(page)));
  allResults.push(...(await scrapeFeijiu(page)));
  allResults.push(...(await scrapeZZ91(page)));
  
  await browser.close();
  
  // ==================== 合并去重 ====================
  const byCategory = {};
  for (const r of allResults) {
    if (!byCategory[r.category_id]) {
      byCategory[r.category_id] = { prices: [], names: [] };
    }
    byCategory[r.category_id].prices.push(r.price);
    if (!byCategory[r.category_id].names.includes(r.name)) {
      byCategory[r.category_id].names.push(r.name);
    }
  }
  
  const prices = [];
  for (const [catId, data] of Object.entries(byCategory)) {
    const avgPrice = Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length);
    prices.push({
      category_id: catId,
      name: data.names[0],
      buy_price: Math.round(avgPrice * 0.97),
      sell_price: Math.round(avgPrice * 1.01),
      raw_avg_price: avgPrice,
      sample_count: data.prices.length,
      scraped_at: new Date().toISOString(),
    });
  }
  
  // ==================== 输出 ====================
  const output = {
    version: '1.0.0',
    scraped_at: new Date().toISOString(),
    total_categories: prices.length,
    total_raw: allResults.length,
    prices: prices,
  };
  
  const outPath = path.join(__dirname, '..', 'data', 'scraped-prices.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n📊 最终: ${prices.length} 个品类, ${allResults.length} 条原始数据`);
  console.log(`📁 已保存: ${outPath}`);
  
  if (prices.length > 0) {
    console.log('\n抓取结果:');
    prices.slice(0, 10).forEach(p => {
      console.log(`  ${p.name}: 收¥${p.buy_price} / 卖¥${p.sell_price} (${p.sample_count}条)`);
    });
  }
}

main().catch(err => {
  console.error('爬虫异常:', err.message);
  process.exit(1);
});
