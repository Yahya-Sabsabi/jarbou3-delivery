from PIL import Image
from pathlib import Path
p = Path('/home/ubuntu/jarbou3-delivery/assets/images/android-icon-background.png')
Image.new('RGB', (432, 432), (255, 255, 255)).save(p, optimize=True)
print('Replaced the legacy red adaptive-icon background with white.')
