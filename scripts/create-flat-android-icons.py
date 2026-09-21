from pathlib import Path
from PIL import Image, ImageChops

root = Path('/home/ubuntu/jarbou3-delivery/assets/images')
source = Image.open(root / 'optimus-black-logo.png').convert('RGB')
mask = ImageChops.invert(source).convert('L').point(lambda value: 255 if value > 18 else 0)
bbox = mask.getbbox()
art = source.crop(bbox).convert('RGBA')
pixels = art.load()
for y in range(art.height):
    for x in range(art.width):
        r, g, b, a = pixels[x, y]
        luminance = (r + g + b) / 3
        alpha = max(0, min(255, int((255 - luminance) * 1.35)))
        pixels[x, y] = (10, 18, 16, alpha)

sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for density, size in sizes.items():
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    target = int(size * 0.84)
    scale = target / art.width
    resized = art.resize((int(art.width * scale), int(art.height * scale)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    out = canvas.convert('RGB')
    folder = Path('/home/ubuntu/jarbou3-delivery/android/app/src/main/res') / f'mipmap-{density}'
    out.save(folder / 'ic_launcher.webp', 'WEBP', quality=100, method=6)
    out.save(folder / 'ic_launcher_round.webp', 'WEBP', quality=100, method=6)
print('Created flat launcher icons with artwork bounds', bbox)
