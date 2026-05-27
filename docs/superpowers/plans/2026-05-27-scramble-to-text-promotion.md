# Scramble To Text Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote cards to free text after the first correct scramble review while keeping hint demotion from free text back to scramble.

**Architecture:** The challenge UI already asks `getAnswerType()` for the base mode and already demotes `text` to `scramble` through `demoteAnswerType()`. This change only lowers the free-text stability threshold in `src/services/fsrs.ts` and updates threshold tests.

**Tech Stack:** TypeScript, Jest, ts-fsrs.

---

## File Structure

- Modify: `src/services/fsrs.test.ts` to encode the new boundary: `1.9` remains scramble and `2.0` becomes text.
- Modify: `src/services/fsrs.ts` to lower the free-text threshold from `2.5` to `2.0` and update comments/progress labels.

### Task 1: Update Answer-Type Threshold

**Files:**
- Modify: `src/services/fsrs.test.ts`
- Modify: `src/services/fsrs.ts`

- [ ] **Step 1: Write the failing test**

In `src/services/fsrs.test.ts`, replace the `2.4` and `2.5` boundary tests with:

```ts
  it('returns scramble when stability is 1.9', () => {
    expect(getAnswerType(makeState(1.9))).toBe('scramble');
  });

  it('returns text when stability is exactly 2.0', () => {
    expect(getAnswerType(makeState(2.0))).toBe('text');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/fsrs.test.ts --runInBand`

Expected: FAIL because `getAnswerType(makeState(2.0))` still returns `scramble` before implementation.

- [ ] **Step 3: Write minimal implementation**

In `src/services/fsrs.ts`, update the comments and threshold:

```ts
 *   - stability 1.0–1.99 → scramble (letter rearrangement, guided recall)
 *   - stability >= 2.0 → text (free recall)
```

```ts
  if (cardState.stability >= 2.0) return 'text';
```

Also update `getCardProgressLevel()` comments and boundary so `2.0` aligns with free text:

```ts
 *   2 = early recall (stability 1.0–1.99)                 → scramble
 *   3 = building recall (stability 2.0–10)                → text (full hints)
```

```ts
  if (stability < 2.0) return 2;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/fsrs.test.ts --runInBand`

Expected: PASS with all `getAnswerType` tests passing.

- [ ] **Step 5: Do not commit unless requested**

Leave the working tree changes uncommitted unless the user explicitly asks for a commit.

## Self-Review

- Spec coverage: the plan updates the threshold, tests, comments, and preserves existing hint demotion by not changing `demoteAnswerType()`.
- Placeholder scan: no placeholders remain.
- Type consistency: all referenced functions and paths already exist.
