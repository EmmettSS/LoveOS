#!/usr/bin/env python3
"""
qr.py — ساخت QR کد دامنه‌ی مخفی LoveOS
بابا این QR را چاپ می‌کند و به دخترم می‌دهد؛ اسکن که کند، مستقیم وارد دنیای ما می‌شود.

استفاده:
    python3 scripts/qr.py https://loveos.example.com
    python3 scripts/qr.py https://loveos.example.com --out loveos-qr.svg

بدون وابستگی خارجی — الگوریتم QR (نسخه‌ی بایت، سطح تصحیح خطا M) اینجا پیاده شده است.
"""
from __future__ import annotations

import argparse
import sys

# --------------------------------------------------------------- جدول‌ها ---
# ظرفیت داده (بایت) برای حالت byte و سطح خطای M، نسخه‌های ۱ تا ۱۰
CAPACITY_M = {1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180, 10: 213}
# (تعداد کل کدورد, بلوک‌های گروه۱, کدورد داده هر بلوک گروه۱, بلوک‌های گروه۲, کدورد گروه۲, کدورد خطا هر بلوک)
EC_M = {
    1: (26, 1, 16, 0, 0, 10),
    2: (44, 1, 28, 0, 0, 16),
    3: (70, 1, 44, 0, 0, 26),
    4: (100, 2, 32, 0, 0, 18),
    5: (134, 2, 43, 0, 0, 24),
    6: (172, 4, 27, 0, 0, 16),
    7: (196, 4, 31, 0, 0, 18),
    8: (242, 2, 38, 2, 39, 22),
    9: (292, 3, 36, 2, 37, 22),
    10: (346, 4, 43, 1, 44, 26),
}
ALIGN_POS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}
# اطلاعات نسخه برای نسخه ۷ به بالا
VERSION_INFO = {
    7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3,
}

# ----------------------------------------------------- ریاضیات گالوا GF(256)
EXP = [0] * 512
LOG = [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]


def gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return EXP[LOG[a] + LOG[b]]


def rs_generator(n: int) -> list[int]:
    """چندجمله‌ای مولد ریدسالمون با n کدورد خطا."""
    g = [1]
    for i in range(n):
        g2 = [0] * (len(g) + 1)
        for j, c in enumerate(g):
            g2[j] ^= gf_mul(c, 1)
            g2[j + 1] ^= gf_mul(c, EXP[i])
        g = g2
    return g


def rs_encode(data: list[int], n: int) -> list[int]:
    """کدوردهای تصحیح خطا برای یک بلوک داده."""
    gen = rs_generator(n)
    res = list(data) + [0] * n
    for i in range(len(data)):
        coef = res[i]
        if coef:
            for j, g in enumerate(gen):
                res[i + j] ^= gf_mul(g, coef)
    return res[len(data):]


# ----------------------------------------------------------- ساخت بیت‌ها ---
def build_bitstream(text: str, version: int) -> list[int]:
    data = text.encode("utf-8")
    total_cw, g1, g1cw, g2, g2cw, ecc = EC_M[version]
    data_cw = g1 * g1cw + g2 * g2cw

    bits: list[int] = []

    def put(value: int, length: int) -> None:
        for i in range(length - 1, -1, -1):
            bits.append((value >> i) & 1)

    put(0b0100, 4)                       # حالت byte
    put(len(data), 8 if version < 10 else 16)
    for byte in data:
        put(byte, 8)

    capacity = data_cw * 8
    put(0, min(4, capacity - len(bits)))  # ترمیناتور
    while len(bits) % 8:
        bits.append(0)
    pad = [0xEC, 0x11]
    i = 0
    while len(bits) < capacity:
        put(pad[i % 2], 8)
        i += 1

    codewords = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]

    # تقسیم به بلوک‌ها و محاسبه‌ی ECC
    blocks: list[list[int]] = []
    pos = 0
    for _ in range(g1):
        blocks.append(codewords[pos:pos + g1cw])
        pos += g1cw
    for _ in range(g2):
        blocks.append(codewords[pos:pos + g2cw])
        pos += g2cw
    ec_blocks = [rs_encode(b, ecc) for b in blocks]

    # درهم‌بافی
    final: list[int] = []
    for i in range(max(len(b) for b in blocks)):
        for b in blocks:
            if i < len(b):
                final.append(b[i])
    for i in range(ecc):
        for b in ec_blocks:
            final.append(b[i])

    out: list[int] = []
    for cw in final:
        for i in range(7, -1, -1):
            out.append((cw >> i) & 1)
    return out


# --------------------------------------------------------------- ماتریس ---
def make_matrix(text: str) -> list[list[int]]:
    version = next((v for v in range(1, 11) if len(text.encode()) <= CAPACITY_M[v]), None)
    if version is None:
        raise ValueError("آدرس خیلی طولانی است (حداکثر ۲۱۳ بایت).")

    size = 17 + version * 4
    m: list[list[int | None]] = [[None] * size for _ in range(size)]

    def finder(r: int, c: int) -> None:
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                rr, cc = r + dr, c + dc
                if 0 <= rr < size and 0 <= cc < size:
                    inside = 0 <= dr <= 6 and 0 <= dc <= 6
                    dark = inside and (dr in (0, 6) or dc in (0, 6) or (2 <= dr <= 4 and 2 <= dc <= 4))
                    m[rr][cc] = 1 if dark else 0

    finder(0, 0)
    finder(0, size - 7)
    finder(size - 7, 0)

    # الگوهای زمان‌بندی
    for i in range(8, size - 8):
        m[6][i] = 1 - i % 2
        m[i][6] = 1 - i % 2

    # الگوهای تراز — آن‌هایی که روی انگشت‌نماها می‌افتند رسم نمی‌شوند
    def overlaps_finder(r: int, c: int) -> bool:
        return (
            (r < 9 and c < 9)
            or (r < 9 and c > size - 10)
            or (r > size - 10 and c < 9)
        )

    for r in ALIGN_POS[version]:
        for c in ALIGN_POS[version]:
            if overlaps_finder(r, c):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    m[r + dr][c + dc] = 1 if max(abs(dr), abs(dc)) != 1 else 0

    m[size - 8][8] = 1  # ماژول تیره‌ی ثابت

    # رزرو فضای اطلاعات فرمت
    for i in range(9):
        if m[8][i] is None:
            m[8][i] = 0
        if m[i][8] is None:
            m[i][8] = 0
    for i in range(8):
        if m[8][size - 1 - i] is None:
            m[8][size - 1 - i] = 0
        if m[size - 1 - i][8] is None:
            m[size - 1 - i][8] = 0

    # اطلاعات نسخه (۷+)
    reserved_version = set()
    if version >= 7:
        info = VERSION_INFO[version]
        for i in range(18):
            bit = (info >> i) & 1
            r, c = i // 3, size - 11 + i % 3
            m[r][c] = bit
            m[c][r] = bit
            reserved_version.add((r, c))
            reserved_version.add((c, r))

    # چیدن داده به‌صورت مارپیچ از پایین راست
    bits = build_bitstream(text, version)
    idx = 0
    col = size - 1
    upward = True
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for row in rows:
            for c in (col, col - 1):
                if m[row][c] is None:
                    bit = bits[idx] if idx < len(bits) else 0
                    idx += 1
                    # ماسک ۰ : (row + col) % 2 == 0
                    if (row + c) % 2 == 0:
                        bit ^= 1
                    m[row][c] = bit
        upward = not upward
        col -= 2

    # اطلاعات فرمت: سطح M (۰۰) + ماسک ۰ → رشته‌ی استاندارد ۱۵ بیتی
    # بیت ۰ پرارزش‌ترین است (از چپ به راست طبق استاندارد)
    fmt = 0b101010000010010
    fbits = [(fmt >> (14 - i)) & 1 for i in range(15)]

    # نسخه‌ی اول: دور انگشت‌نمای بالا-چپ
    for i in range(6):
        m[8][i] = fbits[i]
    m[8][7] = fbits[6]
    m[8][8] = fbits[7]
    m[7][8] = fbits[8]
    for i in range(9, 15):
        m[14 - i][8] = fbits[i]

    # نسخه‌ی دوم: کنار انگشت‌نماهای پایین-چپ و بالا-راست
    for i in range(7):
        m[size - 1 - i][8] = fbits[i]
    for i in range(7, 15):
        m[8][size - 15 + i] = fbits[i]

    m[size - 8][8] = 1  # ماژول تیره‌ی همیشگی

    return [[int(v or 0) for v in row] for row in m]


# ----------------------------------------------------------------- خروجی --
def to_svg(matrix: list[list[int]], scale: int = 8, quiet: int = 4) -> str:
    n = len(matrix)
    total = (n + quiet * 2) * scale
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="{total}" viewBox="0 0 {total} {total}">',
        f'<rect width="{total}" height="{total}" fill="#fff5f9"/>',
        '<g fill="#9d174d">',
    ]
    for r, row in enumerate(matrix):
        for c, v in enumerate(row):
            if v:
                x = (c + quiet) * scale
                y = (r + quiet) * scale
                parts.append(f'<rect x="{x}" y="{y}" width="{scale}" height="{scale}"/>')
    parts.append("</g></svg>")
    return "".join(parts)


def to_ascii(matrix: list[list[int]]) -> str:
    lines = []
    pad = "  " * (len(matrix) + 4)
    lines.append(pad)
    lines.append(pad)
    for row in matrix:
        lines.append("    " + "".join("██" if v else "  " for v in row) + "    ")
    lines.append(pad)
    lines.append(pad)
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="ساخت QR دامنه‌ی مخفی LoveOS")
    ap.add_argument("url", help="آدرس کامل، مثلا https://loveos.example.com")
    ap.add_argument("--out", help="ذخیره به فایل SVG")
    ap.add_argument("--scale", type=int, default=8, help="اندازه‌ی هر ماژول در SVG")
    args = ap.parse_args()

    matrix = make_matrix(args.url)
    print(to_ascii(matrix))
    print(f"\n💗 {args.url}")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(to_svg(matrix, args.scale))
        print(f"✅ ذخیره شد: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
