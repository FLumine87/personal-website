#!/usr/bin/env python3
"""
build-post — Markdown 文章 → 静态 HTML 页面
===========================================

为什么需要它
------------
个人网站是纯静态站（无构建步骤）。手写 HTML 写文章会变成"两份真相"：
Markdown 改一次、HTML 再改一次，迟早不同步。这个脚本把 Markdown 当作唯一真相，
并把插图**内联**成 HTML 里的 <svg>（不是 <img>），这样图才能跟随站点
`<html data-theme="dark">` 主题切换 —— 外部 <img> 引用的 SVG 拿不到页面的 CSS 变量。

用法
----
    python3 tools/build-post.py <文章.md> --out <输出.html> [--figs 目录] [--site 前缀]

插图
----
在 Markdown 里写一行占位：

    {{FIG:state-space}}

脚本会读取 `<figs>/fig-state-space.svg`，把 SVG 源码**内联**，并附上图注
（图注表见下方 CAPTIONS；图内文字是英文，图注是中文，配合中文正文）。

约束
----
- 站点主题切换依赖 `<html data-theme>`，因此输出页必须原样保留 header/footer 结构。
- 只做这个站需要的最小子集，不做通用静态站点生成器。
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

try:
    import markdown
except ImportError:  # pragma: no cover
    sys.exit("需要 python3-markdown：pip install markdown")

FIG_RE = re.compile(r"^\{\{FIG:([a-zA-Z0-9_-]+)\}\}\s*$", re.MULTILINE)
PLACEHOLDER = '<figure class="post-figure" data-fig="{fid}"></figure>'

# 图注：中文说明 + 关键英文标识符。正文是中文，图内文字是英文。
CAPTIONS: dict[str, str] = {
    "state-space": (
        "<b>状态空间爆炸。</b>八个输入参数逐个相乘，组合数冲上 8.96 × 10¹²。"
        "横轴为对数刻度——正因为是指数增长，人类才无法靠写分支去覆盖它。"
    ),
    "deadlock": (
        "<b>同一个卡死场景，同一份决策骨架，差别只在有没有记忆。</b>"
        "上泳道是基线档案：40 帧里动作与参数一个字节都没变，永远走不出来；"
        "下泳道加了监控变量：第 32 帧（<code>no_progress = 31.0s</code>）锚点从 "
        "<code>local_far</code> 切到 <code>local_stuck_escape</code>，<code>duration</code> 从 10.0 秒变 15.0 秒。"
        "数据来自项目里真实跑过的演示脚本，不是示意图。"
    ),
    "architecture": (
        "<b>XML 前馈 + 轻型网络。</b>XML 负责「不能做什么」（锚点、方向、红线），"
        "网络负责「允许范围内做什么最优」（增量 Δ）。两者汇合成<b>基准 + Δ</b>，"
        "再被红线硬性钳位。调参改动的是 XML 里的偏置值，不是网络权重。"
    ),
    "continuity": (
        "<b>阈值是悬崖，决策空间是斜坡。</b>可在右上角切换两种视图："
        "<code>if / else</code> 在 30% 处硬跳变，<code>XML + Δ</code> 则是连续倾向的混合。"
        "把指针移到曲线上（或点一下图后用 ← → ）可以看到任意血量下的三类倾向数值；"
        "圆点标出的 29% / 31% / 35% 正是正文里引用的三个锚点值。"
    ),
}

PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - FLumine</title>
    <meta name="description" content="{description}">
    <script>
        (function() {{
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
        }})();
    </script>
    <link rel="stylesheet" href="{css}">
</head>
<body>
    <header>
        <div class="header-content">
            <h1>Blog</h1>
            <nav>
                <ul>
                    <li><a href="{home}">Home</a></li>
                    <li><a href="{about}">About</a></li>
                    <li><a href="{blog}" class="active">Blog</a></li>
                </ul>
            </nav>
            <button id="theme-toggle" class="theme-toggle" aria-label="Toggle dark/light theme">
                <img class="theme-icon sun-icon" src="{sun}" alt="Light mode" width="20" height="20">
                <img class="theme-icon moon-icon" src="{moon}" alt="Dark mode" width="20" height="20">
            </button>
        </div>
    </header>

    <main>
        <div class="container">
            <article class="post">
                <div class="post-header">
                    <p class="post-meta"><span class="post-series">{series}</span> <time datetime="{date}">{date_human}</time></p>
                    <h1>{title}</h1>
                    <p class="post-subtitle">{subtitle}</p>
                </div>
                <div class="post-body">
{body}
                </div>
                <div class="post-footer-nav">
                    <a href="{blog}">← Back to all posts</a>
                    <a href="{home}">Home</a>
                </div>
            </article>
        </div>
    </main>

    <footer>
        <p>© 2025 FLumine</p>
    </footer>

    <script>
        function initThemeToggle() {{
            const themeToggle = document.getElementById('theme-toggle');
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            themeToggle?.addEventListener('click', () => {{
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
            }});
        }}
        if (document.readyState === 'loading') {{
            document.addEventListener('DOMContentLoaded', initThemeToggle);
        }} else {{
            initThemeToggle();
        }}
    </script>
</body>
</html>
"""


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    raw = text[3:end].strip("\n")
    body = text[end + 4 :].lstrip("\n")
    meta: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, body


def human_date(iso: str) -> str:
    try:
        y, m, d = (int(p) for p in iso.split("-"))
    except ValueError:
        return iso
    return f"{d} {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} {y}"


def load_figure(fid: str, figs_dir: Path) -> str:
    svg_path = figs_dir / f"fig-{fid}.svg"
    if not svg_path.exists():
        raise SystemExit(f"插图缺失：{svg_path}")
    svg = svg_path.read_text(encoding="utf-8").strip()
    if not svg.startswith("<svg"):
        raise SystemExit(f"插图不是 SVG：{svg_path}")
    caption = CAPTIONS.get(fid, "")
    cap = f"\n                    <figcaption>{caption}</figcaption>" if caption else ""
    return f'<figure class="post-figure">\n{svg}{cap}\n</figure>'


def main() -> int:
    ap = argparse.ArgumentParser(description="Markdown 文章 → 静态 HTML")
    ap.add_argument("source", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--figs", type=Path, default=None, help="插图目录（默认：源码同级的 figs/）")
    ap.add_argument("--site", default="..", help="站点根相对前缀（默认 ..）")
    args = ap.parse_args()

    figs_dir = args.figs or args.source.parent / "figs"
    if not figs_dir.is_dir():
        raise SystemExit(f"插图目录不存在：{figs_dir}")

    meta, body_md = parse_front_matter(args.source.read_text(encoding="utf-8"))

    used: list[str] = []

    def stash(match: re.Match[str]) -> str:
        fid = match.group(1)
        if fid not in used:
            used.append(fid)
        return PLACEHOLDER.format(fid=fid)

    body_md = FIG_RE.sub(stash, body_md)

    body_html = markdown.markdown(
        body_md,
        extensions=["extra", "sane_lists"],
        output_format="html5",
    )

    for fid in used:
        body_html = body_html.replace(
            PLACEHOLDER.format(fid=fid), load_figure(fid, figs_dir)
        )
    if "data-fig=" in body_html:
        leftover = re.findall(r'data-fig="([^"]+)"', body_html)
        raise SystemExit(f"有插图标记未被替换：{leftover}")

    site = args.site.rstrip("/")
    prefix = f"{site}/" if site else ""
    date = meta.get("date", "")
    page = PAGE.format(
        title=html.escape(meta.get("title", args.source.stem)),
        description=html.escape(meta.get("subtitle", meta.get("title", ""))),
        series=html.escape(meta.get("series", "Post")),
        date=html.escape(date),
        date_human=html.escape(human_date(date)),
        subtitle=html.escape(meta.get("subtitle", "")),
        body=body_html,
        css=f"{prefix}css/style.css",
        home=f"{prefix}index.html",
        about=f"{prefix}about.html",
        blog=f"{prefix}blog.html",
        sun=f"{prefix}images/sun.svg",
        moon=f"{prefix}images/moon.svg",
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(page, encoding="utf-8")
    print(f"✅ {args.out}  ({len(page):,} bytes, 内联插图 {len(used)} 张: {', '.join(used)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
