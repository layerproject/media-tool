# Icons Directory

This directory contains application icons for different platforms.

## Required Icons

### macOS
- **icon.icns** - macOS icon file (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)

### Windows
- **icon.ico** - Windows icon file (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)

### Linux
- **icon.png** - PNG icon files in various sizes
- Recommended sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512

## Generating Icons

You can use tools like:
- **electron-icon-builder** - npm package for generating icons
- **iconutil** (macOS) - for creating .icns files
- **ImageMagick** - for converting and resizing images

### Using electron-icon-builder

```bash
npm install -g electron-icon-builder
electron-icon-builder --input=./source-icon.png --output=./build/icons
```

## Source Image

Place your source image (ideally 1024x1024 PNG with transparency) in this directory and generate the platform-specific icons from it.
