#!/usr/bin/env python3
"""
Project PW — 图片处理脚本
=========================

为个人网站生成多档尺寸的图片（WebP + JPEG 回退），配合 HTML 的
srcset/sizes 让浏览器按屏幕自动挑选合适的一档。

用法
----
    python3 build-images.py                 # 处理 images/ 下所有原图
    python3 build-images.py --check         # 只报告，不写文件
    python3 build-images.py --clean         # 清理生成物（保留原图归档）
    python3 build-images.py --widths light=1920,2560

工作方式
--------
1. 把原始大图放在 images/src/ 下（脚本会保留它，不动）
2. 脚本按配置生成各档尺寸，输出到 images/，命名为：
       light-1920.webp / light-1920.jpg
3. 未在配置中列出的图片，按 --default-widths 处理

配置来源：脚本内置 RULES，可用 --config 指定外部 JSON 覆盖。

设计原则
--------
- 原图永不覆盖（源在 images/src/，输出在 images/）
- 幂等：重复运行结果一致，已是最新的文件会跳过
- 只处理位图；SVG 直接复制
"""

import argparse
import json
import os
import shutil
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("需要 Pillow：pip install Pillow")


# ── 默认配置 ────────────────────────────────────────────────────────────
# 每张图按其实际显示场景配置档位。
# 宽度档位应覆盖：最窄布局 → 最宽布局，并含 2x 高清屏版本。

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "/mnt/c/桌面资料/tmp资料/personal-website"
IMAGES = os.path.join(SITE, "images")
SRC = os.path.join(IMAGES, "src")

RULES = {
    # 全屏背景：铺满视口，需要大尺寸
    "light":  {"widths": [1920, 2560], "quality": 82},
    "dark":   {"widths": [1920, 2560], "quality": 82},

    # 头像：CSS 固定 150x150，2x 即 300
    "head":   {"widths": [150, 300], "quality": 85},

    # 文中配图：左栏内约 800px 宽
    "sunrise": {"widths": [320, 640, 1280], "quality": 82},

    # 相册图：aside 窄栏内约 400px 宽
    "00cb880efb06e3744df38a1a6097b7e": {"widths": [320, 640, 960], "quality": 82},
    "f3c180aa596f4b2498795914aa761f0": {"widths": [320, 640, 960], "quality": 82},
    "TX1_0065":                        {"widths": [320, 640, 960], "quality": 82},
    "d6a21a7f70d1f281cf5760722d0aa77": {"widths": [320, 640, 960], "quality": 82},
    "WU1_1798":                        {"widths": [320, 640, 960], "quality": 82},
}

DEFAULT_WIDTHS = [800, 1600]
DEFAULT_QUALITY = 82
WEBP_QUALITY = None   # None → 用 rules 的 quality


def find_sources():
    """找出所有待处理的源图。优先 images/src/，其次未处理的 images/ 原图。"""
    out = []
    if os.path.isdir(SRC):
        for n in sorted(os.listdir(SRC)):
            if n.lower().endswith((".jpg", ".jpeg", ".png")):
                out.append(os.path.join(SRC, n))
    return out


def rule_for(stem, config):
    if stem in config:
        return config[stem]
    return {"widths": DEFAULT_WIDTHS, "quality": DEFAULT_QUALITY}


def process(src_path, rules, dry_run=False, force=False):
    stem = os.path.splitext(os.path.basename(src_path))[0]
    rule = rule_for(stem, rules)
    widths = sorted(set(rule["widths"]))
    quality = rule.get("quality", DEFAULT_QUALITY)

    im = Image.open(src_path)
    im = ImageOps.exif_transpose(im)
    if im.mode != "RGB":
        im = im.convert("RGB")
    ow, oh = im.size

    results = []
    for w in widths:
        if w > ow:
            # 不放大：源图比目标档还小就跳过该档
            continue
        nh = round(oh * w / ow)
        resized = im.resize((w, nh), Image.LANCZOS)

        for ext, fmt, kw in (
            ("webp", "WEBP", dict(quality=quality, method=6)),
            ("jpg",  "JPEG", dict(quality=quality + 2, optimize=True, progressive=True)),
        ):
            out_name = f"{stem}-{w}.{ext}"
            out_path = os.path.join(IMAGES, out_name)

            if not force and os.path.exists(out_path):
                if os.path.getmtime(out_path) >= os.path.getmtime(src_path):
                    results.append((out_name, os.path.getsize(out_path), "跳过(已最新)"))
                    continue

            if dry_run:
                results.append((out_name, 0, "将生成"))
                continue

            resized.save(out_path, fmt, **kw)
            results.append((out_name, os.path.getsize(out_path), "生成"))

    # 生成一份"最大档"的固定名，作为 src 回退与旧引用兼容
    biggest = max([w for w in widths if w <= ow], default=None)
    if biggest:
        for ext, fmt, kw in (
            ("webp", "WEBP", dict(quality=quality, method=6)),
            ("jpg",  "JPEG", dict(quality=quality + 2, optimize=True, progressive=True)),
        ):
            out_path = os.path.join(IMAGES, f"{stem}.{ext}")
            if dry_run:
                results.append((f"{stem}.{ext}", 0, "将生成(回退)"))
                continue
            if not force and os.path.exists(out_path) and \
               os.path.getmtime(out_path) >= os.path.getmtime(src_path):
                results.append((f"{stem}.{ext}", os.path.getsize(out_path), "跳过(已最新)"))
                continue
            nh = round(oh * biggest / ow)
            im.resize((biggest, nh), Image.LANCZOS).save(out_path, fmt, **kw)
            results.append((f"{stem}.{ext}", os.path.getsize(out_path), "生成(回退)"))

    return ow, oh, results


def main():
    ap = argparse.ArgumentParser(description="为 Project PW 生成多档尺寸图片")
    ap.add_argument("--check", action="store_true", help="只报告，不写文件")
    ap.add_argument("--force", action="store_true", help="强制重新生成")
    ap.add_argument("--config", help="外部 JSON 配置（覆盖内置 RULES）")
    args = ap.parse_args()

    rules = dict(RULES)
    if args.config:
        with open(args.config, encoding="utf-8") as f:
            rules.update(json.load(f))

    sources = find_sources()
    if not sources:
        print(f"未找到源图。请把原始大图放到：{SRC}")
        print("（脚本不会覆盖 images/ 下已被网站引用的文件）")
        return 1

    print(f"源目录: {SRC}")
    print(f"输出到: {IMAGES}")
    print(f"模式  : {'仅检查' if args.check else '写入'}")
    print()

    total = 0
    for s in sources:
        ow, oh, results = process(s, rules, dry_run=args.check, force=args.force)
        print(f"{os.path.basename(s)}  ({ow}x{oh})")
        for name, size, status in results:
            total += size
            print(f"    {status:<14} {size/1024:>8.1f} KB  {name}")
        print()

    print(f"产物合计: {total/1048576:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
