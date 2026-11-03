# DFE mascot concepts

Date: 2026-11-02.
Provider: OpenAI, built-in GPT image generation through Codex.
Account: ZUL Codex, as specified by the task. The tool does not expose account identity or the image model version.
Reference: `/home/zul/Code/Personal/dGrape/public/brand/sloth-concept.png`.

These PNG files are concept sheets for future image generation. The simple artwork remains subject to curation. The model sheet is not a rigged asset or a vector character.

## Model reference

Output: `public/brand/mascot-reference.png`.
Original: `/home/zul/.codex/generated_images/01a19b7a-c1cf-71e0-8cf8-f3bea89e1782/exec-e03f06ff-65f6-4383-9861-bc0786229fe8.png`.

Exact prompt:

```text
Use case: stylized-concept. Create an original DFE sloth concept sheet using the attached image as character reference. Preserve its rounded bean body, warm brown fills, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded arms, legs and cream claws. Simplify to pure flat 2D graphic shapes with clean dark brown outlines. Solid colors only. No texture, fur detail, shading, gradients, 3D, gloss, pouch or jewelry. White background, ample white space. No text, labels, logos or watermark. Keep every figure fully in frame and separate. Consistent character proportions. Show exactly three views in one horizontal row: front T-pose with both arms horizontal, side view, and back view. No props. This is a concept reference sheet for future image generation.
```

## Action poses

Output: `public/brand/mascot-poses.png`.
Original: `/home/zul/.codex/generated_images/01a19b7a-c1cf-71e0-8cf8-f3bea89e1782/exec-88e8e0d1-86d8-4fb4-94db-f21ec8514ed1.png`.

Exact prompt:

```text
Use case: stylized-concept. Create an original DFE sloth concept sheet using the attached image as character reference. Preserve its rounded bean body, warm brown fills, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded arms, legs and cream claws. Simplify to pure flat 2D graphic shapes with clean dark brown outlines. Solid colors only. No texture, fur detail, shading, gradients, 3D, gloss, pouch or jewelry. White background, ample white space. No text, labels, logos or watermark. Keep every figure fully in frame and separate. Consistent character proportions. Show exactly six separate full-body poses in a spacious 3 by 2 grid: friendly wave; thinking; typing at a minimal laptop; presenting a chart board; small success with raised arms; relaxed seated rest. Keep props minimal, using forest green #315847 and yellow #E6BD5B. Chart has simple shapes only, no text. This is an action concept sheet for future image generation.
```

Both outputs were copied from the generated files. The original files were kept. No image editing or API fallback was used.

## Transparent background update — 2026-11-02

The built-in OpenAI image tool edited each sheet with `transparent_background: true`. The current asset paths contain these transparent versions. All original generated files remain intact.

Model reference source: `/home/zul/.codex/generated_images/01a19b7a-c1cf-71e0-8cf8-f3bea89e1782/exec-73c4a5f9-5ed2-4adb-8106-050a399acfbf.png`.
Action poses source: `/home/zul/.codex/generated_images/01a19b7a-c1cf-71e0-8cf8-f3bea89e1782/exec-fefb2527-bb03-4205-b889-d8ae38c79098.png`.

Each edit used its previous local output as the reference image. Exact prompt for both edits:

```text
Remove only the white background from this concept sheet and make it truly transparent with an alpha channel. Preserve all sloths, props, cream face and belly fills, colors, outlines, poses, layout and full framing. Remove white areas between figures and inside empty gaps. Keep cream artwork and chart board opaque. No new elements, text, shadows or checkerboard pattern.
```

## Individual transparent poses — 2026-11-02

Provider: OpenAI, built-in GPT image generation through Codex.
Reference: `/home/zul/Code/Personal/dGrape/public/brand/mascot-reference.png`.

Originals were preserved. Outputs were resized with Pillow LANCZOS, centered on a square transparent canvas, and alpha values 0–3 and 250–255 normalized to 0 and 255 respectively.

### Wave

Output: `public/brand/mascot/wave.png`.
Original: `/home/zul/.codex-t3/eka/generated_images/01a19c63-e428-7823-b0f5-0531f63fd687/exec-21f40241-695b-40cd-87dc-f4e9ca3d578b.png`.

Exact prompt:

```text
Create one full-body DFE sloth mascot matching the attached model sheet: rounded bean body, warm brown, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded limbs with cream claws. Pure flat 2D solid colors, clean dark brown outlines. No texture, shading, gradients, 3D, gloss, glow, halo, shadow, pouch or jewelry. Centered, fully in frame, even padding, truly transparent background. No text, letters, numbers, labels, logos or watermark. Props only forest green #315847 and yellow #E6BD5B and cream. Standing, friendly wave with one raised arm.
```

### Laptop

Output: `public/brand/mascot/laptop.png`.
Original: `/home/zul/.codex-t3/eka/generated_images/01a19c63-e428-7823-b0f5-0531f63fd687/exec-2283e828-f7cb-434c-bcf5-232f57908568.png`.

Exact prompt:

```text
Create one full-body DFE sloth mascot matching the attached model sheet: rounded bean body, warm brown, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded limbs with cream claws. Pure flat 2D solid colors, clean dark brown outlines. No texture, shading, gradients, 3D, gloss, glow, halo, shadow, pouch or jewelry. Centered, fully in frame, even padding, truly transparent background. No text, letters, numbers, labels, logos or watermark. Props only forest green #315847 and yellow #E6BD5B and cream. Seated typing at a minimal forest-green laptop with a small yellow dot.
```

### Chart

Output: `public/brand/mascot/chart.png`.
Original: `/home/zul/.codex-t3/eka/generated_images/01a19c63-e428-7823-b0f5-0531f63fd687/exec-20b24961-9fb0-4cd0-8bcf-ba549c166d77.png`.

Exact prompt:

```text
Create one full-body DFE sloth mascot matching the attached model sheet: rounded bean body, warm brown, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded limbs with cream claws. Pure flat 2D solid colors, clean dark brown outlines. No texture, shading, gradients, 3D, gloss, glow, halo, shadow, pouch or jewelry. Centered, fully in frame, even padding, truly transparent background. No text, letters, numbers, labels, logos or watermark. Props only forest green #315847 and yellow #E6BD5B and cream. Standing beside a small cream board with simple yellow bars and a green and yellow pie, pointing at it.
```

### Celebrate

Output: `public/brand/mascot/celebrate.png`.
Original: `/home/zul/.codex-t3/eka/generated_images/01a19c63-e428-7823-b0f5-0531f63fd687/exec-6485e198-7185-4764-88e1-af417a1b61c3.png`.

Exact prompt:

```text
Create one full-body DFE sloth mascot matching the attached model sheet: rounded bean body, warm brown, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded limbs with cream claws. Pure flat 2D solid colors, clean dark brown outlines. No texture, shading, gradients, 3D, gloss, glow, halo, shadow, pouch or jewelry. Centered, fully in frame, even padding, truly transparent background. No text, letters, numbers, labels, logos or watermark. Props only forest green #315847 and yellow #E6BD5B and cream. Standing in small success pose, both arms raised, exactly two tiny yellow spark strokes.
```

### Thinking

Output: `public/brand/mascot/thinking.png`.
Original: `/home/zul/.codex-t3/eka/generated_images/01a19c63-e428-7823-b0f5-0531f63fd687/exec-92499b85-22ee-4903-9017-ab1980ffd449.png`.

Exact prompt:

```text
Create one full-body DFE sloth mascot matching the attached model sheet: rounded bean body, warm brown, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded limbs with cream claws. Pure flat 2D solid colors, clean dark brown outlines. No texture, shading, gradients, 3D, gloss, glow, halo, shadow, pouch or jewelry. Centered, fully in frame, even padding, truly transparent background. No text, letters, numbers, labels, logos or watermark. Props only forest green #315847 and yellow #E6BD5B and cream. Standing with one hand at chin, curious calm look.
```

### Lying pose — 2026-11-02

Output: `public/brand/mascot/lying.png`.
Original: `/home/zul/.codex-t3/eka/generated_images/01a19c76-e338-7762-b7f0-df5b9a534e9c/exec-425ae02b-73f5-42c2-af1d-436a66b35f8b.png`.

Exact prompt:

```text
Create one full-body DFE sloth mascot matching the attached model sheet and wave pose reference: rounded bean body, warm brown, cream heart-shaped face and belly, dark brown eye masks, tiny open eyes, nose and smile, rounded limbs with cream claws. Match the existing set's colors, proportions, face and outline weight. Pure flat 2D solid colors, clean dark brown outlines. No texture, shading, gradients, 3D, gloss, glow, halo, shadow, pouch or jewelry. Centered, fully in frame, even padding, truly transparent background. No text, letters, numbers, labels, logos or watermark. No props or surface. The sloth lies relaxed on its belly along an invisible flat horizontal surface, front three-quarter view, body horizontal, chin resting on crossed forearms, content calm smile with eyes open. One leg and the claws of one arm dangle slightly below the body's flat-ish straight horizontal bottom line, as if draped over an edge. Wide composition.
```

### Lying pose layers — 2026-11-02 (replaced)

The first hero loop cut `lying.png` into body, hand, leg, and foot layers and swung them with CSS. The drawn sprite frames below replace it; the layer files are removed.

### Lying sprite frames — 2026-11-02

Two built-in GPT image generations were attempted with true transparency, using `/home/zul/Code/Personal/dGrape/public/brand/mascot/lying.png` as the pose reference and `/home/zul/Code/Personal/dGrape/public/brand/mascot-reference.png` as the model reference. Neither was accepted for slicing: head and face proportions drift, neighboring figures touch, and the requested limb positions are not consistently represented. No frame alignment or sprite outputs were produced.

Originals:

- `/home/zul/.codex-t3/eka/generated_images/01a19caa-f913-7e51-95d9-aac2fc10ed91/exec-d55667d9-e9e2-499a-a222-972a92710218.png`
- `/home/zul/.codex-t3/eka/generated_images/01a19caa-f913-7e51-95d9-aac2fc10ed91/exec-711aadb9-e7bd-4ff5-b1b3-5c835779bc38.png`

Exact first prompt:

```text
Create one horizontal animation sprite strip of exactly six evenly spaced complete DFE sloths on a truly transparent background. Image 1 is the exact lying pose; image 2 is the character model. All six cells must have identical head, face, body position, size, and horizontal belly line. Only limbs move. In order: 1 rest like image 1; 2 dangling front hand swings forward and up, claws spread waving; 3 hand down, dangling leg kicks right and up; 4 leg under, back foot lifts toes up; 5 hand swings back and dangling leg left; 6 hand slightly raised toward rest. Keep chin on crossed forearms and body lying on an invisible edge. Pure flat 2D solid colors, clean dark brown outlines, matching reference. No texture, shading, gradients, glow, halo, shadow, text, props, surface, borders or checkerboard. Six separate cells, same scale and belly height.
```

Exact second prompt:

```text
Produce one horizontal strip of six separate animation frames, no borders, on true transparent alpha. Reference 1 is the exact lying pose; reference 2 is the character model. Preserve the head, face, body, belly height, and scale exactly unchanged in every cell. Preserve chin resting on crossed forearms. Only alter dangling limbs: frame 1 rest; frame 2 dangling hand up waving; frame 3 dangling leg kicks right and up; frame 4 back foot lifts toes up; frame 5 hand back and leg left; frame 6 hand slightly raised. Each complete sloth has ample transparent space around it, no overlap between cells. No motion lines. Solid flat 2D colors and clean dark brown outlines. No texture, shading, gradients, glow, halo, shadow, text, props, surface or checkerboard.
```

The second strip (`exec-d55667d9-…`) is used. Its heads and faces are consistent; the two problems reported above were fixed in post-processing with `scripts/build-sloth-sprite.py` (Pillow only):

- Frames are separated as connected shapes of the alpha mask, not by fixed cells, so touching neighbours do not mix. Loose parts (the wave lines) join the nearest figure.
- Each frame is aligned on the head: a template of frame 1's head (left 3–40% of its width, top 62%) is matched against each frame by mask overlap. Match scores were 96–100% of a perfect match; shifts in pixels of the strip: (0, 0), (−36, −2) (the waving hand widens frame 2), (5, −2), (2, −1), (6, −1), (4, −1).
- The aligned union is fitted into 768×384 frames (scale 1.607). The forearms rest at about y = 300 in every frame, matching `lying.png`, so the hero layout is unchanged.

Output: `public/brand/mascot/lying-frames/sprite.webp`, six 768×384 frames in one 4608×384 sheet, WebP quality 88 with lossless alpha (216 KB; the PNG sheet was 1 MB). The torso drifts slightly between frames, as hand-drawn frames do; the head does not move.

### Landing direction change — 2026-11-02

The animated hero sloth did not look smooth: drawn frames crossfade with a slight body wobble, and several motions overlapped. The user kept the hero with a simple animation and moved the other landing sections to a PostHog-like direction (product first, few still mascots). The hero now shows `lying.png` as one still drawing that settles once and breathes slowly. The sprite (`public/brand/mascot/lying-frames/`) and `scripts/build-sloth-sprite.py` were removed; restore them from git history if needed.


### Closing sloth wave — 2026-11-03

Output: `public/brand/mascot/wave-layers.png` (1774×887, transparent PNG).
Tool: built-in imagegen. Reference: `public/brand/mascot/wave.png`.

The two square cells hold the body and raised arm. CSS turns the arm from −12° to 18° over 4.8 seconds, with a rest between waves. It pauses outside the viewport. Reduced motion uses the original drawing.

Exact prompt:

```text
Use case: identity-preserve. Asset type: transparent two-cell sprite atlas for a smooth waving animation. Edit target: attached DFE standing sloth. Produce one wide 2:1 image with TWO equal SQUARE cells side by side, no border. Each cell has the exact same 512x512 coordinate canvas as the reference. LEFT CELL: keep the complete standing sloth exactly like the reference, face, hair, body, belly, feet, right lowered arm, colors and outline unchanged; remove ONLY the raised left arm and hand at x60..195 y160..285. Leave a natural short rounded shoulder root at x175 y255 for the separate arm to overlap. RIGHT CELL: ONLY that removed raised left arm and hand with its cream claws, at its ORIGINAL coordinate position x60..195 y160..285 inside this square cell. Keep its exact scale, bend and angle; add a slightly longer rounded brown root at x175 y255 for overlap. No sloth body or face in the right cell. Keep the rest of each cell fully transparent. Preserve the reference's gentle smile, large head, warm brown shapes, pale cream face and belly, dark brown eye patches and outlines. Match its drawing exactly. No labels, text, grid, checkerboard, scenery, shadows, motion lines, or extra limbs. Do not center or enlarge the detached arm inside its cell.
```

### Lying limb sprites — 2026-11-03

Output: `public/brand/mascot/lying-layers.png` (1774×887, transparent PNG).
Tool: built-in imagegen. Reference: `public/brand/mascot/lying.png`.

The atlas has four equal cells: body, hand, leg, and rear foot. CSS clips each cell and overlaps the limb roots. The hand moves from −10° to 14°; the leg moves from −16° to 12°. The loop takes 5.2 seconds and has a rest between turns. The head stays still. Reduced motion uses the original drawing. No image slicing or frame blending is needed.

Exact prompt:

```text
Use case: identity-preserve. Asset type: transparent layered sprite atlas for smooth CSS limb animation. Edit target: attached exact DFE lying sloth. Produce a wide 2:1 transparent image, a precise 2-column by 2-row atlas with four equal 2:1 cells. Each cell is the SAME 768x384 coordinate canvas as the reference; preserve the reference pixel placement, size, face and colors. TOP LEFT CELL: stationary sloth body/head, keep the face and resting left forearm exactly as reference; REMOVE only the dangling front hand/forearm at x245..445 y215..335, dangling hindleg at x530..635 y210..370, and far-right horizontal rear foot at x615..720 y210..300. Fill missing limb roots naturally with brown body/belly so no holes; leave rounded stubs under the head and on rump for overlay joints. TOP RIGHT CELL: ONLY the removed dangling front hand and forearm, matching reference shape and cream claws, at its ORIGINAL coordinate position x245..445 y215..335 in this cell; extend a rounded shoulder root slightly for overlap. BOTTOM LEFT CELL: ONLY the removed long hanging hindleg with cream claws, at its ORIGINAL coordinate position x530..635 y210..370; extend a rounded hip root slightly for overlap. BOTTOM RIGHT CELL: ONLY the horizontal rear foot with cream claws at its ORIGINAL coordinate position x615..720 y210..300, rounded root for overlap. All other areas genuinely transparent. Exact same scale and alignment in all four cells, generous transparent padding, no contact between cells. Keep same warm brown fills, cream face and claws, dark brown outlines and friendly exact face, simple flat illustration. No labels, grid lines, checkerboard, shadows, extra sloths, extra limbs, motion lines, text or scenery. Do NOT draw a full sloth in the limb-only cells.
```
