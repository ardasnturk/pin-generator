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

When it finishes, PNGs are written to `pngWithSvg/` and `mapSettings.json` is updated.

## Input / Output

- Input SVG icons: `svg/`
- Base pin SVGs: `mapPins/` (`defaultPin.svg`, `defaultPinActive.svg`, `ownLocationPin.svg`)
- Output PNGs: `pngWithSvg/`
- Settings output file: `mapSettings.json` (template: `simpleMapSettings.json`)

## Environment Variables

Configure via `.env`. See `.env.example` for a template.

Supported variables:

- `ICON_SCALE`
- `COMPOSITE_SCALE`
- `ICON_OFFSET_X_DEFAULT`
- `ICON_OFFSET_Y_DEFAULT`
- `ICON_OFFSET_X_ACTIVE`
- `ICON_OFFSET_Y_ACTIVE`
- `ICON_COLOR_ACTIVE`
- `MAP_PINS_BASE_URI`
- `MARKER_COLOR_DEFAULT`
- `MARKER_COLOR_ACTIVE`
- `BASE_PIN_COLOR_DEFAULT`
- `BASE_PIN_COLOR_ACTIVE`
- `BASE_PIN_RING_COLOR_ACTIVE`
- `BASE_PIN_COLOR_OWN`
- `BASE_PIN_STROKE_COLOR_OWN`

## Notes

- Icons named `defaultPin`, `defaultPinActive`, `ownLocationPin` in `svg/` are skipped automatically.
- `.env` is optional; defaults are used if not present.
