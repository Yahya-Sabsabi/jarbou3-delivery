from pathlib import Path
from PIL import Image, ImageChops

root = Path('/home/ubuntu/jarbou3-delivery/assets/images')
source = Image.open(root / 'icon.png').convert('RGB')
# Detect the non-white logo artwork and crop its generous white margins.
mask = ImageChops.invert(source).convert('L').point(lambda value: 255 if value > 20 else 0)
bbox = mask.getbbox()
if not bbox:
    raise RuntimeError('Could not detect logo artwork')
art = source.crop(bbox).convert('RGBA')
# Recolor all artwork pixels to near-black while preserving anti-aliased edges.
pixels = art.load()
for y in range(art.height):
    for x in range(art.width):
        r, g, b, a = pixels[x, y]
        luminance = (r + g + b) / 3
        alpha = max(0, min(255, int((255 - luminance) * 1.35)))
        pixels[x, y] = (12, 18, 16, alpha)
# Place the mark substantially larger and centered on a clean white square.
def make(size):
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    target = int(size * 0.78)
    scale = min(target / art.width, target / art.height)
    resized = art.resize((max(1, int(art.width * scale)), max(1, int(art.height * scale))), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas.convert('RGB')

make(512).save(root / 'optimus-black-logo.png', optimize=True)
make(512).save(root / 'icon.png', optimize=True)
make(512).save(root / 'splash-icon.png', optimize=True)
make(432).save(root / 'android-icon-foreground.png', optimize=True)
make(432).save(root / 'android-icon-monochrome.png', optimize=True)
make(192).save(root / 'favicon.png', optimize=True)
print(f'Created centered black logo from detected bounds {bbox}.')
