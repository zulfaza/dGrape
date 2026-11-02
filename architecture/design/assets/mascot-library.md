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

### Lying pose layers — 2026-11-02

`public/brand/mascot/lying/` holds `body.png`, `hand.png`, `leg.png`, and `foot.png`: full 768×384 canvases cut from `lying.png` with Pillow, so they stack exactly. Each limb layer overlaps the body by about 6px at its joint, so no seam opens while it swings. The joints (pivots in the canvas) are the hand at (275, 296), the leg at (590, 296), and the foot at (634, 255). Recombined, the layers match `lying.png` except for 381 anti-aliased edge pixels in the overlaps. Regenerate the layers from `lying.png` if the pose changes.
