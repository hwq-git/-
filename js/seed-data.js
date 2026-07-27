/**
 * 种子数据 - 30+废品品类 + 3个月历史价格
 * 出厂内置参考价，断网也能查
 * 
 * 【方案A】支持外部 data/crawler-rules.json 热更新爬虫规则
 */

// ==================== 品类定义 ====================
const CATEGORIES = [
  // === 废纸类 ===
  { id: 'paper_huangban', name: '黄板纸', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 1, icon: '📄' },
  { id: 'paper_shuzhi', name: '书纸', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 2, icon: '📄' },
  { id: 'paper_baozhi', name: '报纸', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 3, icon: '📄' },
  { id: 'paper_zhixiang', name: '纸箱', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 4, icon: '📄' },
  { id: 'paper_waiboxhi', name: '瓦楞纸', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 5, icon: '📄' },
  { id: 'paper_baizhibian', name: '白纸边', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 6, icon: '📄' },
  { id: 'paper_hunhe', name: '混合废纸', unit: '元/吨', parent: '废纸', parent_id: 'cat_paper', sort: 7, icon: '📄' },

  // === 废塑料类 ===
  { id: 'plastic_pet', name: 'PET瓶片', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 10, icon: '🧴' },
  { id: 'plastic_pe', name: 'PE膜', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 11, icon: '🧴' },
  { id: 'plastic_pp', name: 'PP编织袋', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 12, icon: '🧴' },
  { id: 'plastic_pvc', name: 'PVC硬质', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 13, icon: '🧴' },
  { id: 'plastic_abs', name: 'ABS', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 14, icon: '🧴' },
  { id: 'plastic_pc', name: 'PC塑料', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 15, icon: '🧴' },
  { id: 'plastic_ps', name: 'PS塑料', unit: '元/吨', parent: '废塑料', parent_id: 'cat_plastic', sort: 16, icon: '🧴' },

  // === 废金属类 ===
  { id: 'metal_iron', name: '废铁', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 20, icon: '⚙️' },
  { id: 'metal_copper', name: '废铜', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 21, icon: '⚙️' },
  { id: 'metal_aluminum', name: '废铝', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 22, icon: '⚙️' },
  { id: 'metal_steel', name: '不锈钢', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 23, icon: '⚙️' },
  { id: 'metal_zinc', name: '废锌', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 24, icon: '⚙️' },
  { id: 'metal_lead', name: '废铅', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 25, icon: '⚙️' },
  { id: 'metal_tin', name: '废锡', unit: '元/吨', parent: '废金属', parent_id: 'cat_metal', sort: 26, icon: '⚙️' },

  // === 废玻璃类 ===
  { id: 'glass_flat', name: '平板玻璃', unit: '元/吨', parent: '废玻璃', parent_id: 'cat_glass', sort: 30, icon: '🪟' },
  { id: 'glass_bottle', name: '瓶玻璃', unit: '元/吨', parent: '废玻璃', parent_id: 'cat_glass', sort: 31, icon: '🪟' },

  // === 废家电类 ===
  { id: 'appliance_fridge', name: '废冰箱', unit: '元/台', parent: '废家电', parent_id: 'cat_appliance', sort: 40, icon: '🔌' },
  { id: 'appliance_washer', name: '废洗衣机', unit: '元/台', parent: '废家电', parent_id: 'cat_appliance', sort: 41, icon: '🔌' },
  { id: 'appliance_ac', name: '废空调', unit: '元/台', parent: '废家电', parent_id: 'cat_appliance', sort: 42, icon: '🔌' },
  { id: 'appliance_tv', name: '废电视', unit: '元/台', parent: '废家电', parent_id: 'cat_appliance', sort: 43, icon: '🔌' },
  { id: 'appliance_phone', name: '废手机', unit: '元/台', parent: '废家电', parent_id: 'cat_appliance', sort: 44, icon: '🔌' },

  // === 废橡胶类 ===
  { id: 'rubber_tire', name: '废轮胎', unit: '元/吨', parent: '废橡胶', parent_id: 'cat_rubber', sort: 50, icon: '🛞' },
  { id: 'rubber_hose', name: '废胶管', unit: '元/吨', parent: '废橡胶', parent_id: 'cat_rubber', sort: 51, icon: '🛞' },
];

const PARENT_CATEGORIES = [
  { id: 'cat_paper', name: '废纸', unit: '', parent_id: null, sort_order: 1, icon: '📄' },
  { id: 'cat_plastic', name: '废塑料', unit: '', parent_id: null, sort_order: 2, icon: '🧴' },
  { id: 'cat_metal', name: '废金属', unit: '', parent_id: null, sort_order: 3, icon: '⚙️' },
  { id: 'cat_glass', name: '废玻璃', unit: '', parent_id: null, sort_order: 4, icon: '🪟' },
  { id: 'cat_appliance', name: '废家电', unit: '', parent_id: null, sort_order: 5, icon: '🔌' },
  { id: 'cat_rubber', name: '废橡胶', unit: '', parent_id: null, sort_order: 6, icon: '🛞' },
];

// ==================== 基准价格 ====================
const BASE_PRICES = {
  paper_huangban:    { buy: 1450, sell: 1550, volatility: 0.04 },
  paper_shuzhi:      { buy: 1280, sell: 1380, volatility: 0.035 },
  paper_baozhi:      { buy: 1620, sell: 1720, volatility: 0.03 },
  paper_zhixiang:    { buy: 1380, sell: 1480, volatility: 0.04 },
  paper_waiboxhi:    { buy: 1320, sell: 1420, volatility: 0.04 },
  paper_baizhibian:  { buy: 1850, sell: 1950, volatility: 0.03 },
  paper_hunhe:       { buy: 1050, sell: 1150, volatility: 0.05 },

  plastic_pet:       { buy: 4200, sell: 4400, volatility: 0.06 },
  plastic_pe:        { buy: 3800, sell: 4000, volatility: 0.06 },
  plastic_pp:        { buy: 3500, sell: 3700, volatility: 0.05 },
  plastic_pvc:       { buy: 3200, sell: 3400, volatility: 0.05 },
  plastic_abs:       { buy: 8500, sell: 8800, volatility: 0.07 },
  plastic_pc:        { buy: 9200, sell: 9500, volatility: 0.07 },
  plastic_ps:        { buy: 5800, sell: 6100, volatility: 0.06 },

  metal_iron:        { buy: 2350, sell: 2480, volatility: 0.05 },
  metal_copper:      { buy: 52000, sell: 53500, volatility: 0.08 },
  metal_aluminum:    { buy: 14800, sell: 15300, volatility: 0.06 },
  metal_steel:       { buy: 8500, sell: 8900, volatility: 0.05 },
  metal_zinc:        { buy: 18500, sell: 19200, volatility: 0.07 },
  metal_lead:        { buy: 15200, sell: 15800, volatility: 0.06 },
  metal_tin:         { buy: 210000, sell: 215000, volatility: 0.08 },

  glass_flat:        { buy: 850, sell: 950, volatility: 0.04 },
  glass_bottle:      { buy: 650, sell: 750, volatility: 0.05 },

  appliance_fridge:  { buy: 80, sell: 120, volatility: 0.08 },
  appliance_washer:  { buy: 60, sell: 100, volatility: 0.08 },
  appliance_ac:      { buy: 120, sell: 180, volatility: 0.10 },
  appliance_tv:      { buy: 50, sell: 90, volatility: 0.08 },
  appliance_phone:   { buy: 15, sell: 35, volatility: 0.15 },

  rubber_tire:       { buy: 1200, sell: 1350, volatility: 0.05 },
  rubber_hose:       { buy: 1800, sell: 1950, volatility: 0.05 },
};

// ==================== 地区数据 ====================
const REGIONS = [
  { id: 'region_default', name: '默认地区', parent_id: null, level: 0 },
  { id: 'region_huadong', name: '华东地区', parent_id: null, level: 1 },
  { id: 'region_shanghai', name: '上海市', parent_id: 'region_huadong', level: 2 },
  { id: 'region_jiangsu', name: '江苏省', parent_id: 'region_huadong', level: 2 },
  { id: 'region_zhejiang', name: '浙江省', parent_id: 'region_huadong', level: 2 },
  { id: 'region_huanan', name: '华南地区', parent_id: null, level: 1 },
  { id: 'region_guangdong', name: '广东省', parent_id: 'region_huanan', level: 2 },
  { id: 'region_huabei', name: '华北地区', parent_id: null, level: 1 },
  { id: 'region_beijing', name: '北京市', parent_id: 'region_huabei', level: 2 },
  { id: 'region_tianjin', name: '天津市', parent_id: 'region_huabei', level: 2 },
];

// ==================== 生成3个月历史价格 ====================
function generateSeedPrices() {
  const prices = [];
  const now = new Date();
  const days = 90;

  for (const cat of CATEGORIES) {
    const base = BASE_PRICES[cat.id];
    if (!base) continue;

    let currentBuy = base.buy;
    let currentSell = base.sell;

    for (let d = days; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const change = (Math.random() - 0.48) * base.volatility;
      currentBuy = Math.round(currentBuy * (1 + change));
      currentSell = Math.round(currentSell * (1 + change));

      const spread = Math.max(Math.round(base.sell - base.buy), 50);
      currentSell = currentBuy + spread + Math.round(Math.random() * spread * 0.3);

      currentBuy = Math.max(Math.round(base.buy * 0.8), Math.min(Math.round(base.buy * 1.2), currentBuy));
      currentSell = Math.max(Math.round(base.sell * 0.8), Math.min(Math.round(base.sell * 1.2), currentSell));

      prices.push({
        id: `seed_${cat.id}_${d}`,
        category_id: cat.id,
        buy_price: currentBuy,
        sell_price: currentSell,
        region_code: 'default',
        source: 'seed',
        source_detail: '系统参考价',
        recorded_at: date.toISOString(),
        created_at: date.toISOString(),
      });
    }
  }

  return prices;
}

// ==================== 内置爬虫规则（后备方案） ====================
const CRAWLER_RULES = {
  version: '1.0.2',
  updated_at: new Date().toISOString(),
  sites: [
    {
      name: '废品之家',
      baseUrl: 'https://www.feipinzhijia.com/hangqing/',
      listSelector: '.price-list li',
      fields: { category: '.name', price: '.price-value', change: '.change', date: '.date' },
      intervalMinutes: 120,
      enabled: true
    },
    {
      name: 'Feijiu网',
      baseUrl: 'http://apps.feijiu.net/',
      listSelector: '.hq-list .hq-item',
      fields: { category: '.hq-name', price: '.hq-price', change: '.hq-change', date: '.hq-date' },
      intervalMinutes: 180,
      enabled: true
    },
    {
      name: '91再生',
      baseUrl: 'https://jiage.zz91.com/',
      listSelector: '.market-list .item',
      fields: { category: '.title', price: '.price', change: '.trend', date: '.time' },
      intervalMinutes: 240,
      enabled: true
    },
  ]
};

// ==================== 核心：初始化种子数据（支持外部JSON热更新） ====================
async function initSeedData() {
  // ---------- 第1步：尝试加载外部 JSON 配置 ----------
  let externalRules = null;
  let loadError = null;

  try {
    // 加时间戳防止缓存
    const resp = await fetch('./data/crawler-rules.json?v=' + Date.now());
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法加载爬虫规则文件`);
    }
    const text = await resp.text();
    try {
      externalRules = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`JSON解析失败: ${parseErr.message}（请检查 data/crawler-rules.json 是否包含 // 注释或尾随逗号）`);
    }
    // 验证规则格式
    if (!externalRules.sites || !Array.isArray(externalRules.sites)) {
      throw new Error('规则格式错误：缺少 sites 数组');
    }
    console.log(`[Seed] ✅ 外部爬虫规则加载成功: v${externalRules.version}, ${externalRules.sites.length}个站点`);
    externalRules.sites.forEach((site, i) => {
      console.log(`  [${i + 1}] ${site.name}: ${site.baseUrl}`);
    });
  } catch (e) {
    loadError = e.message;
    console.warn('[Seed] ⚠️ 外部规则加载失败，回退到内置规则:', e.message);
  }

  // ---------- 第2步：确定最终使用的规则 ----------
  const rules = externalRules || CRAWLER_RULES;
  const currentVersion = rules.version || '1.0.0';

  // ---------- 第3步：检查是否需要首次初始化 ----------
  const initialized = await DB.getSetting('seed_initialized', false);
  const seedVersion = await DB.getSetting('seed_version', '0.0.0');
  const lastRulesVersion = await DB.getSetting('last_crawler_rules_version', '0.0.0');

  // 首次初始化：写入品类、价格、地区、默认设置
  if (!initialized) {
    console.log(`[Seed] 🚀 首次初始化种子数据... (版本 ${currentVersion})`);

    // 写入父级品类
    await DB.bulkPut('categories', PARENT_CATEGORIES.map(c => ({
      ...c,
      name: c.name,
      unit: c.unit || '',
      sort_order: c.sort_order,
    })));

    // 写入子品类
    await DB.bulkPut('categories', CATEGORIES.map(c => ({
      id: c.id,
      name: c.name,
      unit: c.unit,
      parent_id: c.parent_id,
      sort_order: c.sort,
      icon: c.icon,
    })));

    // 写入90天历史价格
    const prices = generateSeedPrices();
    await DB.bulkPut('prices', prices);

    // 写入地区
    await DB.bulkPut('regions', REGIONS);

    // 写入默认设置
    await DB.setSetting('current_region', 'default');
    await DB.setSetting('crawler_enabled', true);
    await DB.setSetting('crawler_wifi_only', true);
    await DB.setSetting('crawler_min_battery', 20);
    await DB.setSetting('crawler_interval_minutes', 120);
    await DB.setSetting('last_crawl_at', null);
    await DB.setSetting('last_crawl_status', null);

    // 标记已初始化
    await DB.setSetting('seed_initialized', true);
  }

  // ---------- 第4步：同步爬虫配置到数据库 ----------
  // 核心逻辑：只要外部JSON加载成功，每次启动都全量同步爬虫配置
  // 这样用户改了 crawler-rules.json 刷新就生效，不需要手动改版本号

  if (externalRules) {
    console.log(`[Seed] 🔄 同步爬虫配置（来源：外部JSON v${currentVersion}）...`);

    // 先清空旧配置（处理站点增减/改名的情况）
    await DB.clear('crawler_configs');

    const crawlerConfigs = rules.sites.map((site, i) => ({
      id: `crawler_${i}`,
      website_name: site.name,
      base_url: site.baseUrl,
      css_selector: site.listSelector,
      fields: JSON.stringify(site.fields),
      enabled: site.enabled !== false,
      interval_minutes: site.intervalMinutes || 120,
      last_success_at: null,
      last_error: null,
      version: currentVersion,
    }));

    await DB.bulkPut('crawler_configs', crawlerConfigs);
    await DB.setSetting('last_crawler_rules_version', currentVersion);
    await DB.setSetting('crawler_rules_source', 'external_json');

    console.log(`[Seed] ✅ 爬虫配置已同步: ${rules.sites.length} 个站点`);
    rules.sites.forEach((site, i) => {
      console.log(`  [${i + 1}] ${site.name} → ${site.baseUrl} ${site.enabled !== false ? '✓' : '✗'}`);
    });
  } else if (!initialized || lastRulesVersion !== currentVersion) {
    // 外部JSON加载失败 + 首次安装或内置规则版本变化，用内置规则初始化
    console.log(`[Seed] 🔄 初始化爬虫配置（来源：内置规则 v${currentVersion}）...`);

    await DB.clear('crawler_configs');
    const crawlerConfigs = rules.sites.map((site, i) => ({
      id: `crawler_${i}`,
      website_name: site.name,
      base_url: site.baseUrl,
      css_selector: site.listSelector,
      fields: JSON.stringify(site.fields),
      enabled: site.enabled !== false,
      interval_minutes: site.intervalMinutes || 120,
      last_success_at: null,
      last_error: null,
      version: currentVersion,
    }));

    await DB.bulkPut('crawler_configs', crawlerConfigs);
    await DB.setSetting('last_crawler_rules_version', currentVersion);
    await DB.setSetting('crawler_rules_source', 'builtin');

    console.log(`[Seed] ✅ 爬虫配置已初始化: ${rules.sites.length} 个站点`);
  } else {
    console.log(`[Seed] ⏭️ 外部JSON不可用，保留已有爬虫配置 (v${lastRulesVersion})`);
  }

  if (!initialized) {
    const priceCount = (await DB.getAll('prices')).length;
    console.log(`[Seed] 🎉 首次初始化完成：${CATEGORIES.length}个品类，${priceCount}条价格记录`);
  }

  return true;
}