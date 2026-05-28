# Generating OS icons

`electron/icon.svg` is the single source of truth for app artwork. The build
needs three rasterized forms here (this directory) before
`electron-builder` will produce installers with proper icons:

| File              | Used for                                        |
| ----------------- | ----------------------------------------------- |
| `icon.icns`       | macOS .app bundle + DMG                         |
| `icon.ico`        | Windows NSIS installer + .exe                   |
| `icon.png`        | Linux AppImage / deb / `BrowserWindow.icon`     |
| `trayTemplate.png`| macOS menu bar (monochrome template, 22x22)     |
| `tray.png`        | Windows/Linux tray (16-22px)                    |

Until you generate them, the app still launches — `tray.ts` falls back to a
1x1 transparent image and `BrowserWindow` uses the OS default — but installer
output will look unbranded. **Generate before packaging for distribution.**

## One-liners per OS

These assume `rsvg-convert` (`librsvg`) and ImageMagick are installed.

```bash
cd electron/icons

# macOS .icns (requires iconutil — macOS only)
mkdir -p icon.iconset
for size in 16 32 64 128 256 512 1024; do
  rsvg-convert -w $size -h $size ../icon.svg > icon.iconset/icon_${size}x${size}.png
done
# Retina variants
cp icon.iconset/icon_32x32.png    icon.iconset/icon_16x16@2x.png
cp icon.iconset/icon_64x64.png    icon.iconset/icon_32x32@2x.png
cp icon.iconset/icon_256x256.png  icon.iconset/icon_128x128@2x.png
cp icon.iconset/icon_512x512.png  icon.iconset/icon_256x256@2x.png
cp icon.iconset/icon_1024x1024.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

# Windows .ico (any platform with ImageMagick)
convert ../icon.svg -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Linux .png (256x256)
rsvg-convert -w 256 -h 256 ../icon.svg > icon.png

# Tray icons
rsvg-convert -w 22 -h 22 ../icon.svg > trayTemplate.png  # macOS template
rsvg-convert -w 16 -h 16 ../icon.svg > tray.png          # Win/Linux
```

## Without rsvg-convert

If you only have ImageMagick:

```bash
convert -background none -density 1024 ../icon.svg -resize 256x256 icon.png
convert -background none -density 1024 ../icon.svg -define icon:auto-resize=256,128,64,48,32,16 icon.ico
convert -background none -density 1024 ../icon.svg -resize 22x22 trayTemplate.png
convert -background none -density 1024 ../icon.svg -resize 16x16 tray.png
```

ImageMagick can't produce `.icns` directly — use `iconutil` on macOS as
above, or `png2icns` from libicns on Linux.

## macOS template image notes

`trayTemplate.png` should be **monochrome with alpha** (the OS recolors it
for light/dark menu bar). Our `tray.ts` calls `setTemplateImage(true)`
automatically when the platform is darwin. If your generated PNG keeps the
purple gradient, flatten it to single-color first:

```bash
convert -background none -density 1024 ../icon.svg -resize 22x22 \
  -alpha extract -negate trayTemplate.png
```

## TODO

These placeholders should exist in this directory once generated:

- [ ] `icon.icns`
- [ ] `icon.ico`
- [ ] `icon.png`
- [ ] `trayTemplate.png`
- [ ] `tray.png`

The CI/release job should generate these from `electron/icon.svg` rather
than committing the binaries (smaller diffs, single source of truth).
