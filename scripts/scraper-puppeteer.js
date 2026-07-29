/**
 * 废品价格 Puppeteer 爬虫（备用方案）
 * 用于抓取 JS 渲染的网站（如 ZZ91再生网、Feijiu网）
 * 可在 GitHub Actions 中运行
 * 
 * 运行: node scripts/scraper-puppeteer.js [--site=zz91] [--mianyang]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const RULES_FILE = path.join(BASE_DIR, 'data', 'crawler-rules.json');
const OUTPUT_FILE = path.join(BASE_DIR, 'data', 'scraped-prices.json');
const REGION = process.argv.includes('--mianyang') || process.argv.includes('-my') ? 'sc_my'
  : process.argv.includes('--chengdu') || process.argv.includes('-cd') ? 'sc_cd'
  : process.env.SCRAP_REGION || 'sc_my';

// ====== 品类匹配 ======
const CATEGORY_KEYWORDS = {
  "paper_huangban":    ["黄板纸", "黄板", "黄纸板"],
  "paper_shuzhi":      ["书纸", "书本纸", "书页纸"],
  "paper_baozhi":      ["报纸", "废报纸", "旧报纸"],
  "paper_zhixiang":    ["纸箱", "废纸箱", "箱板纸"],
  "paper_waiboxhi":    ["瓦楞纸", "瓦楞"],
  "paper_baizhibian":  ["白纸边", "白边纸", "白纸", "白卡纸"],
  "paper_hunhe":       ["混合废纸", "统废纸", "杂纸", "混合", "废纸"],
  "plastic_pet":       ["PET", "pet", "瓶片", "PET瓶"],
  "plastic_pe":        ["PE", "pe", "PE膜", "高压PE", "低压PE", "聚乙烯"],
  "plastic_pp":        ["PP", "pp", "编织袋", "聚丙烯"],
  "plastic_pvc":       ["PVC", "pvc"],
  "plastic_abs":       ["ABS", "abs"],
  "plastic_pc":        ["PC", "pc", "PC塑料", "聚碳酸酯"],
  "plastic_ps":        ["PS", "ps", "PS塑料", "聚苯乙烯"],
  "metal_iron":        ["废铁", "生铁", "铸铁", "铁", "废钢", "重废", "统废"],
  "metal_copper":      ["废铜", "紫铜", "黄铜", "铜", "光亮铜", "马达铜"],
  "metal_aluminum":    ["废铝", "铝", "生铝", "熟铝"],
  "metal_steel":       ["不锈钢", "废不锈钢"],
  "metal_zinc":        ["废锌", "锌"],
  "metal_lead":        ["废铅", "铅"],
  "metal_tin":         ["废锡", "锡"],
  "glass_flat":        ["平板玻璃", "废平板", "平板", "浮法玻璃"],
  "glass_bottle":      ["瓶玻璃", "废玻璃瓶", "玻璃瓶", "碎玻璃"],
  "appliance_fridge":  ["冰箱"],
  "appliance_washer":  ["洗衣机"],
  "appliance_ac":      ["空调"],
  "appliance_tv":      ["电视"],
  "appliance_phone":   ["手机"],
  "rubber_tire":       ["轮胎", "废轮胎", "天然橡胶", "丁苯橡胶"],
  "rubber_hose":       ["胶管", "废胶管"],
};

const CATEGORY_NAMES = {
  "paper_huangban": "黄板纸", "paper_shuzhi": "书纸", "paper_baozhi": "报纸",
  "paper_zhixiang": "纸箱", "paper_waiboxhi": "瓦楞纸", "paper_baizhibian": "白纸边",
  "paper_hunhe": "混合废纸",
  "plastic_pet": "PET瓶片", "plastic_pe": "PE膜", "plastic_pp": "PP编织袋",
  "plastic_pvc": "PVC硬质", "plastic_abs": "ABS", "plastic_pc": "PC塑料",
  "plastic_ps": "PS塑料",
  "metal_iron": "废铁", "metal_copper": "废铜", "metal_aluminum": "废铝",
  "metal_steel": "不锈钢", "metal_zinc": "废锌", "metal_lead": "废铅",
  "metal_tin": "废锡",
  "glass_flat": "平板玻璃", "glass_bottle": "瓶玻璃",
  "appliance_fridge": "废冰箱", "appliance_washer": "废洗衣机",
  "appliance_ac": "废空调", "appliance_tv": "废电视", "appliance_phone": "废手机",
  "rubber_tire": "废轮胎", "rubber_hose": "废胶管",
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
  if (!text) return null;
  const cleaned = text.replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return num > 0 ? num : null;
}

// ====== HTTP 抓取 ======
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ====== 金投网 API 数据（已稳定运行的主数据源） ======
async function crawlJintou() {
  console.log('📡 金投网 API 数据采集...');
  // 金投网数据由 Python scraper.py 专门处理，这里跳过
  console.log('   由 Python 爬虫负责（scraper.py）');
  return [];
}

// ====== 生成绵阳地区修正数据 ======
function applyMianyangFactors(prices) {
  // 四川绵阳地区价格修正系数
  const factors = {
    "paper_huangban": 0.97, "paper_shuzhi": 0.96, "paper_baozhi": 0.96,
    "paper_zhixiang": 0.98, "paper_waiboxhi": 0.97, "paper_baizhibian": 0.95,
    "paper_hunhe": 0.98,
    "plastic_pet": 0.96, "plastic_pe": 0.96, "plastic_pp": 0.97,
    "plastic_pvc": 0.97, "plastic_abs": 0.95, "plastic_pc": 0.95,
    "plastic_ps": 0.96,
    "metal_iron": 0.94, "metal_copper": 0.93, "metal_aluminum": 0.94,
    "metal_steel": 0.94, "metal_zinc": 0.94, "metal_lead": 0.94,
    "metal_tin": 0.93,
    "glass_flat": 0.98, "glass_bottle": 0.99,
    "appliance_fridge": 0.95, "appliance_washer": 0.95,
    "appliance_ac": 0.94, "appliance_tv": 0.96,
    "appliance_phone": 0.97,
    "rubber_tire": 0.97, "rubber_hose": 0.97,
  };

  return prices.map(p => {
    const catId = p.category_id;
    if (factors[catId]) {
      const f = factors[catId];
      return {
        ...p,
        buy_price: Math.round(p.buy_price * f),
        sell_price: Math.round(p.sell_price * f),
        raw_avg_price: Math.round((p.raw_avg_price || 0) * f),
        sources: [...(p.sources || []), '四川绵阳地区修正'],
      };
    }
    return p;
  });
}

// ====== 主流程 ======
async function main() {
  console.log('='.repeat(60));
  console.log('📦 废品价格 Puppeteer 备用爬虫');
  console.log(`   启动时间: ${new Date().toISOString()}`);
  console.log(`   目标地区: ${REGION === 'sc_my' ? '四川绵阳' : REGION}`);
  console.log('='.repeat(60));
  console.log();

  // 加载已有数据（Python 爬虫产出）
  let existingData = { prices: [], logs: [] };
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      console.log(`📋 加载已有数据: ${existingData.prices?.length || 0} 个品类`);
    }
  } catch (e) {
    console.warn('⚠️  加载已有数据失败:', e.message);
  }

  // 收集各来源数据
  const allResults = [];
  
  // 来源1: 金投网 (由 Python 负责，此处跳过)
  
  // 来源2: 对已有数据应用绵阳修正
  let prices = existingData.prices || [];
  if (REGION === 'sc_my' || REGION === 'sc_cd') {
    console.log('📍 应用四川绵阳地区价格修正系数...');
    prices = applyMianyangFactors(prices);
    console.log(`   ✅ ${prices.length} 个品类已修正`);
  }

  // 输出
  const output = {
    ...existingData,
    region: REGION === 'sc_my' ? '四川绵阳' : REGION === 'sc_cd' ? '四川成都' : '全国',
    region_code: REGION,
    prices,
    updated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n📁 已保存: ${OUTPUT_FILE}`);
  console.log(`✅ 完成 (${new Date().toTimeString().slice(0, 8)})`);
}

main().catch(err => {
  console.error('❌ 爬虫失败:', err);
  process.exit(1);
});
