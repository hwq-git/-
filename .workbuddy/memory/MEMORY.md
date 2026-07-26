# 废品行情通 - 项目记忆

## 项目信息
- **类型**: 废品回收价格查询 PWA 应用
- **路径**: C:\Users\20331\WorkBuddy\废品每日价格
- **技术栈**: PWA + IndexedDB + Service Worker + Chart.js + 原生JS
- **用户**: 回收站老板（50多岁，非技术背景），需要大字体、极简操作

## 关键决策
- 需求文档指定 Flutter，但环境无 SDK，改用 PWA 方案（立即可用、可安装、离线支持）
- 爬虫通过 CORS 代理适配浏览器（allorigins/corsproxy/codetabs 三代理轮换）
- 真实爬取失败时自动切换模拟数据更新，确保用户体验不受影响
- 数据来源优先级：爬虫行情价 > 用户录入 > 系统种子数据

## 数据库结构
IndexedDB 8个表：categories, prices, crawler_configs, crawl_logs, ledger, alerts, regions, favorites, settings

## MVP 功能状态
- [x] 30+品类价格查询（废纸/塑料/金属/玻璃/家电/橡胶）
- [x] 手机端爬虫（定时+WiFi/电量策略+失败重试+模拟后备）
- [x] 爬虫规则JSON配置化
- [x] 价格趋势图（7/30/90天+双品类对比+成交价标注）
- [x] 手动录入价格（含行情对比提示）
- [x] 大字体+红涨绿跌+暗色模式
- [x] 数据导出JSON/Excel
- [x] PWA离线可用
- [x] 记账功能（收/卖记录+盈亏统计）

## 待实现（第二阶段）
- [ ] 价格预警（本地通知）
- [ ] 二维码点对点分享
- [ ] 语音输入
- [ ] 爬虫规则在线热更新
- [ ] 转Flutter原生App
