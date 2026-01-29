# Map Pin Creator

A small TypeScript tool that generates map pin PNGs from SVG icons and writes a marker list into `mapSettings.json`.

## Requirements

- Node.js (LTS recommended)
- npm

## Installation

```bash
npm install
```

## Usage

The script reads SVG icons from `svg/`, composites them with the base pin SVGs in `mapPins/`, and writes output to `pngWithSvg/`.

```bash
npx tsx generatePins.ts
```

### Generating PNGs in Different Sizes

To change the output PNG size, add the following line to your `.env` file:

```
OUTPUT_SCALE=2
```

For example, this will generate all pins and icons at 2x (144x144) size. Use 3 for 216x216, or 1 for 72x72.

When it finishes, PNGs are written to `pngWithSvg/` and `mapSettings.json` is updated.

## Input / Output

- Input SVG icons: `svg/`
- Base pin SVGs: `mapPins/` (`defaultPin.svg`, `defaultPinActive.svg`, `ownLocationPin.svg`)
- Output PNGs: `pngWithSvg/`
- Settings output file: `mapSettings.json` (template: `simpleMapSettings.json`)

## Environment Variables

Configure via `.env`. See `.env.example` for a template.

Supported variables:

- `BASE_PIN_COLOR_ACTIVE`
- `BASE_PIN_COLOR_DEFAULT`
- `BASE_PIN_COLOR_OWN`
- `BASE_PIN_RING_COLOR_ACTIVE`
- `BASE_PIN_STROKE_COLOR_OWN`
- `CLUSTER_COLOR`
- `CLUSTER_TEXT_COLOR`
- `COMPOSITE_SCALE`
- `ICON_COLOR_ACTIVE`
- `ICON_COLOR_DEFAULT`
- `ICON_OFFSET_X_ACTIVE`
- `ICON_OFFSET_X_DEFAULT`
- `ICON_OFFSET_Y_ACTIVE`
- `ICON_OFFSET_Y_DEFAULT`
- `ICON_SCALE`
- `MAP_PINS_BASE_URI`
- `OUTPUT_SCALE` (Default: 1, set to 2 or 3 to change PNG output size)

## Notes

- Icons named `defaultPin`, `defaultPinActive`, `ownLocationPin` in `svg/` are skipped automatically.
- `.env` is optional; defaults are used if not present.
- `CLUSTER_COLOR` and `CLUSTER_TEXT_COLOR` overwrite the related fields in `mapSettings.json`.
