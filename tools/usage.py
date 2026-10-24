#!/usr/bin/env python3
"""查今天的 Cloudflare 用量，估算还能玩多少局。

用法：python3 tools/usage.py
依赖：已通过 `npx wrangler login` 登录（凭据在 ~/.config/.wrangler/config/default.toml）。

说明：Durable Object 的「行读写」不在 GraphQL 指标里，只能按每局模型推算；
     请求数是实测值。
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CFG = Path.home() / ".config/.wrangler/config/default.toml"
ACCOUNT = "4470a7a6822f0f7956c6639f319b6015"

# 免费计划每日额度
LIMIT_REQ = 100_000
LIMIT_ROWS = 100_000

# 单局消耗模型（40 回合、1 真人 + 2 人机）
PER_GAME_REQ = 125      # AI 每思考一步一次 alarm + 真人消息按 20:1 折算
PER_GAME_ROWS = 300     # 每步存快照 + setAlarm 各 1 行


def token():
    if not CFG.exists():
        sys.exit("没找到 wrangler 凭据，先跑 `npx wrangler login`")
    m = re.search(r'^oauth_token\s*=\s*"([^"]+)"', CFG.read_text(), re.M)
    if not m:
        sys.exit("凭据里没有 oauth_token")
    return m.group(1)


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/graphql",
        data=body,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req, timeout=40))


def main():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    q = """query($acc:String!,$d:String!){
      viewer{ accounts(filter:{accountTag:$acc}){
        workersInvocationsAdaptive(limit:10, filter:{date_geq:$d, date_leq:$d}){
          sum{ requests errors }
        }
        durableObjectsInvocationsAdaptiveGroups(limit:100, filter:{date_geq:$d, date_leq:$d}){
          sum{ requests }
          dimensions{ date }
        }
      }}
    }"""
    r = gql(q, {"acc": ACCOUNT, "d": today})
    if r.get("errors"):
        sys.exit("查询失败：" + json.dumps(r["errors"], ensure_ascii=False)[:300])

    acc = r["data"]["viewer"]["accounts"][0]
    worker_req = sum(g["sum"]["requests"] for g in acc.get("workersInvocationsAdaptive") or [])
    do_req = sum(g["sum"]["requests"] for g in acc.get("durableObjectsInvocationsAdaptiveGroups") or [])

    left_req = max(0, LIMIT_REQ - do_req)
    est_rows = do_req * PER_GAME_ROWS // PER_GAME_REQ
    left_rows = max(0, LIMIT_ROWS - est_rows)

    games_by_req = left_req // PER_GAME_REQ
    games_by_rows = left_rows // PER_GAME_ROWS

    print(f"UTC 日期          {today}  （北京时间 {datetime.now().strftime('%H:%M')}，UTC {datetime.now(timezone.utc).strftime('%H:%M')}）")
    print(f"Worker 请求        {worker_req:>8,} / {LIMIT_REQ:,}")
    print(f"DO 请求（实测）    {do_req:>8,} / {LIMIT_REQ:,}   剩 {left_req:,}（{left_req / LIMIT_REQ:.1%}）")
    print(f"DO 行写（推算）    {est_rows:>8,} / {LIMIT_ROWS:,}   剩 {left_rows:,}（{left_rows / LIMIT_ROWS:.1%}）")
    print()
    print(f"按「1 真人 + 2 人机」一局约 {PER_GAME_REQ} 请求 / {PER_GAME_ROWS} 行写：")
    print(f"  请求维度还能玩   {games_by_req:>5,} 局")
    print(f"  行写维度还能玩   {games_by_rows:>5,} 局   ← 瓶颈")
    print(f"  → 今天大约还能玩 {min(games_by_req, games_by_rows):,} 局")
    print()
    print("纯真人局（无 AI）消耗约为上表的 1/8，可玩局数 ×8。")
    print("离线版 / 局域网版不经过服务器，不消耗任何额度。")


if __name__ == "__main__":
    main()
