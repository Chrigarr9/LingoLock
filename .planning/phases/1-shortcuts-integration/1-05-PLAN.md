---
phase: 1-shortcuts-integration
plan: 05
type: execute
wave: 3
depends_on: [1-02, 1-04]
files_modified:
  - package.json
  - src/components/AnswerInput.tsx
  - src/utils/answerValidation.ts
  - app/challenge.tsx
  - src/components/VocabularyCard.tsx
autonomous: false

must_haves:
  truths:
    - "User can type answer in iOS-native text field"
    - "User can submit via return key or button press"
    - "System validates answer with fuzzy matching (case, diacritics, apostrophes, whitespace)"
    - "User sees correct answer immediately after wrong answer"
    - "User can continue to next card after answering"
  artifacts:
    - path: "src/utils/answerValidation.ts"
      provides: "Fuzzy matching logic"
      exports: ["validateAnswer"]
      min_lines: 40
    - path: "src/components/AnswerInput.tsx"
      provides: "iOS-native text input with submit handling"
      exports: ["AnswerInput"]
      min_lines: 60
    - path: "app/challenge.tsx"
      provides: "Complete answer flow (input -> validate -> show answer -> next)"
      contains: "validateAnswer"
  key_links:
    - from: "app/challenge.tsx"
      to: "src/utils/answerValidation.ts"
      via: "Import and call validateAnswer"
      pattern: "validateAnswer\\("
    - from: "src/components/AnswerInput.tsx"
      to: "TextInput"
      via: "React Native TextInput with iOS props"
      pattern: "returnKeyType.*done"
    - from: "src/utils/answerValidation.ts"
      to: "fuse.js"
      via: "Fuzzy matching library"
      pattern: "from 'fuse\\.js'"
---

<objective>
Implement answer input with fuzzy matching validation and feedback display.

Purpose: Enable users to answer vocabulary challenges with forgiving validation that ignores case, diacritics, apostrophes, and whitespace. This is core to the learning experience - users get immediate feedback and see correct answers.

Output: Working answer flow from input to validation to next card.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-CONTEXT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-RESEARCH.md
@/home/ubuntu/Projects/vokabeltrainer/app/challenge.tsx
@/home/ubuntu/Projects/vokabeltrainer/src/components/VocabularyCard.tsx
</context>

<tasks>

<task type="auto">
  <name>Install Fuse.js for fuzzy matching</name>
  <files>package.json</files>
  <action>
Install Fuse.js library for fuzzy string matching.

Run: `npm install fuse.js`

Also install TypeScript types if available:
Run: `npm install --save-dev @types/fuse.js` (if types exist, otherwise skip - Fuse.js v7 includes built-in types)

Fuse.js provides configurable fuzzy matching with threshold tuning (per RESEARCH.md Pattern 4).
  </action>
  <verify>
Run: `npm list fuse.js` to confirm installation
Check: package.json contains "fuse.js" in dependencies
  </verify>
  <done>
fuse.js appears in package.json dependencies and npm list confirms installation
  </done>
</task>

<task type="auto">
  <name>Create answer validation utility</name>
  <files>src/utils/answerValidation.ts</files>
  <action>
Create fuzzy matching function that validates user answers according to user requirements.

Create file: `src/utils/answerValidation.ts`

User requirements from CONTEXT.md:
- Ignore case (hola = Hola = HOLA)
- Ignore apostrophes (' vs ')
- Ignore diacritics/accents (e = é = è = ẽ)
- Trim whitespace

Implementation using Fuse.js (see RESEARCH.md Pattern 4):
```typescript
import Fuse from 'fuse.js';

/**
 * Normalize string: lowercase, remove diacritics, remove apostrophes, trim whitespace
 */
function normalize(str: string): string {
  return str
    .normalize('NFD')                      // Decompose accents (é -> e + combining accent)
    .replace(/[\u0300-\u036f]/g, '')      // Remove combining diacritical marks
    .replace(/['']/g, '')                  // Remove apostrophes (both ' and ')
    .toLowerCase()
    .trim();
}

/**
 * Validate user answer against correct answer with fuzzy matching
 *
 * @param userInput - User's answer (raw input)
 * @param correctAnswer - Correct answer from vocabulary card
 * @returns true if answer is correct (within threshold), false otherwise
 */
export function validateAnswer(userInput: string, correctAnswer: string): boolean {
  const normalizedInput = normalize(userInput);
  const normalizedCorrect = normalize(correctAnswer);

  // Exact match after normalization
  if (normalizedInput === normalizedCorrect) {
    return true;
  }

  // Fuzzy match using Fuse.js
  const fuse = new Fuse([normalizedCorrect], {
    threshold: 0.2,           // 0.0 = exact, 1.0 = match anything (0.2 allows small typos)
    ignoreLocation: true,     // Don't care where in string match occurs
    includeScore: true,
  });

  const result = fuse.search(normalizedInput);
  return result.length > 0;
}

/**
 * Get normalized version of string for debugging
 */
export function normalizeForDisplay(str: string): string {
  return normalize(str);
}
```

Threshold 0.2 allows minor typos while rejecting wildly incorrect answers. Can be tuned later based on user feedback.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify utility compiles
Create test cases:
  - validateAnswer('hola', 'Hola') === true (case)
  - validateAnswer("l'été", 'lete') === true (apostrophe + diacritic)
  - validateAnswer('café', 'cafe') === true (diacritic)
  - validateAnswer(' hello  ', 'hello') === true (whitespace)
  - validateAnswer('goodbye', 'hello') === false (wrong answer)
  </verify>
  <done>
src/utils/answerValidation.ts exists with validateAnswer function using Fuse.js, handles normalization correctly
  </done>
</task>

<task type="auto">
  <name>Create AnswerInput component</name>
  <files>src/components/AnswerInput.tsx</files>
  <action>
Create iOS-native text input component with return key submit and button submit.

Create file: `src/components/AnswerInput.tsx`

User requirements from CONTEXT.md:
- iOS native TextField (UITextField equivalent)
- Standard system appearance (follows light/dark mode)
- Both return key and button submit work
- Keyboard type: Default (consider language-specific later)

Implementation (see RESEARCH.md Pattern 5):
```typescript
import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, useColorScheme } from 'react-native';

interface AnswerInputProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AnswerInput({ onSubmit, disabled = false, placeholder = 'Your answer' }: AnswerInputProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmit(answer);
      setAnswer('');  // Clear input after submit
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={answer}
        onChangeText={setAnswer}
        placeholder={placeholder}
        placeholderTextColor={
          isDark
            ? 'rgba(235, 235, 245, 0.3)'  // iOS dark mode placeholder
            : 'rgba(60, 60, 67, 0.3)'     // iOS light mode placeholder
        }
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={true}
        returnKeyType="done"
        enablesReturnKeyAutomatically={true}  // iOS: disable return when empty
        onSubmitEditing={handleSubmit}
        editable={!disabled}
        style={[
          styles.input,
          {
            backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
            color: isDark ? '#ffffff' : '#000000',
          }
        ]}
      />
      <View style={styles.buttonContainer}>
        <Button
          title="Check Answer"
          onPress={handleSubmit}
          disabled={disabled || !answer.trim()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    fontSize: 17,          // iOS body text size
    fontFamily: 'System',  // SF Pro on iOS
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonContainer: {
    marginTop: 8,
  },
});
```

Auto-focus input so user can start typing immediately. Disable both input and button when answer is being shown.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify component compiles
Check: Component uses returnKeyType="done" and onSubmitEditing
Check: Component uses iOS placeholder colors
Check: Component uses System font and iOS text size (17)
Check: Input clears after submit
  </verify>
  <done>
src/components/AnswerInput.tsx exists with iOS-native styling, return key submit, button submit, and auto-focus
  </done>
</task>

<task type="auto">
  <name>Integrate answer validation into challenge screen</name>
  <files>app/challenge.tsx, src/components/VocabularyCard.tsx</files>
  <action>
Update challenge screen to use AnswerInput, validate answers, show feedback, and navigate to next card.

Modify `app/challenge.tsx`:

1. Import AnswerInput and validateAnswer
2. Add state for answer correctness
3. Handle answer submission
4. Show/hide input based on showAnswer state
5. Add "Next" button to move to next card

```typescript
import { AnswerInput } from '../src/components/AnswerInput';
import { validateAnswer } from '../src/utils/answerValidation';

// Inside component:
const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

const handleAnswerSubmit = (userAnswer: string) => {
  const correct = validateAnswer(userAnswer, currentCard.back);
  setIsCorrect(correct);
  setShowAnswer(true);
  console.log('[Challenge] Answer:', { userAnswer, correct, correctAnswer: currentCard.back });
};

const handleNext = () => {
  if (currentIndex < cards.length - 1) {
    setCurrentIndex(currentIndex + 1);
    setShowAnswer(false);
    setIsCorrect(null);
  } else {
    console.log('[Challenge] Completed all cards');
    // TODO (Plan 06): Navigate to continue button
  }
};

// In render:
{!showAnswer && (
  <AnswerInput onSubmit={handleAnswerSubmit} />
)}

{showAnswer && (
  <View style={styles.nextContainer}>
    <Button title="Next" onPress={handleNext} />
  </View>
)}
```

Modify `src/components/VocabularyCard.tsx`:
- Update to receive and display isCorrect prop (already has it from Plan 04)
- Show correct answer in green if correct, red if incorrect

User requirement: "Show correct answer immediately after wrong answer" - this is already implemented in VocabularyCard via showAnswer prop and isCorrect color.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify screen compiles
Check: Screen imports and uses AnswerInput
Check: Screen calls validateAnswer on submit
Check: Screen shows answer after submission
Check: Screen allows navigation to next card
Check: VocabularyCard displays correct/incorrect colors
  </verify>
  <done>
app/challenge.tsx integrates answer input, validates answers, shows correct/incorrect feedback, and allows navigation to next card
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Complete answer input and validation flow with fuzzy matching, feedback display, and card navigation.
  </what-built>
  <how-to-verify>
1. Build and run development build:
   ```
   npx expo run:ios
   ```

2. Trigger deep link:
   ```
   xcrun simctl openurl booted "lingolock://challenge?source=Test&count=5&type=unlock"
   ```

3. Test answer input:
   - [ ] Text field is auto-focused (keyboard appears immediately)
   - [ ] Typing updates input field
   - [ ] Placeholder shows "Your answer" in light gray

4. Test fuzzy matching with first card (front: "hello", back: "hola"):
   - Type "hola" and press return → Should show green "hola" (correct)
   - Start new challenge, type "Hola" (capital) → Should show green (case-insensitive)
   - Start new challenge, type "HOLA" → Should show green (case-insensitive)
   - Start new challenge, type "goodbye" → Should show red "adiós" (incorrect, shows correct answer)

5. Test with diacritics card (if exists, e.g., "café"):
   - Type "cafe" (no accent) → Should accept as correct
   - Type "café" (with accent) → Should accept as correct

6. Test submission methods:
   - Press return key on keyboard → Submits answer
   - Press "Check Answer" button → Submits answer
   - Button disabled when input empty

7. Test card navigation:
   - After answering, "Next" button appears
   - Press "Next" → Shows next card
   - Input field clears and refocuses

8. Test dark mode:
   - Toggle dark mode in Settings
   - [ ] Input background changes to dark gray (#1c1c1e)
   - [ ] Input text changes to white
   - [ ] Placeholder color adapts

9. Check console logs:
   - Should log each answer with correctness and correct answer

Expected: Smooth answer flow, forgiving fuzzy matching, immediate feedback, easy navigation to next card.
  </how-to-verify>
  <resume-signal>
Type "approved" if answer validation and flow work correctly, or describe issues (fuzzy matching too strict/loose, UI behavior, navigation).
  </resume-signal>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. Fuzzy matching: `cat src/utils/answerValidation.ts` exports validateAnswer with normalization
2. Input component: `cat src/components/AnswerInput.tsx` exports AnswerInput with iOS styling
3. Integration: `cat app/challenge.tsx` uses AnswerInput and validateAnswer
4. Dependencies: `npm list fuse.js` confirms Fuse.js installed
5. TypeScript compilation: `npx tsc --noEmit` passes
6. Functional verification (human checkpoint): Answer validation, fuzzy matching, feedback, navigation

**Human verification required** - Testing fuzzy matching accuracy and user experience flow.
</verification>

<success_criteria>
- Fuse.js installed for fuzzy string matching
- validateAnswer function handles normalization (case, diacritics, apostrophes, whitespace)
- AnswerInput component provides iOS-native text field with return key and button submit
- Challenge screen validates answers and shows immediate correct/incorrect feedback
- User can navigate to next card after answering
- Fuzzy matching threshold (0.2) accepts minor variations but rejects wrong answers
- Both submission methods work (return key and button)
- UI adapts to light and dark mode
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-05-SUMMARY.md`
</output>
