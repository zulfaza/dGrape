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
