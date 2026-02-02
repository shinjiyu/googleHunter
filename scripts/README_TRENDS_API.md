# Google Trends API Library

基于 Playwright 抓包分析的 Google Trends API 库，提供协议模拟 + 浏览器自动化双重方案。

## 特性

- **协议模拟**: 直接调用 Google Trends 内部 API，无需浏览器
- **Playwright 后备**: API 失败时自动切换到浏览器模拟
- **抓包工具**: 用于分析和调试 API 请求
- **异步支持**: 同时支持同步和异步调用

## 安装

```bash
# 安装依赖
pip install -r requirements-trends.txt

# 安装 Playwright 浏览器
playwright install chromium
```

## 快速开始

### 基本使用

```python
from trends_api import TrendsAPI

# 创建 API 实例
api = TrendsAPI()

# 获取每日热搜
daily = api.daily_trends(geo="US")
for item in daily[:5]:
    print(f"{item.title} ({item.traffic})")

# 获取关键词趋势
interest = api.interest_over_time(["python", "javascript"])
for kw, data in interest.items():
    if data:
        print(f"{kw}: {data[-1].value}")

# 获取相关查询
related = api.related_queries("machine learning")
print("Top:", [q.query for q in related["top"][:5]])
print("Rising:", [q.query for q in related["rising"][:5]])

# 清理资源
api.close_sync()
```

### 异步使用

```python
import asyncio
from trends_api import TrendsAPI

async def main():
    async with TrendsAPI() as api:
        # 获取每日热搜
        daily = await api.daily_trends_async(geo="US")
        
        # 获取多个关键词趋势
        interest = await api.interest_over_time_async(
            ["AI", "machine learning", "deep learning"]
        )
        
        # 获取地区兴趣
        regions = await api.interest_by_region_async("python")

asyncio.run(main())
```

### 配置选项

```python
from trends_api import TrendsAPI, TrendsAPIConfig

config = TrendsAPIConfig(
    geo="US",                    # 默认地区
    hl="en-US",                  # 界面语言
    use_fallback=True,           # 启用 Playwright 后备
    headless=True,               # 无头模式
    proxy="http://127.0.0.1:8080", # 代理 (可选)
)

api = TrendsAPI(config)
```

## 命令行使用

```bash
# 获取每日热搜
python trends_api.py daily --geo US

# 获取关键词趋势
python trends_api.py interest --keywords "python,javascript" --geo US

# 获取相关查询
python trends_api.py related --keywords "machine learning" --geo US

# 获取实时趋势
python trends_api.py realtime --geo US
```

## 模块说明

### 1. `capture_trends_api.py` - 抓包工具

用于分析 Google Trends API 请求结构。

```bash
# 抓取 explore 页面
python capture_trends_api.py --keyword "python" --output captures/

# 抓取每日热搜
python capture_trends_api.py --daily-trends --geo US

# 可视化模式 (非无头)
python capture_trends_api.py --keyword "AI" --output captures/
```

输出文件:
- `requests_*.json`: 捕获的 API 请求
- `tokens_*.json`: 提取的 token
- `cookies_*.json`: 浏览器 cookie
- `api_doc_*.md`: 自动生成的 API 文档

### 2. `google_trends_client.py` - 协议模拟

直接调用 Google Trends API，无需浏览器。

```python
from google_trends_client import GoogleTrendsClient, TrendsConfig

config = TrendsConfig(geo="US")
client = GoogleTrendsClient(config)

# 获取每日热搜
trends = client.get_daily_trends()

# 获取趋势数据
interest = client.get_interest_over_time(["python"])

# 获取相关查询
related = client.get_related_queries("AI")

client.close()
```

### 3. `playwright_fetcher.py` - 浏览器模拟

使用 Playwright 模拟真实浏览器访问。

```python
import asyncio
from playwright_fetcher import PlaywrightTrendsFetcher, FetcherConfig

async def main():
    config = FetcherConfig(headless=True, geo="US")
    
    async with PlaywrightTrendsFetcher(config) as fetcher:
        # 获取每日热搜
        daily = await fetcher.get_daily_trends()
        
        # 获取趋势数据
        interest = await fetcher.get_interest_over_time(["python"])
        
        # 截图保存
        await fetcher.take_screenshot("trends.png")

asyncio.run(main())
```

### 4. `trends_api.py` - 统一入口

整合协议模拟和浏览器后备的统一 API。

## API 端点说明

基于抓包分析，Google Trends 使用以下内部 API:

| 端点 | 功能 |
|------|------|
| `/trends/api/explore` | 获取 widget token |
| `/trends/api/dailytrends` | 每日热搜 |
| `/trends/api/realtimetrends` | 实时趋势 |
| `/trends/api/widgetdata/multiline` | 时间序列数据 |
| `/trends/api/widgetdata/relatedsearches` | 相关查询 |
| `/trends/api/widgetdata/comparedgeo` | 地区兴趣 |
| `/trends/api/autocomplete` | 自动完成 |

## 注意事项

1. **速率限制**: Google 有未公开的速率限制，建议请求间隔 1-2 秒
2. **地区限制**: 某些地区可能无法直接访问，需使用代理
3. **Token 过期**: API token 有时效性，库会自动刷新
4. **数据准确性**: 趋势数据为相对值 (0-100)，非绝对搜索量

## 故障排除

### API 调用失败

```python
# 启用详细日志
import logging
logging.basicConfig(level=logging.DEBUG)

# 或仅使用 Playwright
config = TrendsAPIConfig(use_fallback=True)
api = TrendsAPI(config)
```

### 网络问题

```python
# 使用代理
config = TrendsAPIConfig(proxy="http://127.0.0.1:8080")
```

### 浏览器问题

```bash
# 重新安装浏览器
playwright install chromium --force
```

## 与 pytrends 对比

| 特性 | pytrends | 本库 |
|------|----------|------|
| 依赖 | requests | httpx + playwright |
| 反爬虫 | 易被封锁 | 自动降级到浏览器 |
| 维护 | 年久失修 | 活跃开发 |
| 异步 | 不支持 | 完全支持 |
| Token | 手动处理 | 自动管理 |
