# Reference study: moving beyond the first specimen

Date: 2026-11-02. The user rejected the first specimen's color, typography, and repeated rounded surfaces as generic. This study supports a new candidate direction; it does not imply approval of every new token.

## Method

Inspected live Oyenza, GitHub homepage, and PostHog pages at a 1280 × 800 viewport. Read computed fonts, weights, corner radii, and selected colors, and checked the associated primary design guidance. These measurements describe that page state, not an exhaustive design system or immutable brand specification.

## What the references actually do

### Oyenza

The landing page uses a system sans-serif stack, a white canvas, near-black text (#171717), and quiet gray surfaces (#F5F5F7). The main headline was approximately 92px at weight 600 with deliberate tight tracking. Primary actions were dark pills, while supporting surfaces used several distinct corner sizes. Its character supplies warmth without making the whole interface orange. Our first specimen copied the idea of a mascot but not this strong hierarchy and restraint.

Source: [Oyenza](https://oyenza.com/), computed styles inspected in the browser.

### GitHub

The current homepage uses Mona Sans and a white canvas. Its main headline was 56px at variable weight 440; examined sign-up/download controls had 6px corners. Product walkthroughs give the feature story concrete content. This is evidence that approachable branding can coexist with compact application geometry; it is not a reason to copy GitHub's exact typeface or colors.

Source: [GitHub homepage](https://github.com/home), computed styles inspected in the browser.

### PostHog

The current homepage renders RoundHog with differentiated heading sizes. Its primary guidance assigns distinct roles to typefaces, favors limited solid colors, and concentrates stronger color in illustration. A recognizable mascot is part of the system, rather than a justification for decorating every data surface. Its official brand rules are specific to PostHog; DFE uses original artwork and an independent palette.

Sources: [visual identity](https://posthog.com/handbook/brand/visual-identity), [brand foundations](https://posthog.com/handbook/brand/foundations), and the rendered [homepage](https://posthog.com/).

### Duolingo

Duolingo's published type guidance separates a short-headline face from longer-copy typography, and its shape-language article ties the interface and illustration system together. The transferable lesson is role consistency. A full gamified learning-app treatment would not fit an operational data workspace.

Sources: [typography](https://design.duolingo.com/identity/typography), [shape language](https://blog.duolingo.com/shape-language-duolingos-art-style/).

Additional online exploration included [Are.na](https://www.are.na/) and [Cosmos](https://www.cosmos.so/) for collection-oriented product explanation. They are research inputs, not additions to the user's approved reference list. Resend remains excluded.

## Diagnosis of the first DFE pass

The problem was cumulative: lavender everywhere, a large motivational welcome block inside a working dashboard, two lightly differentiated sans-serif families, similarly rounded panels, and vague friendly copy. Merely replacing purple with another accent would preserve that composition.

## Candidate direction: a personal workbench

Use white and cool-gray data surfaces, forest actions, and a small yellow bookmark/selection accent. Use IBM Plex Sans for a consistent functional voice, with weight and scale separating roles. Use 4–6px controls, 8px data panels, and 12px contextual notes. Leave run logs and supporting metadata more open instead of enclosing everything in interchangeable cards.

Lead with the collection and its records. Keep one small sloth note that explains a useful next action; put the full pose sheet in mascot documentation. Preserve real focus behavior, data freshness, and sample labeling.

Self-critique against the frontend-design skill: avoid turning this into a cream-and-serif stationery template, a dark neon dashboard, or a sharp newspaper grid. The intended distinction is working-set organization and meaningful density, with friendly illustration at specific moments. The next rendered specimen, rather than the token names, must demonstrate the change.
