#!/usr/bin/env python3
"""Render one 1920x1080 scene card (Suede palette) to PNG. No ffmpeg text filter
needed. Args: out_png  header  body  footer"""
import sys
from PIL import Image, ImageDraw, ImageFont

out, header, body, footer = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
W, H = 1920, 1080
BG, GOLD, WHITE = (20, 10, 31), (232, 184, 75), (245, 245, 245)

ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
f_head = ImageFont.truetype(ARIAL_B, 38)
f_body = ImageFont.truetype(ARIAL, 52)
f_foot = ImageFont.truetype(ARIAL_B, 26)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def center(text, font, y, fill):
    w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill)


def wrap(text, font, maxw):
    lines, cur = [], ""
    for word in text.split():
        t = (cur + " " + word).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


# header keyword + accent rule
center(header, f_head, 92, GOLD)
d.line([(W / 2 - 130, 152), (W / 2 + 130, 152)], fill=GOLD, width=3)

# body, vertically centered block
lines = wrap(body, f_body, 1480)
lh = 66
y = (H - len(lines) * lh) / 2 + 24
for ln in lines:
    center(ln, f_body, y, WHITE)
    y += lh

# footer brand
center(footer, f_foot, H - 84, GOLD)

img.save(out)
