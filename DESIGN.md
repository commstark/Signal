# Signal — Design

> Visual and interaction spec. Pair with `PROJECT_INSTRUCTIONS.md`. Direction: Cal.com structure with health personality. Quiet, precise, no gradients, no hype.

-----

## Principles

1. **Numbers are the hero.** Energy, protein, day count. Large, monospaced, unadorned.
1. **No gradients, no glass, no glow.** Solid fills only. Square corners or 4px radius max.
1. **One accent color.** Black on warm off-white in light mode. White on near-black in dark mode. One signal color (red) reserved for recording state.
1. **Dark mode default.** Late-night logging is common. Light mode available.
1. **Type, not chrome.** Hierarchy from typography, not from boxes, shadows, or dividers.
1. **No marketing voice.** No “Great job!” No “Keep it up!” Labels are nouns. Buttons are verbs. Done.

-----

## Color

### Light mode

|Token         |Value    |Use                             |
|--------------|---------|--------------------------------|
|`--bg`        |`#FAF8F5`|Page background (warm off-white)|
|`--surface`   |`#FFFFFF`|Cards, panels                   |
|`--ink`       |`#0A0A0A`|Primary text                    |
|`--ink-2`     |`#52525B`|Secondary text                  |
|`--ink-3`     |`#A1A1AA`|Tertiary / metadata             |
|`--line`      |`#E4E4E7`|Borders, dividers               |
|`--accent`    |`#0A0A0A`|Primary buttons (black)         |
|`--accent-fg` |`#FAFAFA`|Text on accent                  |
|`--signal-red`|`#DC2626`|Recording state only            |

### Dark mode (default)

|Token         |Value    |Use                    |
|--------------|---------|-----------------------|
|`--bg`        |`#0A0A0A`|Page background        |
|`--surface`   |`#161616`|Cards, panels          |
|`--ink`       |`#FAFAFA`|Primary text           |
|`--ink-2`     |`#A1A1AA`|Secondary text         |
|`--ink-3`     |`#52525B`|Tertiary / metadata    |
|`--line`      |`#262626`|Borders, dividers      |
|`--accent`    |`#FAFAFA`|Primary buttons (white)|
|`--accent-fg` |`#0A0A0A`|Text on accent         |
|`--signal-red`|`#EF4444`|Recording state only   |

### Forbidden

- Gradients of any kind
- Drop shadows beyond `0 1px 2px rgba(0,0,0,0.04)` for elevation
- Glow effects, neon, glassmorphism
- More than one accent color on screen at once
- Color-coded categories (“blue for protein, green for fiber”) — use labels

-----

## Typography

```
Sans: Inter (variable)
Mono: JetBrains Mono (for numbers, timestamps, code-like fields)
```

### Scale

|Token         |Size / Line|Weight  |Use                    |
|--------------|-----------|--------|-----------------------|
|`text-display`|56 / 60    |500     |Today’s headline number|
|`text-h1`     |32 / 38    |500     |Page title             |
|`text-h2`     |22 / 28    |500     |Section header         |
|`text-h3`     |17 / 24    |500     |Card title             |
|`text-body`   |15 / 22    |400     |Body                   |
|`text-small`  |13 / 18    |400     |Metadata, labels       |
|`text-micro`  |11 / 14    |500     |Tags, badges           |
|`text-num`    |varies     |500 mono|All numeric values     |

### Rules

- Headers use sentence case, never title case.
- No bold inside body text. Use it only for inline emphasis where structurally required.
- Numbers always monospaced. `132g protein`, not `132g protein`.
- Timestamps in mono, format `9:42a` or `9:42p`. No seconds. PST only.

-----

## Spacing

8-point grid. Use multiples of 4.

|Token     |Value|
|----------|-----|
|`space-1` |4px  |
|`space-2` |8px  |
|`space-3` |12px |
|`space-4` |16px |
|`space-5` |24px |
|`space-6` |32px |
|`space-8` |48px |
|`space-10`|64px |

Vertical rhythm between sections: 32-48px. Inside cards: 16-24px.

-----

## Layout

### Mobile (primary)

```
┌─────────────────────────┐
│ date · timezone         │  16px padding
├─────────────────────────┤
│                         │
│  Today                  │  section
│  ┌───────────────────┐  │
│  │  138g protein     │  │  card
│  │  18g fiber        │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │  energy   7.2 avg │  │
│  │  3 entries        │  │
│  └───────────────────┘  │
│                         │
│  Latest                 │
│  ...                    │
│                         │
└─────────────────────────┘
    [  ●  record  ]          fixed bottom, 80px clearance
```

- Single column, full width minus 16px gutter
- Sticky bottom record button, ~64px tall, black fill
- Pull to refresh on dashboard

### Desktop

```
┌──────────┬──────────────────────────┬─────────────────┐
│          │                          │                 │
│ Sidebar  │  Main                    │  Agent Panel    │
│  · Today │                          │  · Attia        │
│  · Week  │  Today                   │   ...           │
│  · Patterns                         │  ─────────────  │
│  · Agents│  [protein/fiber cards]  │  text input...  │
│  · Labs  │                          │                 │
│  · Logs  │  Latest                  │                 │
│          │  ...                     │                 │
│          │                          │                 │
└──────────┴──────────────────────────┴─────────────────┘
   240px         flexible                 380px
```

- Three-zone layout: sidebar / main / agent panel(s)
- Up to 3 agent panels stack from right
- Sidebar collapses to icon rail < 1024px

-----

## Components

### Record button (the most important component)

**Default state:**

- 64px tall, full width on mobile minus 16px gutter
- Black background (`--accent`), white text + white circle icon
- Text: `record`
- Square corners (4px radius)

**Pressed / recording state:**

- Background turns `--signal-red`
- Circle becomes pulsing square (stop icon)
- Text: `stop · 00:08` (mono timer)
- Subtle pulse animation on background (3% lightness shift, 1.2s loop). No glow.

**Auto-launch state (from back tap):**

- Page loads with button already pulsing yellow `#EAB308` for 1.5s before settling to red
- This signals “tap to confirm and start” — Safari requires one user gesture

### Cards

```
border: 1px solid var(--line)
border-radius: 4px
padding: 16px or 24px
background: var(--surface)
```

No drop shadow. No hover glow. On hover (desktop): border darkens one step.

### Buttons

|Variant  |Use                                                                     |
|---------|------------------------------------------------------------------------|
|Primary  |Black fill (light) / white fill (dark). Square corners.                 |
|Secondary|Border only, no fill.                                                   |
|Ghost    |No border, no fill, hover gets subtle background.                       |
|Danger   |`--signal-red` text on transparent. No filled red buttons except record.|

Height: 36px (default), 44px (large), 32px (small). Min tap target on mobile: 44px.

### Text input

- 1px border, no fill in light mode; `--surface` fill in dark
- 12px horizontal padding
- Cursor: text default
- Placeholder: `--ink-3`
- Focus: border becomes `--ink`, no glow

### Number display

Used everywhere numbers matter. Examples:

```
138g            ← text-display, mono
protein         ← text-small, --ink-2

7.2 avg         ← text-h1, mono
energy          ← text-small, --ink-2
3 entries       ← text-micro, --ink-3
```

Trend indicators (when applicable):

- `↑ 12` or `↓ 0.4` in `--ink-2`, mono, 13px
- No green/red coloring. The arrow does the work.

### Sparkline

- 1.5px stroke, `--ink` color
- 48px tall by available width
- No axis labels, no dots, no fill underneath
- Hover reveals data point in mono callout

### Tags / badges

- Background: `--surface` with 1px border
- 11px mono uppercase
- Used for: intervention status, confidence labels, expectation outcome (hit / miss / direction)

-----

## Screens

### Dashboard (`/`)

Sections in order:

1. **Header strip** — date · timezone · settings icon · `Ask AI` button (top-right)
1. **Today** — protein (headline), calories (secondary, with confidence tag), fiber, water — cards horizontal on desktop, stacked mobile
1. **Energy / mood** — single card with sparkline
1. **Active interventions** — list, 1-3 rows, day counter prominent
1. **Latest insights** — last 3 surfaced patterns, tap to expand
1. **Today’s log** — reverse chronological list of entries with timestamps; tap a transcript to edit
1. **Bottom: record button** — fixed

### Capture (`/capture`)

Minimal. Full screen, center the record button at 60% viewport height. Below it: live transcript appears while recording. Below transcript: parsed structured fields populate as Claude returns them.

Save happens automatically on `stop` — there is no autosave timer. Bottom: `edit transcript` (taps into an inline editor that re-fires the parse on save) and `discard`.

If offline at the moment of stop: the audio queues locally and a small `queued` chip appears in the corner. The service worker syncs when connectivity returns.

Top-left: small `×` to close. No other chrome.

### Workout (`/workout`)

Different posture — landscape-friendly, glanceable, big numbers. No wake word, no continuous listening — tap to record each set.

```
┌──────────────────────────────────────┐
│  bench press                         │
│                                      │
│  set 2 · 135 × 8                     │
│  set 1 · 135 × 8                     │
│                                      │
│  ────────────────────                │
│                                      │
│  last week top:  155 × 6             │
│  this session:   8 sets total        │
│                                      │
│              [  ●  next set  ]       │
└──────────────────────────────────────┘
```

Screen wake-lock active throughout the session.

### Ask AI sheet (modal, replaces agent panel)

Triggered by the `Ask AI` button on the dashboard, capture page, intervention detail, or bloodwork page. Slides up from the bottom on mobile, centered modal on desktop. Width: 480px desktop.

```
┌──────────────────────────────────┐
│ Ask AI                       ×   │
│                                  │
│ template                         │
│ [ general reflection         ▾ ] │
│                                  │
│ data scope                       │
│ [ last 7 days                ▾ ] │
│                                  │
│ your question (optional)         │
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ └──────────────────────────────┘ │
│                                  │
│ preview                          │
│ ┌──────────────────────────────┐ │
│ │ # My background              │ │
│ │ ...                          │ │
│ │ # Last 7 days                │ │
│ │ { ... }                      │ │
│ │ # Question                   │ │
│ │ What stands out?             │ │
│ └──────────────────────────────┘ │
│                                  │
│ [ copy ]  [ open in Claude ]     │
│           [ open in ChatGPT ]    │
└──────────────────────────────────┘
```

The preview is read-only but selectable. The data block is the live assembled JSON for the chosen scope. Templates: general reflection, intervention check, pre-bloodwork, workout question, free-form.

### Insights (`/insights`)

Two tabs: **Patterns** (weekly findings) and **Interventions** (active + completed). No nightly findings — patterns are weekly only.

Each pattern row:

```
finding text in body weight, one or two lines
data preview: small inline sparkline or fraction (3/7 days)
timestamp · "view data" link
```

### Bloodwork (`/bloodwork`)

Table of markers (rows) × draws (columns). Most recent on right. Trend arrow per row. Tap a marker to see full history sparkline and Claude’s commentary.

Upload button top-right. Drop a PDF, parse, confirm extracted values, save.

**Expectations row:** when a planned-draw date is set, a row appears under each marker showing the expected range plus a one-line rationale. After the actual draw, the row is tagged `hit` / `miss` / `direction`.

### Settings

Minimal list. No tabs, no nesting unless required.

- account · email (magic-link)
- timezone · units (lb default)
- notifications · per-type toggle, quiet hours
- data · export markdown / delete audio / wipe
- about · version

-----

## Interaction

### Recording

1. Back tap → Shortcut → opens `/capture?mode=auto`
1. Record button is already pulsing yellow
1. One tap → red, recording starts immediately
1. Audio waveform appears (basic, mono color, no visual flourish)
1. Tap stop → button greys out for ~1s (“transcribing…”)
1. Transcript appears in body text; auto-saves immediately
1. Structured fields populate below as parser returns them
1. Tap the transcript to edit; saving the edit re-fires the parse

### Ask AI sheet

- Slide-up animation on mobile, fade-in modal on desktop: 180ms ease-out
- Preview pane updates live as template / scope / question changes
- `copy` writes the assembled prompt to the clipboard; deep-link buttons open Claude.ai or chatgpt.com in a new tab with the prompt prefilled (clipboard fallback if prefill not supported by the target)

### Notifications

iOS PWA push. Format:

```
Signal
[finding text — one line, ~80 chars max]
```

No emojis. No exclamation marks. Tap to open the relevant insight.

-----

## Motion

Minimal. Purposeful only.

- Panel slide: 180ms ease-out
- Card hover: 100ms border color shift
- Recording pulse: 1.2s ease-in-out infinite, 3% lightness shift
- Transcribing dots: 400ms cycle
- Number tick-up on save (e.g., protein goes from 113 → 138): 400ms ease-out

No bounce. No spring. No particles. No confetti.

-----

## Icons

Lucide icons, 20px default, 1.5px stroke, `currentColor`. Inherit ink color from parent text.

Specific:

- Record: `Circle` (filled when recording)
- Stop: `Square` (filled)
- Ask AI: `Share2`
- Insight: `Sparkle` (the only sparkle allowed)
- Intervention: `FlaskConical`
- Bloodwork: `Activity`
- Workout: `Dumbbell`
- Settings: `Settings`

-----

## Empty states

No illustrations. No “Looks like you haven’t logged anything yet!” energy.

Format:

```
no entries today.
tap record to add one.
```

`--ink-2` color, body size, left-aligned. That’s it.

-----

## Error states

Same posture. Tell the user what failed and what to do. No apologies, no emoji.

```
transcription failed.
retry · discard
```

-----

## Accessibility

- Min contrast 4.5:1 for body text against background
- Min tap target 44×44 on mobile
- Focus rings: 2px solid `--ink`, 2px offset
- Honor `prefers-reduced-motion`: disable pulse, sparkline animation, panel slide (snap to position)
- All voice/audio features have text equivalents
- Keyboard nav: tab through cards and primary actions

-----

## What this design is not

- Not playful
- Not warm in a soft way
- Not “delightful”
- Not gamified
- Not therapeutic-app-shaped
- Not Apple Health
- Not Whoop

It’s a quiet instrument. The data is the point.
