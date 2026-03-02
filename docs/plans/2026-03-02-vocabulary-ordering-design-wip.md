# Vocabulary Ordering & Card Design (WIP)

> **Status:** Brainstorming in progress. Continue in next session.

## Decided

### Card Format: Cloze Deletion
- Show the **Spanish sentence** with one word replaced by `___`
- Show the **German translation of the missing word** as a hint
- Learner types the **Spanish word**
- No full German sentence translation shown — forces reading the Spanish context

Example:
```
Charlotte tiene un ___.
→ Hund

Answer: perro
```

### Word Ordering: Story-Sequential
- Words are presented in the order they appear in the story
- The learner progresses through the story sentence by sentence
- Each sentence becomes one or more cards

### Multi-Word Sentences: One Card Per Word
- When a sentence has multiple new words, show the same sentence multiple times
- Each card blanks a different word
- Order within a sentence: present words left-to-right as they appear

Example for "Charlotte tiene una maleta grande":
```
Card 1: Charlotte ___ una maleta grande.  → hat (haben)  → tiene
Card 2: Charlotte tiene una ___ grande.   → Koffer       → maleta
Card 3: Charlotte tiene una maleta ___.   → groß         → grande
```

## Still To Discuss

1. **Spaced repetition**: Should previously learned words ever be re-blanked in later sentences for review?
2. **Frequency vs. story order**: The pipeline has frequency_rank data — should high-frequency words be prioritized, or strictly follow story order?
3. **Pipeline export step**: Need a new module that takes ChapterWords + SentencePairs and produces an ordered list of cloze cards
4. **App card model**: Current VocabularyCard has front/back — needs to be extended for cloze format (sentence, blank_index, hint_word, answer)
5. **Skip logic**: Should function words (articles, pronouns) that the extractor already skips also be skipped for cards, or do some deserve cards?
6. **Chapter unlocking**: Should chapters unlock progressively, or all available at once?
