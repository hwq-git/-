/**
 * 种子数据 - 30+废品品类 + 3个月历史价格
 * 出厂内置参考价，断网也能查
 */

// 品类定义
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

// 父级品类
const PARENT_CATEGORIES = [
  { id: 'cat_paper', name: '废纸', unit: '', parent_id: null, sort_order: 1, icon: '📄' },
  { id: 'cat_plastic', name: '废塑料', unit: '', parent_id: null, sort_order: 2, icon: '🧴' },
  { id: 'cat_metal', name: '废金属', unit: '', parent_id: null, sort_order: 3, icon: '⚙️' },
  { id: 'cat_glass', name: '废玻璃', unit: '', parent_id: null, sort_order: 4, icon: '🪟' },
  { id: 'cat_appliance', name: '废家电', unit: '', parent_id: null, sort_order: 5, icon: '🔌' },
  { id: 'cat_rubber', name: '废橡胶', unit: '', parent_id: null, sort_order: 6, icon: '🛞' },
];

// 基准价格（参考2024-2025年市场行情）
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

// 地区数据
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

// 生成3个月历史价格数据
function generateSeedPrices() {
  const prices = [];
  const now = new Date();
  const days = 90; // 3个月

  for (const cat of CATEGORIES) {
    const base = BASE_PRICES[cat.id];
    if (!base) continue;

    let currentBuy = base.buy;
    let currentSell = base.sell;

    for (let d = days; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      // 模拟价格波动
      const change = (Math.random() - 0.48) * base.volatility;
      currentBuy = Math.round(currentBuy * (1 + change));
      currentSell = Math.round(currentSell * (1 + change));

      // 确保买卖价差合理
      const spread = Math.max(Math.round(base.sell - base.buy), 50);
      currentSell = currentBuy + spread + Math.round(Math.random() * spread * 0.3);

      // 确保价格不偏离基准太多
      currentBuy = Math.max(Math.round(base.buy * 0.8), Math.min(Math.round(base.buy * 1.2), currentBuy));
      currentSell = Math.max(Math.round(base.sell * 0.8), Math.min(Math.round(base.sell * 1.2), currentSell));

      const source = d === 0 ? 'seed' : 'seed';
      prices.push({
        id: `seed_${cat.id}_${d}`,
        category_id: cat.id,
        buy_price: currentBuy,
        sell_price: currentSell,
        region_code: 'default',
        source: source,
        source_detail: '系统参考价',
        recorded_at: date.toISOString(),
        created_at: date.toISOString(),
      });
    }
  }

  return prices;
}

// 爬虫规则配置
const CRAWLER_RULES = {
  version: '1.0.0',
  updated_at: new Date().toISOString(),
  sites: [
    {
      name: '废品之家',
      baseUrl: 'https://www.feipinzhijia.com/hangqing/',
      listSelector: '.price-list li',
      fields: {
        category: '.name',
        price: '.price-value',
        change: '.change',
        date: '.date'
      },
      intervalMinutes: 120,
      enabled: true
    },
    {
      name: 'Feijiu网',
      baseUrl: 'https://www.feijiu.com/hangqing/',
      listSelector: '.hq-list .hq-item',
      fields: {
        category: '.hq-name',
        price: '.hq-price',
        change: '.hq-change',
        date: '.hq-date'
      },
      intervalMinutes: 180,
      enabled: true
    },
    {
      name: '91再生',
      baseUrl: 'https://www.91zaisheng.com/market/',
      listSelector: '.market-list .item',
      fields: {
        category: '.title',
        price: '.price',
        change: '.trend',
        date: '.time'
      },
      intervalMinutes: 240,
      enabled: true
    },
  ]
};

// 初始化种子数据
async function initSeedData() {
  // 检查是否已初始化
  const initialized = await DB.getSetting('seed_initialized', false);
  if (initialized) return false;

  console.log('[Seed] 开始初始化种子数据...');

  // 写入父级品类
  await DB.bulkPut('categories', PARENT_CATEGORIES.map(c => ({ ...c, name: c.name, unit: c.unit || '', sort_order: c.sort_order })));

  // 写入子品类
  await DB.bulkPut('categories', CATEGORIES.map(c => ({
    id: c.id,
    name: c.name,
    unit: c.unit,
    parent_id: c.parent_id,
    sort_order: c.sort,
    icon: c.icon,
  })));

  // 写入价格数据
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

  // 写入爬虫配置
  const crawlerConfigs = CRAWLER_RULES.sites.map((site, i) => ({
    id: `crawler_${i}`,
    website_name: site.name,
    base_url: site.baseUrl,
    css_selector: site.listSelector,
    fields: JSON.stringify(site.fields),
    enabled: site.enabled,
    interval_minutes: site.intervalMinutes,
    last_success_at: null,
    last_error: null,
    version: CRAWLER_RULES.version,
  }));
  await DB.bulkPut('crawler_configs', crawlerConfigs);

  await DB.setSetting('seed_initialized', true);
  await DB.setSetting('seed_version', '1.0.0');

  console.log(`[Seed] 初始化完成：${CATEGORIES.length}个品类，${prices.length}条价格记录`);
  return true;
}
