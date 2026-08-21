from pathlib import Path
from PIL import Image

source = Path("/home/ubuntu/upload/Gemini_Generated_Image_lnn93lnn93lnn93l.jfif")
targets = [
    Path("/home/ubuntu/jarbou3-delivery/assets/images/icon.png"),
    Path("/home/ubuntu/jarbou3-delivery/assets/images/splash-icon.png"),
    Path("/home/ubuntu/jarbou3-delivery/assets/images/favicon.png"),
    Path("/home/ubuntu/jarbou3-delivery/assets/images/android-icon-foreground.png"),
]

with Image.open(source) as raw:
    image = raw.convert("RGBA")
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    optimized = image.quantize(colors=192, method=Image.Quantize.FASTOCTREE)
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        optimized.save(target, format="PNG", optimize=True)
        if target.stat().st_size > 1_000_000:
            raise RuntimeError(f"Optimized logo still exceeds checkpoint limit: {target}")
