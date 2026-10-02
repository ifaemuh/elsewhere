"""Cut the cast into web assets for apps/web/public/characters.

Interim source (Task 5): the approved A++ lineup mockup.
  python3 scripts/cut-characters.py lineup /Users/eapha/Github/elsewhere/.superpowers/brainstorm/18616-1790897391/content/a-plusplus.png
Cast-bible source (Task 13): one PNG per character named <character>.png.
  python3 scripts/cut-characters.py portraits ~/Github/foundry/accounts/go-elsewhere/sheets

Writes <name>.png (640x960, transparent, feet on a shared baseline) and <name>-avatar.png (256x256).
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

NAMES = ["capybara", "owl", "raccoon", "pigeon"]
# Measured on the 2528x1696 lineup with a column scan on 2026-10-01.
LINEUP_BOXES = {
    "capybara": (40, 350, 716, 1414),
    "owl": (690, 474, 1246, 1416),
    "raccoon": (1214, 374, 1820, 1434),
    "pigeon": (1808, 374, 2494, 1434),
}
OUT = Path(__file__).resolve().parent.parent / "public" / "characters"
PORTRAIT = (640, 960)
AVATAR = 256


def keep_largest_component(img: Image.Image) -> Image.Image:
    """Drops slivers of neighbouring characters that fall inside a crop box."""
    w, h = img.size
    alpha = img.getchannel("A").load()
    seen = bytearray(w * h)
    best: list[tuple[int, int]] = []
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            if alpha[x, y] == 0 or seen[y * w + x]:
                continue
            component = []
            queue = deque([(x, y)])
            seen[y * w + x] = 1
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and alpha[nx, ny]:
                        seen[ny * w + nx] = 1
                        queue.append((nx, ny))
            if len(component) > len(best):
                best = component
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x, y in best:
        mp[x, y] = 255
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out.crop(out.getbbox())


def remove_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if img.getpixel(seed)[3] != 0:
            ImageDraw.floodfill(img, seed, (0, 0, 0, 0), thresh=40)
    return keep_largest_component(img)


def fit_portrait(img: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", PORTRAIT, (0, 0, 0, 0))
    scale = min((PORTRAIT[0] - 40) / img.width, (PORTRAIT[1] - 40) / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(resized, ((PORTRAIT[0] - resized.width) // 2, PORTRAIT[1] - 20 - resized.height))
    return canvas


def avatar(img: Image.Image) -> Image.Image:
    side = round(img.width * 0.78)
    left = (img.width - side) // 2
    return img.crop((left, 0, left + side, side)).resize((AVATAR, AVATAR), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("lineup", "portraits"):
        raise SystemExit("usage: cut-characters.py lineup <lineup.png> | portraits <dir>")
    mode, src = sys.argv[1], Path(sys.argv[2]).expanduser()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        raw = Image.open(src).crop(LINEUP_BOXES[name]) if mode == "lineup" else Image.open(src / f"{name}.png")
        cut = remove_background(raw)
        fit_portrait(cut).save(OUT / f"{name}.png", optimize=True)
        avatar(cut).save(OUT / f"{name}-avatar.png", optimize=True)
        print(f"{name}: cut {cut.width}x{cut.height} -> public/characters/{name}.png")


if __name__ == "__main__":
    main()
