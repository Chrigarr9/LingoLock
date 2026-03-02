# Phase 1 Context: Shortcuts Integration & Basic UI

**Created:** 2026-03-01
**Phase Goal:** User can trigger vocabulary challenges via iOS Shortcuts when unlocking device or opening apps

This document captures implementation decisions from user discussion. Downstream agents (researcher, planner) should treat these as fixed constraints.

---

## 1. Vocabulary Challenge Screen Design

**Layout Philosophy:**
- **Card-based presentation** (not full-bleed)
- **iOS-native aesthetic** (latest iOS design language)
- **Minimalist & modern** (clean, uncluttered)
- Should feel like a native iOS component

**Information Density:**
- **Essentials only** — No extra context on screen
- No streak counters, progress bars, or daily goals during challenge
- Focus exclusively on the vocabulary question/answer

**Visual Hierarchy:**
- **Vocabulary/question is the hero** — Largest element, centered
- Minimal chrome (no unnecessary headers, icons, or branding during challenge)

**Design Feel:**
- **Neutral, professional, modern**
- Not playful, not energetic — calm and efficient
- Follows iOS design conventions (SF Pro font, system colors, etc.)

---

## 2. Answer Input & Feedback

**Input Field:**
- **iOS native TextField** (UITextField equivalent in React Native)
- Standard system appearance (follows light/dark mode automatically)
- **Keyboard type:** Default, but consider language-specific later
- **Both submission methods work:**
  - Return key on keyboard submits answer
  - Explicit "Check Answer" button also submits

**Feedback Display:**
- **Card visualization approach** — Answer appears on the card itself after submission
- No separate overlay or modal
- Clean transition between question → answer state

**Answer Validation:**
- **Fuzzy matching enabled:**
  - Ignore case (hola = Hola = HOLA)
  - Ignore apostrophes (' vs ')
  - Ignore diacritics/accents (e = é = è = ẽ)
  - Trim whitespace
- **Show correct answer immediately** after wrong answer
- No retry attempts (see answer, move to next card)

---

## 3. Tutorial/Onboarding Experience

**Tutorial Format (Priority Order):**
1. **Preferred:** Deep link or iCloud Shortcut share link
   - If possible, tap button → auto-configure Shortcuts automation
   - Self-explanatory, minimal friction
2. **Fallback:** Step-by-step screenshots
   - If deep links don't work or aren't reliable
   - Each step = one screen with image + brief text

**Tutorial Placement (All Three):**
- **First launch:** Tutorial appears in onboarding flow
- **Skippable:** User can dismiss and explore app first
- **Always accessible:** Tutorial available in Settings anytime

**Tutorial Scope:**
- **Both automations in one tutorial:**
  - Device Unlock automation setup
  - App-Open automation setup
- Combined flow, not separate tutorials

---

## 4. Deep-Linking Flow & Navigation

**Post-Challenge Behavior:**
- After user answers correctly and sees answer:
  - **Show next vocabulary card** (user can continue learning)
  - **Display button:** "Continue to [Instagram]" or "Continue to Unlock"
  - Button deep-links to original source (app or home screen)
- User controls when to exit LingoLock

**Emergency Escape:**
- **Space bar pressed 3 times** = skip all remaining vocabs and deep-link immediately
- For urgent situations (emergency call, etc.)

**Unlock vs App-Open (Consistent):**
- **Always deep-link to source:**
  - Device Unlock → return to home screen
  - App-Open (e.g., Instagram) → deep-link to Instagram
- Same flow for both triggers

**Deep-Link Failure Handling:**
- **Stay in LingoLock** (don't silently fail)
- **Show error message:** "Can't open [App Name]"
- User can manually close app or try again

---

## Implementation Notes

**Placeholder Data (Phase 1):**
- Use hardcoded example vocabulary cards
- Simple JSON structure or inline array
- Real Anki import comes in Phase 3

**URL Scheme Parameters:**
- `lingolock://challenge?source={app_name}&count={number}&type={unlock|app_open}`
- Parse source to show in "Continue to [Source]" button
- Parse type to determine deep-link destination

**iOS Native Look:**
- Use iOS system components wherever possible
- Follow iOS Human Interface Guidelines
- Test in both light and dark mode

---

## Out of Scope (Deferred)

These ideas came up but belong in later phases:

- **Multiple input modes** (Multiple Choice, Yes/No) → Phase 2
- **Progress tracking UI** (Streak, success rate) → Phase 2
- **Real Anki deck import** → Phase 3
- **Spaced repetition scheduling** → Phase 2
- **Per-app customization** (number of cards) → Phase 5

---

**Next Steps:** Research → Planning → Execution
