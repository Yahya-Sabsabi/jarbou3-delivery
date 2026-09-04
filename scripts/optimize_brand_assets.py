from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "assets" / "images"
source = root / "icon.png"
outputs = {
    "icon.png": 512,
    "splash-icon.png": 512,
    "favicon.png": 192,
    "android-icon-foreground.png": 432,
    "android-icon-monochrome.png": 432,
    "android-icon-background.png": 432,
}

with Image.open(source) as image:
    image = image.convert("RGB")
    for filename, size in outputs.items():
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(root / filename, format="PNG", optimize=True, compress_level=9)
        print(f"{filename}: {size}x{size}")
