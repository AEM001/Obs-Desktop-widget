#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from filelock import FileLock
from typing import Optional
from datetime import datetime
import os
import re
import pathlib
import tzlocal

# ===== 配置区（根据需要修改） =====
VAULT_PATH = "/Users/Mac/Documents/Albert-obs"   # 你的 vault 绝对路径
DAILY_DIR  = "DailyNotes"                        # 顶层日记目录
AUTH_TOKEN = "random string"       # 改成随机串，如: os.urandom(16).hex()

# 生成文件路径：/DailyNotes/YY/YYYY-MM-DD.md
def day_file(date_str: Optional[str]) -> str:
    if not date_str:
        # 用本地时区获取今天（避免跨日）
        tz = tzlocal.get_localzone()
        date_str = datetime.now(tz).strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, detail="date 格式应为 YYYY-MM-DD")
    yy = dt.strftime("%y")
    return os.path.join(VAULT_PATH, DAILY_DIR, yy, f"{dt.strftime('%Y-%m-%d')}.md")

# 从文本中抽取 # Plan 段（跳过最前面的 YAML 头）
def extract_plan(text: str) -> str:
    # 跳过 frontmatter（首个 --- 到第二个 ---）
    i = 0
    lines = text.splitlines()
    in_front = False
    front_ended = False
    out_lines = []
    while i < len(lines):
        line = lines[i]
        if not front_ended:
            if not in_front and re.match(r'^\s*---\s*$', line):
                in_front = True
                i += 1
                continue
            elif in_front and re.match(r'^\s*---\s*$', line):
                in_front = False
                front_ended = True
                i += 1
                continue
            else:
                i += 1
                continue
        else:
            out_lines = lines[i:]
            break
    body = "\n".join(out_lines) if front_ended else text

    # 在 body 中定位 “# Plan”
    # 允许形如: "# Plan", "#  Plan   "
    plan_pat = re.compile(r'^\s*#\s*Plan\s*$', re.MULTILINE)
    m = plan_pat.search(body)
    if not m:
        return ""  # 未找到 # Plan

    start = m.end()  # 从 # Plan 行后开始
    # 从 start 之后找到下一条独立的 '---' 作为结束
    after = body[start:]
    sep_pat = re.compile(r'^\s*---\s*$', re.MULTILINE)
    m2 = sep_pat.search(after)
    if m2:
        return after[:m2.start()].lstrip("\n").rstrip()  # 去掉前导换行，末尾留干净
    else:
        return after.lstrip("\n").rstrip()

# 用新内容替换掉 # Plan 段；若不存在，则在 YAML 后插入一个
def replace_plan(text: str, new_content: str) -> str:
    lines = text.splitlines(keepends=True)

    # 定位 frontmatter 边界
    fm_start = None
    fm_end = None
    for idx, line in enumerate(lines):
        if re.match(r'^\s*---\s*$', line):
            if fm_start is None:
                fm_start = idx
            elif fm_end is None:
                fm_end = idx
                break
    body_start_idx = fm_end + 1 if fm_start is not None and fm_end is not None else 0

    # 在 body 里找 "# Plan"
    body_text = "".join(lines[body_start_idx:])
    plan_pat = re.compile(r'^\s*#\s*Plan\s*$', re.MULTILINE)
    m = plan_pat.search(body_text)

    # 目标段落模板
    new_block = []
    new_block.append("# Plan\n")
    # 保留一个空行的观感
    if new_content and not new_content.endswith("\n"):
        new_content = new_content + "\n"
    # 不强制在末尾再加 '---\n' 外的空行
    new_block.append("\n" if not new_content.startswith("\n") else "")
    new_block.append(new_content)
    # 保证结尾有分割线
    if not new_content.endswith("\n"):
        new_block.append("\n")
    new_block.append("\n---\n")
    new_block_str = "".join(new_block)

    if not m:
        # 没有 # Plan：插到 YAML 后（若无 YAML，则文件开头）
        prefix = "".join(lines[:body_start_idx])
        suffix = "".join(lines[body_start_idx:])
        # 如果 body 开头不是空行，插入一个空行更和谐
        glue = "" if suffix.startswith("\n") or suffix == "" else "\n"
        return prefix + new_block_str + glue + suffix

    # 找到 # Plan 后的结束分隔线
    start_in_body = m.end()
    after = body_text[start_in_body:]
    sep_pat = re.compile(r'^\s*---\s*$', re.MULTILINE)
    m2 = sep_pat.search(after)
    if m2:
        end_in_body = start_in_body + m2.end()
    else:
        end_in_body = len(body_text)

    # 拼接替换
    new_body = body_text[:m.start()] + new_block_str + body_text[end_in_body:]
    return "".join(lines[:body_start_idx]) + new_body

# ===== FastAPI 应用 =====
app = FastAPI(title="Obsidian Plan Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头
)


class PlanGetResp(BaseModel):
    file: str
    exists: bool
    empty: bool
    content: str

class PlanSetReq(BaseModel):
    date: Optional[str] = None   # YYYY-MM-DD
    content: str

def _auth_or_403(x_auth: Optional[str]):
    if x_auth != AUTH_TOKEN:
        raise HTTPException(403, detail="Forbidden")

@app.get("/planning", response_model=PlanGetResp)
def get_planning(date: Optional[str] = None, x_auth: Optional[str] = Header(None)):
    _auth_or_403(x_auth)
    f = day_file(date)
    if not os.path.exists(f):
        return PlanGetResp(file=f, exists=False, empty=True, content="")
    with open(f, "r", encoding="utf-8") as fp:
        text = fp.read()
    content = extract_plan(text)
    return PlanGetResp(file=f, exists=True, empty=(content.strip() == ""), content=content)

@app.post("/planning")
def set_planning(req: PlanSetReq, x_auth: Optional[str] = Header(None)):
    _auth_or_403(x_auth)
    f = day_file(req.date)
    pathlib.Path(os.path.dirname(f)).mkdir(parents=True, exist_ok=True)
    # 如果文件不存在，建立一个带 frontmatter 的最简模板
    if not os.path.exists(f):
        template = f"---\njournal: DailyNotes\njournal-date: {os.path.basename(f)[:-3]}\n---\n\n"
        with open(f, "w", encoding="utf-8") as fp:
            fp.write(template)

    lock = FileLock(f + ".lock")
    with lock:
        with open(f, "r", encoding="utf-8") as fp:
            old = fp.read()
        new = replace_plan(old, req.content)
        if new != old:
            with open(f, "w", encoding="utf-8") as fp:
                fp.write(new)

    return JSONResponse({"ok": True, "file": f})
