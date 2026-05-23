# GLB Unwrapper

C++ framework for reading GLB 2.0 assets and exporting printable UV templates without
using Blender as a runtime dependency.

This is the first production-oriented slice:

- read GLB container header and embedded glTF JSON/BIN chunks
- extract meshes, primitives, buffer views and accessors
- detect `POSITION`, `TEXCOORD_0` and index buffers
- export UV triangles to SVG for later artwork placement and print prepress

## Build

```bash
cmake -S microservices/glb-unwrapper -B microservices/glb-unwrapper/build
cmake --build microservices/glb-unwrapper/build --parallel
```

## Source layout

- `main.cpp` is only the executable entry point.
- `cli.*` parses commands and flags.
- `glb_reader.*` loads GLB chunks and maps glTF JSON into lightweight model structs.
- `accessor_reader.*` reads typed accessor data and mesh bounds.
- `uv_exporter.*` exports `TEXCOORD_0` triangles to SVG.
- `print_kit.*` writes the millimeter print template, spec JSON, and print README.
- `json.*`, `format.*`, and `error.hpp` contain small shared helpers.

## Inspect a model

```bash
microservices/glb-unwrapper/build/glb_unwrapper inspect frontend/src/assets/termos3.glb
```

## Export UV layout

```bash
microservices/glb-unwrapper/build/glb_unwrapper export-uv-svg \
  frontend/src/assets/termos3.glb \
  /tmp/termos3-uv.svg \
  --width 4096 \
  --height 4096 \
  --margin 64
```

Options:

- `--mesh <index-or-name>` limits export to one mesh.
- `--primitive <index>` limits export to one primitive inside selected meshes.
- `--no-flip-v` keeps glTF V orientation instead of SVG-friendly flipped V.
- `--stroke <css-color>` changes UV line color.
- `--fill <css-color>` fills UV triangles, default is `none`.

## Export a typography print kit

For production you normally do not give a typography a triangle UV mesh. Use a
clean millimeter template with named layers:

```bash
microservices/glb-unwrapper/build/glb_unwrapper export-print-kit \
  frontend/src/assets/termos3.glb \
  /tmp/termos-print-kit \
  --product thermos \
  --body-diameter-mm 70 \
  --body-height-mm 190 \
  --cap-diameter-mm 55 \
  --cap-side-height-mm 35 \
  --bleed-mm 3 \
  --safe-mm 3
```

For flat products use product-specific dimensions:

```bash
microservices/glb-unwrapper/build/glb_unwrapper export-print-kit \
  frontend/src/assets/tverdiy_pereplet.glb \
  /tmp/notebook-print-kit \
  --product notebook \
  --width-mm 145 \
  --height-mm 210 \
  --spine-thickness-mm 12

microservices/glb-unwrapper/build/glb_unwrapper export-print-kit \
  frontend/src/assets/poverbank.glb \
  /tmp/powerbank-print-kit \
  --product powerbank \
  --width-mm 95 \
  --height-mm 65 \
  --depth-mm 22
```

The command writes:

- `print-template.svg` with separate `ARTWORK`, `WHITE_UNDERBASE`,
  `VARNISH_OR_SPECIAL_FINISH`, `BLEED`, `SAFE_AREA`, `CUT_CONTOUR`, and
  `REGISTRATION_MARKS` layers.
- `print-spec.json` with machine-readable dimensions and prepress notes.
- `README-print.txt` with a short checklist for the print shop.

The SVG is a technical template in millimeters. Final artwork should still be
converted to CMYK/Pantone and exported as PDF/X by prepress software.

## Next framework layers

1. Add a physical calibration file per product so measured dimensions do not
   need to be passed as CLI flags.
2. Add an artwork compositor that places generated images/logos into each named
   print zone.
3. Add PDF/X export through a prepress library or a dedicated conversion worker.
4. Wrap the CLI behind a backend job endpoint so orders can generate print files.
