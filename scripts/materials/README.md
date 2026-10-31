# Textile sources

Unmodified 1K JPEG maps from Poly Haven, licensed under CC0:
https://polyhaven.com/license

- `velvet-normal.jpg`: https://polyhaven.com/a/velour_velvet — OpenGL normal map.
- `cotton-normal.jpg`: https://polyhaven.com/a/stretch_poplin — OpenGL normal map.
- `velvet-rough.jpg`, `cotton-rough.jpg`: the unmodified 1K roughness maps from
  the same two CC0 materials. The Hanna GLB embeds them with the normal maps.
- `hanna-ivory-velour-albedo-v2.jpg`: original warm ivory short-pile velour
  colour tile authored with ImageGen, packed as JPEG90. It covers 60 cm while
  the measured surface maps cover 30 cm, keeping the nap and weave in scale.
- `hanna-grey-quilt-albedo.jpg`: original grey cotton quilting colour map
  authored with ImageGen, packed as JPEG90. A second UV set follows the sewn
  cells while the measured normal/roughness retains its physical scale.
- `herringbone-normal.jpg`: https://polyhaven.com/a/poly_wool_herringbone — OpenGL normal map.
- `pillow-source.blend`, `pillow-normal.jpg`: https://polyhaven.com/a/throw_pillows_01
  by Serhii Khromov (CC0). The mesh is reoriented, resized, smoothed and posed
  for the bed; the original OpenGL normal map preserves the sculpted creases.

The herringbone colour pattern and subtle velvet colour variation are generated
by the model script. The velvet material also uses a soft fabric sheen.

Photography: colormass. Processing: Rico Cilliers. The build embeds these maps in
the self-contained GLB. No third-party asset requests occur in the browser.

Lighting: https://polyhaven.com/a/studio_small_09, by Sergej Majboroda (CC0).
Unmodified 1K HDR is served locally as `dist/assets/models/studio-small-09.hdr`.

Run `npm run build:bed` to regenerate the mesh and its baked contact occlusion.
The ordinary build reads the checked-in `bed-cloth.json.gz` geometry cache.
To change the draping, use Blender 4.5 LTS:

```text
blender --background --python scripts/simulate-bed-cloth.py
npm run build:bed
```

The Python script settles the duvet, turned edge and wool throw with cloth
collision, then simplifies the meshes for the web. Blender is an offline
authoring tool only. The final GLB loads on demand and stays under 10 MiB.
`bed-cloth.blend` is an optional ignored working scene; it is not deployed.
The model is an illustrative reconstruction from the supplied photograph, not
manufacturing CAD. The original product photograph remains the default view.

## Hanna lift model

`npm run build:hanna` builds the separate `hanna.glb` from original Hanna / Sensor
Flit shell, quilt, striped throw, slats and linkage geometry. It reuses the CC0
normal maps. `simulate-hanna-cloth.py` settles Hanna's quilt, turned edge and
striped linen against its mattress and upholstered frame in Blender 4.5. The
ordinary build reads the checked-in `hanna-cloth.json.gz` cache, so Blender is
not required for a web build. Unequal cloth slack, short compression gathers,
filled thickness and rounded hems are baked into those surfaces.
`hanna-pillows.mjs` builds the three fitted pillowcases with soft filling,
relaxed casing edges and irregular compression folds. Contact occlusion
is baked separately inside the fixed and moving groups, so their shadows do
not stay behind when the mechanism opens. The `Lift` clip is scrubbed by
the collection section's scroll position. Product reference URLs, confirmed
dimensions and photographic assumptions are in `hanna-sources.json`.
Hanna uses a neutral three-softbox HDR with neutral tone mapping and a fixed front camera
on +Z. Its closer fixed framing uses a little more distance on narrow screens
to retain the entire lifted silhouette. Violetta retains its original lighting
and interactive camera.
Regenerate Hanna's neutral HDR with `node scripts/build-hanna-lighting.mjs`.

Hanna's padded front faces contain interior vertices, allowing a shallow filled
upholstery crown without changing their outline. Bedding retains a visible
white mattress band below the shorter central quilt hem; its side drapes remain
free. Pillowcase folds are shallow and short rather than deep carved channels.

`hanna-cloth-finish.mjs` refines the checked-in gravity cache without changing
the lift rig: local soft quilt slack, a thin manifold turned edge and seated
striped linen. Its UV-paired fabric faces move together, preserving fold thickness
and the longer left drape. The original simulated cache stays unchanged.
White pillowcases have thin loose corner flaps and a gentle backward lean;
the small taupe case follows the actual curved white surfaces rather than a
global support plane. The fitted mattress face has subtle unequal tension folds.
Low fibre sheen is encoded in `sheenColor` itself because the GLTF exporter
does not preserve the separate Three.js sheen multiplier. Geometry/contact and
export regression tests run with `npm test`.
