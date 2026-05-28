# Icon

`icon.svg` is the source. Chrome MV3 prefers PNG. Convert with:

```
rsvg-convert -w 128 -h 128 icon.svg -o icon128.png
```

(or use any online SVG→PNG converter), then update `manifest.json` `icons` entries.
