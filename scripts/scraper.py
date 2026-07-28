#!/usr/bin/env python3
"""
废品价格爬虫 - Python 版
读取 data/crawler-rules.json 配置，使用 requests + BeautifulSoup4 抓取真实价格数据。
支持：HTML CSS选择器 / API JSON解析 / Cookie认证 / 代理轮换 / 随机UA / 速率限制

运行: python scripts/scraper.py
"""

import json
import os
import re
import sys
import time
import random
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ==================== 配置 ====================
BASE_DIR = Path(__file__).resolve().parent.parent
RULES_FILE = BASE_DIR / "data" / "crawler-rules.json"
OUTPUT_FILE = BASE_DIR / "data" / "scraped-prices.json"

REQUEST_TIMEOUT = 20  # 单个请求超时秒数
MIN_DELAY = 2.0       # 站点间最小延迟秒数
MAX_DELAY = 5.0       # 站点间最大延迟秒数
MAX_RETRIES = 2       # 单站点最大重试次数

# 随机 User-Agent 池
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]

# ==================== 品类匹配表（同 JS 版） ====================
CATEGORY_KEYWORDS = {
    "paper_huangban":    ["黄板纸", "黄板", "黄纸板"],
    "paper_shuzhi":      ["书纸", "书本纸", "书页纸"],
    "paper_baozhi":      ["报纸", "废报纸", "旧报纸"],
    "paper_zhixiang":    ["纸箱", "废纸箱", "箱板纸"],
    "paper_waiboxhi":    ["瓦楞纸", "瓦楞"],
    "paper_baizhibian":  ["白纸边", "白边纸", "白纸"],
    "paper_hunhe":       ["混合废纸", "统废纸", "杂纸", "混合废纸"],
    "plastic_pet":       ["PET", "pet", "瓶片", "PET瓶"],
    "plastic_pe":        ["PE", "pe", "PE膜", "高压PE", "低压PE"],
    "plastic_pp":        ["PP", "pp", "编织袋", "聚丙烯"],
    "plastic_pvc":       ["PVC", "pvc"],
    "plastic_abs":       ["ABS", "abs"],
    "plastic_pc":        ["PC", "pc", "PC塑料"],
    "plastic_ps":        ["PS", "ps", "PS塑料", "聚苯乙烯"],
    "metal_iron":        ["废铁", "生铁", "铸铁", "铁"],
    "metal_copper":      ["废铜", "紫铜", "黄铜", "铜"],
    "metal_aluminum":    ["废铝", "铝"],
    "metal_steel":       ["不锈钢", "废不锈钢"],
    "metal_zinc":        ["废锌", "锌"],
    "metal_lead":        ["废铅", "铅"],
    "metal_tin":         ["废锡", "锡"],
    "glass_flat":        ["平板玻璃", "废平板", "平板"],
    "glass_bottle":      ["瓶玻璃", "废玻璃瓶", "玻璃瓶", "碎玻璃"],
    "appliance_fridge":  ["冰箱"],
    "appliance_washer":  ["洗衣机"],
    "appliance_ac":      ["空调"],
    "appliance_tv":      ["电视"],
    "appliance_phone":   ["手机"],
    "rubber_tire":       ["轮胎", "废轮胎"],
    "rubber_hose":       ["胶管", "废胶管"],
}

# 品类名称映射（用于输出显示）
CATEGORY_NAMES = {
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
}


def match_category(name: str) -> Optional[str]:
    """根据名称匹配品类ID"""
    lower = re.sub(r"\s+", "", name.lower())
    for cat_id, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in lower:
                return cat_id
    return None


def parse_price(text) -> Optional[float]:
    """从文本中提取价格数字"""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", str(text))
    try:
        num = float(cleaned)
        return num if num > 0 else None
    except ValueError:
        return None


def get_random_ua() -> str:
    return random.choice(USER_AGENTS)


def build_session(auth_config: Optional[dict] = None) -> requests.Session:
    """创建带认证和随机UA的 requests Session"""
    session = requests.Session()
    session.headers.update({
        "User-Agent": get_random_ua(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    })

    # 注入用户认证信息（Cookie / Token 等）
    if auth_config:
        for key, value in auth_config.items():
            if key.lower() == "cookie":
                session.headers["Cookie"] = value
            elif key.lower() == "authorization":
                session.headers["Authorization"] = value
            else:
                session.headers[key] = value

    return session


def fetch_page(url: str, session: requests.Session, timeout: int = REQUEST_TIMEOUT) -> dict:
    """抓取页面，返回 {success, text, is_json, status_code, error}"""
    result = {
        "success": False,
        "text": None,
        "is_json": False,
        "status_code": None,
        "error": None,
    }
    try:
        resp = session.get(url, timeout=timeout, allow_redirects=True)
        result["status_code"] = resp.status_code

        if resp.status_code == 403:
            result["error"] = "HTTP 403 Forbidden（可能被反爬）"
            return result
        if resp.status_code == 404:
            result["error"] = "HTTP 404 Not Found"
            return result
        if resp.status_code >= 500:
            result["error"] = f"HTTP {resp.status_code} Server Error"
            return result

        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        text = resp.text

        if not text or len(text) < 100:
            result["error"] = f"内容过短 ({len(text)} 字节)"
            return result

        # 检测是否被重定向到登录页
        first_2k = text[:2000].lower()
        login_keywords = ["登录", "login", "请登录", "请先登录", "sign in"]
        if any(kw in first_2k for kw in login_keywords) and len(text) < 8000:
            result["error"] = "返回登录页（Cookie失效或需要认证）"
            return result

        # 检测 JSON 响应
        is_json = "application/json" in content_type or text.strip().startswith(("{", "["))
        result["success"] = True
        result["text"] = text
        result["is_json"] = is_json

    except requests.Timeout:
        result["error"] = f"请求超时 ({timeout}s)"
    except requests.ConnectionError as e:
        result["error"] = f"连接失败: {e}"
    except requests.RequestException as e:
        result["error"] = f"请求异常: {e}"
    except Exception as e:
        result["error"] = f"未知错误: {e}"

    return result


def parse_html_prices(html_text: str, config: dict) -> dict:
    """
    HTML 模式解析：使用 CSS 选择器提取价格
    返回 {results, matched_elements, parse_errors, error_detail}
    """
    results = []
    parse_errors = []
    css_selector = config.get("css_selector") or config.get("listSelector", "")

    try:
        soup = BeautifulSoup(html_text, "lxml")
        items = soup.select(css_selector)
    except Exception as e:
        return {
            "results": [],
            "matched_elements": 0,
            "parse_errors": [{"index": -1, "error": f"CSS选择器解析失败: {e}"}],
            "error_detail": f"BeautifulSoup解析异常: {e}",
        }

    if not items:
        # 额外检测：反爬/拦截
        body_text = soup.get_text()[:500] if soup.body else ""
        blocked_kw = ["验证码", "访问频繁", "请稍后", "403", "Forbidden", "登录", "login"]
        is_blocked = any(kw in body_text for kw in blocked_kw)

        return {
            "results": [],
            "matched_elements": 0,
            "parse_errors": [],
            "error_detail": (
                f'CSS选择器 "{css_selector}" 未匹配到任何元素，页面疑似被拦截: "{body_text[:80]}"'
                if is_blocked
                else f'CSS选择器 "{css_selector}" 未匹配到任何元素'
            ),
        }

    fields = config.get("fields", {})
    if isinstance(fields, str):
        try:
            fields = json.loads(fields)
        except json.JSONDecodeError:
            pass

    for idx, item in enumerate(items):
        try:
            def get_text(selector):
                if not selector:
                    return ""
                el = item.select_one(selector)
                return el.get_text(strip=True) if el else ""

            name = get_text(fields.get("category", fields.get("name", "")))
            price_text = get_text(fields.get("price", ""))
            change_text = get_text(fields.get("change", ""))
            date_text = get_text(fields.get("date", ""))

            if not name or not price_text:
                parse_errors.append({
                    "index": idx,
                    "error": "缺少品名或价格",
                    "raw": item.get_text(strip=True)[:80],
                })
                continue

            price = parse_price(price_text)
            if price is None:
                parse_errors.append({
                    "index": idx,
                    "error": f"无法解析价格: {price_text}",
                })
                continue

            cat_id = match_category(name)
            if not cat_id:
                parse_errors.append({
                    "index": idx,
                    "error": f"品名未匹配: {name}",
                })
                continue

            # 解析涨跌
            change = 0.0
            if change_text:
                if any(c in change_text for c in ["↑", "涨", "+"]):
                    num_match = re.search(r"[\d,.]+", change_text)
                    if num_match:
                        change = float(num_match.group().replace(",", ""))
                elif any(c in change_text for c in ["↓", "跌", "-"]):
                    num_match = re.search(r"[\d,.]+", change_text)
                    if num_match:
                        change = -float(num_match.group().replace(",", ""))

            results.append({
                "category_id": cat_id,
                "category_name": CATEGORY_NAMES.get(cat_id, name),
                "name": name,
                "buy_price": round(price * 0.97),
                "sell_price": round(price * 1.01),
                "raw_price": price,
                "change": change,
                "source_detail": config.get("website_name", config.get("name", "")),
                "date_text": date_text,
            })
        except Exception as e:
            parse_errors.append({
                "index": idx,
                "error": str(e),
                "raw": item.get_text(strip=True)[:80],
            })

    return {
        "results": results,
        "matched_elements": len(items),
        "parse_errors": parse_errors,
        "error_detail": f"匹配 {len(items)} 个元素，解析成功 {len(results)} 条",
    }


def parse_api_prices(json_text: str, config: dict) -> dict:
    """
    API JSON 模式解析
    返回 {results, matched_elements, parse_errors, error_detail}
    """
    results = []
    parse_errors = []

    try:
        data = json.loads(json_text)
    except json.JSONDecodeError as e:
        return {
            "results": [],
            "matched_elements": 0,
            "parse_errors": [{"index": -1, "error": f"JSON解析失败: {e}"}],
            "error_detail": f"JSON解析异常: {e}",
        }

    # 按 apiPath 提取数组
    api_path = config.get("api_path") or config.get("apiPath", "")
    if api_path:
        parts = api_path.split(".")
        for part in parts:
            if isinstance(data, dict) and part in data:
                data = data[part]
            else:
                return {
                    "results": [],
                    "matched_elements": 0,
                    "parse_errors": [{"index": -1, "error": f'apiPath "{api_path}" 未找到'}],
                    "error_detail": f'JSON路径 "{api_path}" 解析失败',
                }

    if not isinstance(data, list):
        return {
            "results": [],
            "matched_elements": 0,
            "parse_errors": [{"index": -1, "error": "API返回不是数组"}],
            "error_detail": f"API返回类型: {type(data).__name__}",
        }

    fields = config.get("fields", {})
    if isinstance(fields, str):
        try:
            fields = json.loads(fields)
        except json.JSONDecodeError:
            pass

    for idx, item in enumerate(data):
        try:
            name = item.get(fields.get("category", fields.get("name", "")))
            price_text = str(item.get(fields.get("price", ""), ""))
            change_text = str(item.get(fields.get("change", ""), ""))
            date_text = str(item.get(fields.get("date", ""), ""))

            if not name or not price_text:
                parse_errors.append({
                    "index": idx,
                    "error": "缺少品名或价格",
                    "raw": json.dumps(item, ensure_ascii=False)[:100],
                })
                continue

            price = parse_price(price_text)
            if price is None:
                parse_errors.append({
                    "index": idx,
                    "error": f"无法解析价格: {price_text}",
                })
                continue

            cat_id = match_category(str(name))
            if not cat_id:
                parse_errors.append({
                    "index": idx,
                    "error": f"品名未匹配: {name}",
                })
                continue

            change = 0.0
            if change_text:
                num_match = re.search(r"-?[\d,.]+", change_text)
                if num_match:
                    change = float(num_match.group().replace(",", ""))

            results.append({
                "category_id": cat_id,
                "category_name": CATEGORY_NAMES.get(cat_id, str(name)),
                "name": str(name),
                "buy_price": round(price * 0.97),
                "sell_price": round(price * 1.01),
                "raw_price": price,
                "change": change,
                "source_detail": config.get("website_name", config.get("name", "")),
                "date_text": date_text,
            })
        except Exception as e:
            parse_errors.append({
                "index": idx,
                "error": str(e),
                "raw": json.dumps(item, ensure_ascii=False)[:100],
            })

    return {
        "results": results,
        "matched_elements": len(data),
        "parse_errors": parse_errors,
        "error_detail": f"API返回 {len(data)} 条，成功解析 {len(results)} 条",
    }


# ==================== 金投网 API 专用处理器 ====================

# 金投网品名 → 我们的品类ID 映射表
JINTOU_CATEGORY_MAP = {
    # === js_ 前缀：废金属 ===
    # 废铜类
    "1#光亮铜线": "metal_copper", "1#废铜": "metal_copper", "二号铜": "metal_copper",
    "马达铜": "metal_copper", "紫杂铜": "metal_copper", "破碎黄铜": "metal_copper",
    "黄杂铜": "metal_copper", "干净通讯线铜米": "metal_copper", "H62黄铜边料": "metal_copper",
    "H59黄铜边料": "metal_copper", "H65黄铜边料": "metal_copper", "H68黄铜边料": "metal_copper",
    "破碎杂线铜米": "metal_copper", "1#铜管": "metal_copper", "铜铝水箱": "metal_copper",
    "磷铜边料": "metal_copper", "紫铜边料": "metal_copper", "镀白磷铜边料": "metal_copper",
    "镀白黄铜边料": "metal_copper", "国标无氧杆8MM": "metal_copper", "国标低氧杆8MM": "metal_copper",
    "干净镀锡铜网": "metal_copper", "柜装黄铜水箱": "metal_copper", "破碎黄铜水箱": "metal_copper",
    "引铸非标黄铜枝": "metal_copper", "H62黄铜带": "metal_copper", "T2紫铜带": "metal_copper",
    "T2紫铜排": "metal_copper", "T2紫铜板": "metal_copper", "T2紫铜棒": "metal_copper",
    "T3紫铜排": "metal_copper", "无氧铜杆3MM（华东）": "metal_copper", "无氧铜杆8MM（华东）": "metal_copper",
    "无氧铜杆3MM（华南）": "metal_copper", "无氧铜杆8MM（华南）": "metal_copper",
    "低氧铜杆3MM（华东）": "metal_copper", "低氧铜杆8MM（华东）": "metal_copper",
    "黄铜大件": "metal_copper", "紫铜屑": "metal_copper", "紫铜砖": "metal_copper",
    "火烧线": "metal_copper", "变压器铜": "metal_copper", "锡口铜": "metal_copper",
    "水箱紫铜管": "metal_copper", "电机线": "metal_copper", "H62黄铜板": "metal_copper",
    "H62黄铜棒": "metal_copper", "H59黄铜棒": "metal_copper",
    "废黄铜": "metal_copper", "进口柜装黄铜": "metal_copper",
    "R410A专用紫铜管": "metal_copper",

    # 废铝类
    "破碎生铝": "metal_aluminum", "破碎熟铝": "metal_aluminum", "合金铝": "metal_aluminum",
    "机件生铝": "metal_aluminum", "干净割胶铝皮": "metal_aluminum", "干净割胶铝线": "metal_aluminum",
    "拆水箱铝": "metal_aluminum", "变压器铝": "metal_aluminum", "废铝线": "metal_aluminum",
    "干净报纸板": "metal_aluminum", "国产洁净6063新料": "metal_aluminum",
    "国产洁净6063旧料": "metal_aluminum", "国产干净6063旧料": "metal_aluminum",
    "干净356轮毂铝": "metal_aluminum", "机械铝": "metal_aluminum",
    "标准合金压铸铝锭": "metal_aluminum", "合金压铸铝锭": "metal_aluminum",
    "6063铝棒": "metal_aluminum", "6063电泳铝型材": "metal_aluminum",
    "6063喷涂铝型材": "metal_aluminum", "6063磨砂铝型材": "metal_aluminum",
    "6063木纹转印铝型材": "metal_aluminum", "ADC12铝合金锭": "metal_aluminum",
    "A356.2铝合金锭": "metal_aluminum", "A380铝合金锭": "metal_aluminum",
    "ZLD104铝合金锭": "metal_aluminum", "ZLD102铝合金（华东）": "metal_aluminum",
    "1060铝板": "metal_aluminum", "3003铝板": "metal_aluminum", "5052铝板（华东）": "metal_aluminum",
    "喷涂铝材": "metal_aluminum", "国标磨砂铝材": "metal_aluminum",
    "A00铝": "metal_aluminum", "A00铝锭": "metal_aluminum",
    "99.7%脱氧铝杆（华北）": "metal_aluminum", "6201电工圆铝杆（华北）": "metal_aluminum",

    # 废铁/废钢类
    "统废": "metal_iron", "重废": "metal_iron", "中废": "metal_iron", "小废": "metal_iron",
    "机件生铁": "metal_iron", "马达铁": "metal_iron", "冲花边料": "metal_iron",
    "刨丝": "metal_iron", "边角料": "metal_iron", "剪切料": "metal_iron",
    "破碎料": "metal_iron", "压块": "metal_iron", "轻薄料": "metal_iron",
    "统料废钢": "metal_iron", "钢筋压块": "metal_iron", "钢刨花": "metal_iron",
    "重废(上海)": "metal_iron", "重废(重庆)": "metal_iron", "重废(佛山)": "metal_iron",

    # 不锈钢类
    "304回炉边料": "metal_steel", "316回炉废料": "metal_steel", "304新料": "metal_steel",
    "304工业": "metal_steel", "304刨花": "metal_steel", "304统料": "metal_steel",
    "201回炉料": "metal_steel", "202回炉边料": "metal_steel", "430回炉料": "metal_steel",
    "430边丝": "metal_steel", "不锈钢回炉料": "metal_steel",

    # 废锌类
    "破碎锌": "metal_zinc", "杂锌": "metal_zinc", "1#锌": "metal_zinc",
    "0#锌": "metal_zinc", "压铸锌合金锭": "metal_zinc",

    # 废铅类
    "废电瓶铅": "metal_lead", "还原铅": "metal_lead", "粗铅": "metal_lead",
    "软铅": "metal_lead", "破碎铅大料": "metal_lead", "1#铅": "metal_lead",

    # 废锡类
    "锡渣": "metal_tin", "1#锡": "metal_tin", "无铅焊锡": "metal_tin",
    "60A焊锡条": "metal_tin", "63A焊锡条": "metal_tin", "含铅锡块": "metal_tin",
    "含铅锡渣": "metal_tin", "含银锡块": "metal_tin",

    # 废镍类
    "纯镍废料": "metal_steel", "1#镍": "metal_steel", "低镍": "metal_steel",

    # === other_ 前缀：废纸/塑料/玻璃/橡胶 ===
    # 废纸类
    "废纸": "paper_hunhe", "瓦楞纸": "paper_waiboxhi", "箱板纸": "paper_zhixiang",
    "再生箱板纸": "paper_zhixiang", "白卡纸": "paper_baizhibian", "双胶纸": "paper_shuzhi",

    # 废塑料类
    "ABS": "plastic_abs", "PP": "plastic_pp", "PC": "plastic_pc",
    "PET": "plastic_pet", "PET聚酯瓶片": "plastic_pet", "PETG颗粒": "plastic_pet",
    "HDPE": "plastic_pe", "LDPE": "plastic_pe", "LLDPE": "plastic_pe", "PE": "plastic_pe",
    "PVC": "plastic_pvc", "PVC（聚氯乙烯树脂）": "plastic_pvc", "聚氯乙烯树脂": "plastic_pvc",
    "聚氯乙烯树脂PVC": "plastic_pvc", "聚氯乙烯树脂粉": "plastic_pvc", "PVC糊树脂": "plastic_pvc",
    "PS": "plastic_ps", "GPPS": "plastic_ps", "HIPS": "plastic_ps", "EPS": "plastic_ps",
    "POM": "plastic_abs", "PA6": "plastic_abs", "PA66": "plastic_abs",
    "PMMA": "plastic_pc", "EVA": "plastic_pe", "PBT": "plastic_abs",

    # 废橡胶类
    "天然橡胶": "rubber_tire", "丁苯橡胶": "rubber_tire", "顺丁橡胶": "rubber_tire",
    "丁腈橡胶": "rubber_hose", "聚异丁烯橡胶": "rubber_tire",
    "硅橡胶": "rubber_hose", "室温硫化硅橡胶": "rubber_hose", "模具硅橡胶": "rubber_hose",
    "橡胶促进剂": "rubber_tire", "橡胶防老剂": "rubber_tire",

    # 废玻璃类
    "玻璃": "glass_flat", "水玻璃": "glass_flat", "防火玻璃用钾明矾": "glass_flat",
}


def match_jintou_name(name: str) -> Optional[str]:
    """匹配金投网品名到我们的品类ID"""
    # 精确匹配
    if name in JINTOU_CATEGORY_MAP:
        return JINTOU_CATEGORY_MAP[name]
    
    # 模糊匹配：去掉地区后缀再试
    base = re.sub(r"[\(（][^)）]*[\)）]", "", name).strip()
    if base in JINTOU_CATEGORY_MAP:
        return JINTOU_CATEGORY_MAP[base]
    
    # 前缀匹配
    for jt_name, cat_id in JINTOU_CATEGORY_MAP.items():
        if base.startswith(jt_name) or jt_name.startswith(base):
            return cat_id
    
    # 最后用关键词匹配
    return match_category(name)


def crawl_jintou_api(config: dict) -> dict:
    """爬取金投网API - 双通道 (js_废金属 + other_废纸塑料橡胶玻璃)"""
    api_config = config.get("api_config", {})
    base_url = config.get("baseUrl", config.get("base_url", ""))
    batch_size = api_config.get("batch_size", 100)

    # 双通道配置
    channels = [
        {"prefix": "js_", "range": [0, 1500], "desc": "废金属"},
        {"prefix": "other_", "range": [0, 10000], "desc": "废纸/塑料/橡胶/玻璃"},
    ]
    # 允许JSON覆盖
    if api_config.get("channels"):
        channels = api_config["channels"]

    all_results = []
    session = build_session()
    total_fetched = 0
    batch_errors = 0

    for channel in channels:
        prefix = channel["prefix"]
        id_start, id_end = channel["range"]
        desc = channel.get("desc", prefix)
        channel_fetched = 0

        print(f"  📡 [{desc}] 扫描 {prefix}{id_start}-{id_end}...")

        for start in range(id_start, id_end, batch_size):
            ids = [f"{prefix}{i}" for i in range(start, min(start + batch_size, id_end))]
            id_str = ",".join(ids)
            url = f"{base_url}?ids={id_str}"

            try:
                resp = session.get(url, timeout=15)
                if resp.status_code != 200:
                    batch_errors += 1
                    continue
                data = resp.json()
                if data.get("returnCode", -1) != 0:
                    batch_errors += 1
                    continue
                items = data.get("data", [])
                for item in items:
                    name = item.get("name", "")
                    price_str = str(item.get("price", "0"))
                    change_str = str(item.get("change", "0"))
                    region = item.get("region", "")
                    unit = item.get("unit", "元/吨")

                    cat_id = match_jintou_name(name)
                    if not cat_id:
                        continue

                    price = parse_price(price_str)
                    if price is None or price <= 0:
                        continue

                    try:
                        change = float(change_str) if change_str else 0.0
                    except ValueError:
                        change = 0.0

                    full_name = f"{name}({region})" if region else name
                    all_results.append({
                        "category_id": cat_id,
                        "category_name": CATEGORY_NAMES.get(cat_id, name),
                        "name": full_name,
                        "buy_price": round(price * 0.97),
                        "sell_price": round(price * 1.01),
                        "raw_price": price,
                        "change": change,
                        "source_detail": "金投网",
                        "date_text": region,
                    })
                channel_fetched += len(items)

            except Exception as e:
                batch_errors += 1

            # 批次间微延迟
            if start + batch_size < id_end:
                time.sleep(0.15)

        total_fetched += channel_fetched
        if channel_fetched > 0:
            matched = len([r for r in all_results if r.get("_channel") == prefix]) if False else len(all_results)
            print(f"     ✅ {channel_fetched} 条")

    name = config.get("name", config.get("website_name", "金投网"))
    log = {
        "website_name": name,
        "status": "success" if all_results else "failed",
        "items_scraped": len(all_results),
        "error_msg": "" if all_results else f"成功{total_fetched}条API数据但无匹配品类",
        "error_detail": None,
        "http_status": 200,
        "matched_elements": total_fetched,
        "parse_errors": 0,
        "duration_ms": 0,
        "crawled_at": datetime.now(timezone.utc).isoformat(),
    }

    if all_results:
        log["results"] = all_results
        # 统计各品类数量
        from collections import Counter
        cat_counts = Counter(r["category_id"] for r in all_results)
        cat_summary = ", ".join(f"{CATEGORY_NAMES.get(k,k)}:{v}" for k,v in cat_counts.most_common())
        print(f"     ✅ 总计 {len(all_results)} 条匹配 ({cat_summary})")
    else:
        print(f"     ❌ {total_fetched} 条数据但无可匹配品类")

    return log


def crawl_site(config: dict) -> dict:
    """爬取单个站点"""
    site_name = config.get("name", config.get("website_name", "未知站点"))
    site_url = config.get("base_url") or config.get("baseUrl", "")
    site_type = config.get("type", "html")

    log = {
        "website_name": site_name,
        "status": "failed",
        "items_scraped": 0,
        "error_msg": "",
        "error_detail": None,
        "http_status": None,
        "matched_elements": 0,
        "parse_errors": 0,
        "duration_ms": 0,
        "crawled_at": datetime.now(timezone.utc).isoformat(),
    }

    print(f"  📡 [{site_type.upper()}] {site_name}")

    start_time = time.time()

    # 解析认证配置
    auth_config = config.get("auth", {})
    if isinstance(auth_config, str):
        try:
            auth_config = json.loads(auth_config)
        except json.JSONDecodeError:
            auth_config = {}

    user_auth = config.get("user_auth", {})
    if isinstance(user_auth, str):
        try:
            user_auth = json.loads(user_auth)
        except json.JSONDecodeError:
            user_auth = {}

    # 检查是否需要认证但未提供
    if auth_config.get("required") and not any(
        v and len(str(v).strip()) > 3 for v in user_auth.values()
    ):
        log["error_msg"] = f'需要认证（{auth_config.get("description", "未知")}），但未提供凭据'
        log["duration_ms"] = int((time.time() - start_time) * 1000)
        print(f"     ⚠️ {log['error_msg']}")
        return log

    # 创建 Session 并发起请求（带重试）
    session = build_session(user_auth)
    fetch_result = None

    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            delay = 3 + random.random() * 5
            print(f"     🔄 重试 {attempt}/{MAX_RETRIES}，等待 {delay:.1f}s...")
            time.sleep(delay)
            session.headers["User-Agent"] = get_random_ua()

        fetch_result = fetch_page(site_url, session)
        if fetch_result["success"]:
            break
        print(f"     ❌ 尝试 {attempt + 1}: {fetch_result['error']}")

    log["http_status"] = fetch_result.get("status_code")

    if not fetch_result["success"]:
        log["error_msg"] = fetch_result["error"] or "未知错误"
        log["duration_ms"] = int((time.time() - start_time) * 1000)
        print(f"     ❌ {log['error_msg']}")
        return log

    # 解析
    is_json = fetch_result["is_json"] or site_type == "api"
    if is_json:
        parse_result = parse_api_prices(fetch_result["text"], config)
    else:
        parse_result = parse_html_prices(fetch_result["text"], config)

    log["matched_elements"] = parse_result["matched_elements"]
    log["parse_errors"] = parse_result.get("parse_errors", [])
    log["parse_errors_count"] = len(parse_result.get("parse_errors", []))

    if not parse_result["results"]:
        log["error_msg"] = parse_result.get("error_detail", "解析无结果")
        log["duration_ms"] = int((time.time() - start_time) * 1000)
        print(f"     ❌ {log['error_msg']}")
        return log

    log["status"] = "success"
    log["items_scraped"] = len(parse_result["results"])
    log["results"] = parse_result["results"]
    log["duration_ms"] = int((time.time() - start_time) * 1000)
    print(f"     ✅ {len(parse_result['results'])} 条价格 ({log['duration_ms']}ms)")

    return log


def merge_results(all_logs: list) -> list:
    """
    合并去重：同一品类的多条价格取中位数
    返回最终的 prices 列表
    """
    by_category = {}

    for log in all_logs:
        if log["status"] != "success":
            continue
        for r in log.get("results", []):
            cat_id = r["category_id"]
            if cat_id not in by_category:
                by_category[cat_id] = {
                    "prices": [],
                    "buy_prices": [],
                    "sell_prices": [],
                    "names": [],
                    "sources": [],
                }
            by_category[cat_id]["prices"].append(r["raw_price"])
            by_category[cat_id]["buy_prices"].append(r["buy_price"])
            by_category[cat_id]["sell_prices"].append(r["sell_price"])
            if r.get("category_name") and r["category_name"] not in by_category[cat_id]["names"]:
                by_category[cat_id]["names"].append(r["category_name"])
            if r.get("source_detail") and r["source_detail"] not in by_category[cat_id]["sources"]:
                by_category[cat_id]["sources"].append(r["source_detail"])

    prices = []
    for cat_id, data in by_category.items():
        sorted_prices = sorted(data["prices"])
        n = len(sorted_prices)
        if n == 1:
            median_price = sorted_prices[0]
        elif n % 2 == 1:
            median_price = sorted_prices[n // 2]
        else:
            median_price = (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2

        buy_prices_sorted = sorted(data["buy_prices"])
        sell_prices_sorted = sorted(data["sell_prices"])

        prices.append({
            "category_id": cat_id,
            "name": data["names"][0] if data["names"] else cat_id,
            "buy_price": round(buy_prices_sorted[len(buy_prices_sorted) // 2]),
            "sell_price": round(sell_prices_sorted[len(sell_prices_sorted) // 2]),
            "raw_avg_price": round(median_price),
            "sample_count": n,
            "sources": data["sources"],
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })

    # 按 category_id 排序
    prices.sort(key=lambda p: p["category_id"])
    return prices


# ==================== 基准价格（用于模拟回退） ====================
BASE_PRICES = {
    "paper_huangban":    {"buy": 1450, "sell": 1550, "volatility": 0.04},
    "paper_shuzhi":      {"buy": 1280, "sell": 1380, "volatility": 0.035},
    "paper_baozhi":      {"buy": 1620, "sell": 1720, "volatility": 0.03},
    "paper_zhixiang":    {"buy": 1380, "sell": 1480, "volatility": 0.04},
    "paper_waiboxhi":    {"buy": 1320, "sell": 1420, "volatility": 0.04},
    "paper_baizhibian":  {"buy": 1850, "sell": 1950, "volatility": 0.03},
    "paper_hunhe":       {"buy": 1050, "sell": 1150, "volatility": 0.05},
    "plastic_pet":       {"buy": 4200, "sell": 4400, "volatility": 0.06},
    "plastic_pe":        {"buy": 3800, "sell": 4000, "volatility": 0.06},
    "plastic_pp":        {"buy": 3500, "sell": 3700, "volatility": 0.05},
    "plastic_pvc":       {"buy": 3200, "sell": 3400, "volatility": 0.05},
    "plastic_abs":       {"buy": 8500, "sell": 8800, "volatility": 0.07},
    "plastic_pc":        {"buy": 9200, "sell": 9500, "volatility": 0.07},
    "plastic_ps":        {"buy": 5800, "sell": 6100, "volatility": 0.06},
    "metal_iron":        {"buy": 2350, "sell": 2480, "volatility": 0.05},
    "metal_copper":      {"buy": 52000, "sell": 53500, "volatility": 0.08},
    "metal_aluminum":    {"buy": 14800, "sell": 15300, "volatility": 0.06},
    "metal_steel":       {"buy": 8500, "sell": 8900, "volatility": 0.05},
    "metal_zinc":        {"buy": 18500, "sell": 19200, "volatility": 0.07},
    "metal_lead":        {"buy": 15200, "sell": 15800, "volatility": 0.06},
    "metal_tin":         {"buy": 210000, "sell": 215000, "volatility": 0.08},
    "glass_flat":        {"buy": 850, "sell": 950, "volatility": 0.04},
    "glass_bottle":      {"buy": 650, "sell": 750, "volatility": 0.05},
    "appliance_fridge":  {"buy": 80, "sell": 120, "volatility": 0.08},
    "appliance_washer":  {"buy": 60, "sell": 100, "volatility": 0.08},
    "appliance_ac":      {"buy": 120, "sell": 180, "volatility": 0.10},
    "appliance_tv":      {"buy": 50, "sell": 90, "volatility": 0.08},
    "appliance_phone":   {"buy": 15, "sell": 35, "volatility": 0.15},
    "rubber_tire":       {"buy": 1200, "sell": 1350, "volatility": 0.05},
    "rubber_hose":       {"buy": 1800, "sell": 1950, "volatility": 0.05},
}


def simulate_prices(seed: int = None) -> list:
    """生成模拟价格数据（当所有真实爬取失败时的回退方案）"""
    if seed is None:
        # 以日期为种子，保证同一天多次运行结果一致
        today = datetime.now().strftime("%Y%m%d")
        seed = int(hashlib.md5(today.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    prices = []
    for cat_id, base in BASE_PRICES.items():
        # 模拟价格波动
        change = (rng.random() - 0.48) * base["volatility"]
        buy = round(base["buy"] * (1 + change))

        # 确保在合理范围内
        buy = max(round(base["buy"] * 0.8), min(round(base["buy"] * 1.2), buy))
        spread = max(round(base["sell"] - base["buy"]), 50)
        sell = buy + spread + round(rng.random() * spread * 0.3)

        prices.append({
            "category_id": cat_id,
            "name": CATEGORY_NAMES.get(cat_id, cat_id),
            "buy_price": buy,
            "sell_price": sell,
            "raw_avg_price": round((buy + sell) / 2),
            "sample_count": 1,
            "sources": ["行情参考价（模拟）"],
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })

    prices.sort(key=lambda p: p["category_id"])
    return prices


def derive_prices(real_prices: list) -> list:
    """
    从已有真实数据推导缺失品类价格
    推导关系：
    - 报纸 ≈ 书纸 × 0.88
    - 黄板纸 ≈ 混合废纸 × 0.72
    - 瓶玻璃 ≈ 平板玻璃 × 0.65
    - 家电类保持模拟
    """
    # 建立已有数据的查找表
    real_map = {p["category_id"]: p for p in real_prices}

    derivations = {
        "paper_baozhi": {
            "from": "paper_shuzhi",
            "factor": 0.88,
            "desc": "由书纸价格推导",
        },
        "paper_huangban": {
            "from": "paper_hunhe",
            "factor": 0.72,
            "desc": "由混合废纸价格推导",
        },
        "glass_bottle": {
            "from": "glass_flat",
            "factor": 0.65,
            "desc": "由平板玻璃价格推导",
        },
    }

    derived = []
    for cat_id, rule in derivations.items():
        source = real_map.get(rule["from"])
        if source:
            buy = max(1, round(source["buy_price"] * rule["factor"]))
            sell = max(1, round(source["sell_price"] * rule["factor"]))
            derived.append({
                "category_id": cat_id,
                "name": CATEGORY_NAMES.get(cat_id, cat_id),
                "buy_price": buy,
                "sell_price": sell,
                "raw_avg_price": round((buy + sell) / 2),
                "sample_count": source.get("sample_count", 1),
                "sources": [f"{rule['desc']}（参考）"],
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            })

    return derived


def main():
    # 解析命令行参数
    force_simulate = "--simulate" in sys.argv or "-s" in sys.argv

    print("=" * 60)
    print("🐍 废品价格 Python 爬虫")
    print(f"   启动时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if force_simulate:
        print("   模式: 模拟数据生成")
    print("=" * 60)
    print()

    # 1. 加载爬虫规则
    if not RULES_FILE.exists():
        print(f"❌ 规则文件不存在: {RULES_FILE}")
        sys.exit(1)

    with open(RULES_FILE, "r", encoding="utf-8") as f:
        rules = json.load(f)

    sites = rules.get("sites", [])
    enabled_sites = [s for s in sites if s.get("enabled", True)]

    print(f"📋 加载 {len(sites)} 个站点规则，其中 {len(enabled_sites)} 个已启用\n")

    # 2. 依次爬取各站点（非模拟模式）
    all_logs = []
    if not force_simulate:
        for i, site in enumerate(sites):
            if not site.get("enabled", True):
                print(f"  ⏭️ [{site.get('name', '未知')}] 已禁用，跳过")
                all_logs.append({
                    "website_name": site.get("name", "未知"),
                    "status": "skipped",
                    "error_msg": "站点已禁用",
                })
                continue

            site_type = site.get("type", "html")
            if site_type == "jintou_api":
                log = crawl_jintou_api(site)
            else:
                log = crawl_site(site)
            all_logs.append(log)

            # 速率限制：站点间延迟
            if i < len(enabled_sites) - 1:
                delay = MIN_DELAY + random.random() * (MAX_DELAY - MIN_DELAY)
                print(f"  ⏳ 等待 {delay:.1f}s...\n")
                time.sleep(delay)

    # 3. 合并结果
    print(f"\n{'=' * 60}")
    print("📊 汇总结果")

    success_count = sum(1 for log in all_logs if log["status"] == "success")
    total_items = sum(log.get("items_scraped", 0) for log in all_logs)

    print(f"   成功站点: {success_count}/{len(sites)}")
    print(f"   原始条目: {total_items}")

    prices = merge_results(all_logs)

    # 回退：真实爬取 → 推导缺失 → 模拟兜底
    real_categories = set(p["category_id"] for p in prices)
    derived_prices = derive_prices(prices)
    for dp in derived_prices:
        if dp["category_id"] not in real_categories:
            prices.append(dp)
    
    real_categories = set(p["category_id"] for p in prices)  # 更新
    all_categories = set(BASE_PRICES.keys())
    missing_categories = all_categories - real_categories

    if missing_categories:
        sim_prices = simulate_prices()
        for sp in sim_prices:
            if sp["category_id"] in missing_categories:
                prices.append(sp)

    # 统计来源
    n_real = len([p for p in prices if "推导" not in str(p.get("sources","")) and "模拟" not in str(p.get("sources",""))])
    n_derived = len([p for p in prices if "推导" in str(p.get("sources",""))])
    n_sim = len([p for p in prices if "模拟" in str(p.get("sources",""))])

    if n_real + n_derived + n_sim > n_real:
        data_source = f"真实{n_real}+推导{n_derived}+模拟{n_sim}"
    else:
        data_source = "真实爬取"

    if force_simulate:
        data_source = "模拟行情"

    print(f"   📊 真实:{n_real} 推导:{n_derived} 模拟:{n_sim}")

    print(f"   最终品类: {len(prices)} ({data_source})")

    # 4. 输出到文件
    output = {
        "version": rules.get("version", "1.0.0"),
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "total_categories": len(prices),
        "total_raw": total_items,
        "success_sites": success_count,
        "total_sites": len(sites),
        "data_source": data_source,
        "prices": prices,
        "logs": [
            {
                "website_name": log["website_name"],
                "status": log["status"],
                "items_scraped": log.get("items_scraped", 0),
                "error_msg": log.get("error_msg", ""),
            }
            for log in all_logs
        ],
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n📁 已保存: {OUTPUT_FILE}")

    # 5. 打印结果
    if prices:
        print(f"\n{'─' * 60}")
        print("抓取结果预览（前15条）:")
        print(f"{'─' * 60}")
        print(f"{'品类':<12} {'名称':<10} {'收购价':>8} {'卖出价':>8} {'样本':>4} {'来源'}")
        print(f"{'─' * 60}")
        for p in prices[:15]:
            sources_str = ", ".join(p.get("sources", [])[:2])
            print(
                f"{p['category_id']:<12} {p['name']:<10} "
                f"¥{p['buy_price']:>6,}  ¥{p['sell_price']:>6,} "
                f"{p['sample_count']:>4}  {sources_str}"
            )
        if len(prices) > 15:
            print(f"  ... 共 {len(prices)} 个品类")

    # 6. 打印失败信息
    failed = [log for log in all_logs if log["status"] == "failed"]
    if failed:
        print(f"\n⚠️ 失败站点 ({len(failed)}):")
        for log in failed:
            print(f"  - {log['website_name']}: {log.get('error_msg', '未知错误')}")

    print(f"\n✅ 爬虫完成 ({datetime.now().strftime('%H:%M:%S')})")


if __name__ == "__main__":
    main()
