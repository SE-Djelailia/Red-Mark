# RedMark — The Architect's Red Pen

**Status:** proposed. Tokens are live in `src/styles/design-tokens.css`; two
example screens are restyled. Nothing else has been touched.

---

## The idea

A set of construction drawings is black ink on white paper — precise,
neutral, information-dense. The architect reviews it with **one red pen**.
Everything the red pen touches is, by definition, the thing that needs
attention.

Its authority comes entirely from its scarcity.

That is the whole system. The interface is the drawing: near-black on
off-white, ruled, aligned, quiet. **Red is the pen.**

This is not a metaphor applied to a UI. It is how the product already works
— an inspector marks deficiencies on a site — and the logo is already a red
X, the universal inspection notation.

---

## Where the system lives

**One file:** `src/styles/design-tokens.css`.

Tailwind 4 is configured CSS-first, so that `@theme` block *is* the config
— there is no `tailwind.config.js`. Every token registered there generates
its own utilities (`--color-ink` → `text-ink`, `bg-ink`, `border-ink`), so
components consume the system by using ordinary Tailwind classes. Changing
the red in one place changes it everywhere.

---

## 1. Colour

Two hues total: a neutral ramp and the red.

### Ground and ink

| Token | Value | Use |
|---|---|---|
| `canvas` | `#FCFCFC` | App background — *the sheet*. Paper, not screen-white. |
| `surface` | `#FFFFFF` | Cards, sheets. Raised above the sheet **by contrast, not shadow**. |
| `subtle` | `#F4F4F5` | Inset fills, hover, wells. |
| `ink` | `#141414` | Headings, primary text, the drawn line. |
| `body` | `#3F3F46` | Body copy. |
| `muted` | `#71717A` | Secondary text, metadata. |
| `faint` | `#A1A1AA` | Tertiary, placeholders, disabled. |
| `line` | `#E4E4E7` | 1px rules, dividers. |
| `line-strong` | `#D4D4D8` | Input borders, emphasised rules. |

**Never `#000000`.** Pure black on white vibrates and reads as cheap.
`#141414` is the density of a good drafting pen.

**Ground is `#FCFCFC`, not white.** This is what lets a white card read as
raised with no shadow at all.

### The red — `#E10600`

Taken from the logo mark. I verified it is identical in `Logo.tsx` and in
every public asset (icons, manifest, favicons) — one value, no drift.

`brand-strong` (`#B80500`) exists because `#E10600` **fails contrast on
white at small sizes**. Red text uses the darker value; red fills use the
true brand red.

### THE RED RULE (non-negotiable)

Red is permitted **only** for:

1. **The primary action of a screen** — at most ONE per view.
2. **Deficiency / alert / destructive** state.
3. **The active navigation position** — as a 2px rule, not a fill.
4. **The logo mark.**

Red is **forbidden** for:

- Decorative headings, icons, dividers, illustration.
- Secondary or tertiary buttons (those are ink outline, or ghost).
- Hover states on anything that is not already primary.
- Any surface larger than a button, a badge, or a 2px rule.
- More than one filled red element visible at rest in a viewport.

> **The test:** if you can see two red fills at once, one of them is wrong.

### Semantic colour is austere

`resolved` green (`#15803D`) appears **only** on a verified deficiency — the
one place the eye must tell "done" apart from "red pen". `warn` amber
(`#A16207`) appears **only** on *élevé* priority and overdue. Neither is
ever a fill larger than a badge.

**There is no blue in this system.** Blue currently appears 46 times in the
app; every instance is off-system and will be removed during rollout.

---

## 2. Typography

### The typeface

Inter, falling through to each platform's own grotesque — SF on Apple,
Segoe on Windows, Roboto on Android. All Helvetica-lineage: closed
apertures, even rhythm, no personality competing with the content.

A drawing's lettering is anonymous by design. So is this. **Zero webfont
cost** — nothing to download, nothing to block first paint, which matters
on a site network.

The discipline is not in the typeface. It is in the hierarchy.

### The five roles

| Role | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| **Display** | 28px | 600 | −0.02em | One per screen, at most. Often none. |
| **Heading** | 22px / 18px | 600 | −0.01em | Page title / section title. |
| **Body** | 16px | 400 | 0 | Prose, descriptions. |
| **Secondary** | 14px | 400/500 | 0 | Dense rows, UI text. |
| **Label** | 11px | 600 | **+0.08em**, UPPERCASE | Field names, table headers, eyebrows. |
| **Caption** | 12px | 400 | 0 | Metadata, timestamps. |

**Only these sizes exist.** Nothing in between.

Two rules that carry the discipline:

- **Weight does the work, never colour.** Hierarchy is 600 vs 400, ink vs
  muted. A heading is never red to make it feel important.
- **Small uppercase must be tracked.** `+0.08em` on 11px labels. Set solid,
  they are unreadable; tracked, they become the title-block voice.

Numbers that stack — counts, dates, dimensions, report numbers — use
`.rm-figures` (tabular numerals) so digits align vertically in a column.

---

## 3. Spacing & grid

**A strict 4px base.** Every gap, pad and margin is a multiple. No 5px, no
13px, no optical nudges.

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64`

Alignment is the point: things line up because they are on the same grid,
not because they were eyeballed. Tailwind's default spacing is already a
4px ramp, so `p-4` / `gap-6` land on this grid natively.

**44px minimum touch target**, non-negotiable — this is used on site, in
gloves, one-handed.

### Form

| Token | Value |
|---|---|
| `radius-sm` | 2px |
| `radius-md` | 3px |
| `radius-lg` | **4px — the ceiling** |
| `radius-full` | avatars and status dots **only** |

Sharp, not soft. A drawing has square corners. Rounded UI reads as
consumer-friendly, which is the opposite of the intent.

**Elevation is almost nil.** Depth comes from the rule and the
ground/surface contrast, not from shadow. A drawing is flat.

---

## 4. The RedMark move

The signature that repeats until it is recognisable.

### The rule — `.rm-rule` / `.rm-rule-active`

**A 2px vertical bar on the leading edge**: hairline ink at rest, red when
the thing is active, urgent, or primary.

It is the red pen's stroke in the margin. It reads at a glance, costs
almost no ink, scales from a nav item to a full card, and **never fills an
area** — which is exactly what keeps the red rule enforceable.

This replaces the tinted-background pattern used today. A red-tinted card
spends the whole colour budget on decoration; a 2px red edge spends almost
none and says the same thing louder.

### The title block — `.rm-label` + `.rm-hairline`

A hairline-ruled band with uppercase tracked labels above their values,
borrowed directly from a drawing sheet's title block. Used for page
headers and metadata groups.

---

## 5. Components

**Buttons.** Primary: red fill, white text, 4px radius, 44px tall — one per
screen. Secondary: ink 1px outline on surface. Tertiary: ghost, ink text
only. Destructive uses the same red fill as primary; they never appear
together.

**Cards.** White surface on the canvas ground, 1px `line` border, 4px
radius, no shadow. Active or urgent cards take the red leading rule.

**Inputs.** `line-strong` 1px border, 4px radius, 44px tall, `subtle`
inset fill. Focus: **ink** border plus a 2px ring — *not* red. Focus is
navigation, not alarm.

**Badges.** 20px tall, 2px radius, uppercase `.rm-label` type. Outline by
default; filled only for deficiency status.

**Headers.** Title block: hairline top rule, tracked uppercase eyebrow,
display or heading value beneath.

---

## What I would flag

The current app has **113 red backgrounds** and **46 blues**. Under this
system most of those reds become ink or outline treatments, and all of the
blues go. That is the substance of the rollout — and the reason to approve
the system on two screens first.
