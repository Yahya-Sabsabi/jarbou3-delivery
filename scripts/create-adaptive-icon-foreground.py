from pathlib import Path
from PIL import Image, ImageChops

root = Path('/home/ubuntu/jarbou3-delivery/assets/images')
source = Image.open(root / 'optimus-black-logo.png').convert('RGB')
mask = ImageChops.invert(source).convert('L').point(lambda value: 255 if value > 18 else 0)
bbox = mask.getbbox()
if not bbox:
    raise RuntimeError('Logo artwork not found')
art = source.crop(bbox).convert('RGBA')
pixels = art.load()
for y in range(art.height):
    for x in range(art.width):
        r, g, b, a = pixels[x, y]
        luminance = (r + g + b) / 3
        alpha = max(0, min(255, int((255 - luminance) * 1.35)))
        pixels[x, y] = (10, 18, 16, alpha)
size = 432
canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
target_width = int(size * 0.84)
scale = target_width / art.width
resized = art.resize((int(art.width * scale), int(art.height * scale)), Image.Resampling.LANCZOS)
canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
canvas.save(root / 'android-icon-foreground-transparent.png', optimize=True)
print('Created transparent adaptive foreground:', bbox, resized.size)
