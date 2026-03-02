# Spanish Content Pipeline - Charlotte's Story

**Status:** Planning Phase
**Created:** 2026-03-02
**Goal:** Eigenes Spanisch-Vokabelset mit fortlaufender Story generieren (kommerziell nutzbar)

---

## 🎯 Vision

**"Lerne Spanisch mit Charlotte"** - Eine fortlaufende Geschichte über Charlotte, die von Deutschland nach Argentinien zieht. User lernen Spanisch, indem sie Charlotte auf ihrer Reise begleiten.

**Kern-Features:**
- ✅ Eigenes, kuratiertes Vokabelset (Deutsch ↔ Spanisch)
- ✅ Fortlaufende Narrative (nicht random Beispielsätze)
- ✅ A1-A2 Niveau (einfache Grammatik, alltägliche Vokabeln)
- ✅ Kommerziell nutzbar (alle Daten verkaufbar)
- ✅ KI-generiert (kosteneffizient, skalierbar)
- ✅ Multi-Language-fähig (Pipeline für alle Sprachpaare)

---

## 📖 Story Outline: Charlotte's Abenteuer (Teil 1)

### Kapitel-Übersicht

**Thematischer Bogen:** Vorbereitung → Reise → Ankunft → Alltag → Freundschaften

| # | Kapitel | Thema | Vokabel-Fokus |
|---|---------|-------|---------------|
| 1 | Vorbereitung | Charlotte packt ihre Sachen | Kleidung, Reisevorbereitung |
| 2 | Zum Flughafen | Die Fahrt beginnt | Verkehr, Zeit, Emotionen |
| 3 | Am Flughafen | Check-in, Sicherheit | Flughafen-Vokabeln, Formalitäten |
| 4 | Im Flugzeug | Gespräch mit Sitznachbar | Small Talk, Reisen |
| 5 | Ankunft | Erste Eindrücke Buenos Aires | Stadt, Wetter, Gefühle |
| 6 | Essen gehen | Restaurant besuchen | Essen, Bestellen, Getränke |
| 7 | Bar & Musik | Abend in einer Bar | Musik, Socializing |
| 8 | Verabredung Sport | Neue Bekanntschaft | Sport, Aktivitäten |
| 9 | Stadt erkunden | Sportanlagen & Sehenswürdigkeiten | Orte, Bewegung |
| 10 | Über den Markt | Gemeinsam einkaufen | Lebensmittel, Markt |
| 11 | Freundschaft | Verbindung entwickelt sich | Freundschaft, Pläne |

**Geschätzte Wörter:** 400-600 einzigartige Wörter
**Coverage:** ~40-60% der Top 1000 häufigsten spanischen Wörter
**CEFR Level:** A1-A2

---

## 🔄 Workflow: Von Story zur Vokabel-Datenbank

### Phase 1: Story-Generierung (KI)

**Input:**
- Story Outline (Kapitel 1-11)
- Sprachniveau: A1-A2
- Zielsprache: Spanisch (neutral/argentinisch)
- Länge: 8-12 Sätze pro Kapitel

**Prompt-Template:**
```
Du bist ein Autor für Sprachlern-Geschichten.

Schreibe Kapitel [N]: "[Titel]"

Anforderungen:
- Spanisch (neutrales/argentinisches Spanisch)
- A1-A2 Niveau (einfache Wörter, einfache Grammatik)
- 8-12 kurze Sätze pro Kapitel
- Alltägliche Vokabeln
- Präsens + einfache Vergangenheit
- Keine komplexen Nebensätze
- Emotionale Verbindung zu Charlotte

Kontext: Charlotte ist eine junge Deutsche, die nach Buenos Aires zieht.
[Spezifischer Kontext für dieses Kapitel]
```

**Output:** Spanischer Text (pro Kapitel)

**Tool:** GPT-4o, Claude Sonnet, oder Llama 3.1
**Kosten:** ~$0.20 für alle 11 Kapitel

---

### Phase 2: Wort-für-Wort-Übersetzung (KI)

**Input:** Spanischer Story-Text

**Prompt-Template:**
```
Analysiere diesen spanischen Text Satz für Satz.

Für jeden Satz:
1. Gib eine deutsche Übersetzung
2. Liste JEDES spanische Wort mit deutscher Übersetzung
3. Wenn ein Wort mehrere Bedeutungen hat, gib die im KONTEXT richtige
4. Füge Part-of-Speech Tags hinzu
5. Gib die Grundform (Lemma/Infinitiv) an

Format als JSON:
{
  "sentences": [
    {
      "spanish": "...",
      "german": "...",
      "words": [
        {
          "spanish": "está",
          "german": "ist",
          "lemma": "estar",
          "pos": "verb",
          "context_note": "3. Person Singular Präsens"
        }
      ]
    }
  ]
}

Text:
[Kapitel-Text]
```

**Output:** JSON mit Satz-für-Satz Übersetzungen + Wort-Metadaten

**Tool:** GPT-4o (beste Qualität für strukturierte Outputs)
**Kosten:** ~$0.10 für alle 11 Kapitel

---

### Phase 3: Vokabel-Datenbank aufbauen

**Prozess:**
1. JSON-Output von Phase 2 parsen
2. Lemmas extrahieren (Grundformen)
3. Deduplizieren (jedes Wort nur einmal)
4. Beispielsätze sammeln (alle Vorkommen in Story)

**Datenstruktur:**
```json
{
  "vocabulary": [
    {
      "id": "estar",
      "spanish": "estar",
      "german": ["sein", "sich befinden"],
      "pos": "verb",
      "frequency_rank": 3,
      "cefr_level": "A1",
      "examples": [
        {
          "spanish": "Charlotte está en su habitación.",
          "german": "Charlotte ist in ihrem Zimmer.",
          "chapter": 1,
          "sentence_id": "1-2"
        },
        {
          "spanish": "Charlotte está nerviosa.",
          "german": "Charlotte ist nervös.",
          "chapter": 1,
          "sentence_id": "1-4"
        }
      ],
      "related_words": ["ser", "haber"],
      "multiple_choice_distractors": []
    }
  ]
}
```

**Tool:** Python Script
**Output:** `charlotte_vocabulary.json`

---

### Phase 4: Coverage-Check (Häufigkeitsdaten)

**Input:**
- `charlotte_vocabulary.json` (unsere Wörter)
- `spanish_frequency_top5000.json` (FrequencyWords MIT-licensed)

**Prozess:**
```python
# Coverage-Analyse
our_words = set(charlotte_vocab.keys())
top_words = set(frequency_data[:5000])

covered = our_words & top_words
missing = top_words - our_words

coverage_percentage = len(covered) / len(top_words) * 100

print(f"Coverage: {coverage_percentage:.1f}%")
print(f"Covered: {len(covered)} words")
print(f"Missing: {len(missing)} words")
print(f"Top 50 missing: {sorted(missing, key=lambda w: frequency_data[w])[:50]}")
```

**Erwartete Ergebnisse:**
- Nach Teil 1 (Kapitel 1-11): ~40-60% der Top 1000
- Nach Gap-Filling: ~80-90% der Top 1000
- Ziel: Top 3000 abdecken

**Tool:** Python Script
**Output:** `coverage_report.json`

---

### Phase 5: Gap-Filling (Fehlende Wörter einbauen)

**Input:**
- `coverage_report.json` (fehlende Wörter)
- Story so far

**Prompt-Template:**
```
Charlotte's Geschichte geht weiter.

Schreibe neue Szenen, die DIESE wichtigen Wörter nutzen:
[agua, comer, dormir, trabajar, casa, ...]

Szenen-Ideen:
- Charlotte findet eine Wohnung
- Charlotte geht einkaufen im Supermarkt
- Charlotte lernt Spanisch in einer Sprachschule
- Charlotte jobbt in einem Café
- Charlotte telefoniert mit Familie
- Charlotte erkundet Parks
- Charlotte kocht mit Freunden

Jede Szene: 6-10 Sätze, A1-A2 Niveau, natürlicher Fluss
```

**Iterativ:**
1. Generiere neue Szenen
2. Extrahiere Wörter
3. Coverage-Check
4. Repeat bis Ziel erreicht (z.B. 90% der Top 3000)

**Tool:** GPT-4o + Python Script
**Kosten:** ~$0.50 für Gap-Filling

---

### Phase 6: CEFR Leveling

**Methode:** Algorithmic Mapping (Häufigkeit → CEFR)

**Mapping-Regel:**
```python
def assign_cefr_level(frequency_rank):
    if frequency_rank <= 500:
        return "A1"
    elif frequency_rank <= 1500:
        return "A2"
    elif frequency_rank <= 3000:
        return "B1"
    elif frequency_rank <= 5000:
        return "B2"
    elif frequency_rank <= 8000:
        return "C1"
    else:
        return "C2"
```

**Verbesserung:**
- Manuelle Validierung mit ELELex Dataset
- Linguisten-Review (optional)

**Tool:** Python Script
**Output:** Vokabel-DB mit CEFR Tags

---

### Phase 7: Multiple Choice Relations

**Ziel:** Pro Wort 10 Ablenkungswörter für Multiple Choice

**Strategie:**

**Durchgang 1: Komplett unterschiedlich**
- Beispiel: "perro" (Hund) → Adjektive als Distraktoren
- "grande", "rojo", "feliz", "nuevo"

**Durchgang 2: Semantisch ähnlich**
- Beispiel: "perro" → Andere Tiere
- "gato", "caballo", "pájaro", "pez"

**Durchgang 3-4: Schwieriger**
- Ähnliche Schreibweise: "perro" → "pero", "cerro", "hierro"
- Verwandte Konzepte: "perro" → "mascota", "animal", "cachorro"

**KI-Prompt:**
```
Für das Wort "perro" (Hund), generiere 10 Ablenkungswörter:

1-2: Komplett andere Wortart (Adjektive/Verben)
3-5: Semantisch ähnlich (andere Tiere)
6-8: Ähnliche Schreibweise oder Klang
9-10: Verwandte Konzepte (mascota, animal)

Output als JSON:
{
  "word": "perro",
  "distractors": [
    {"word": "grande", "type": "different_pos", "difficulty": 1},
    {"word": "gato", "type": "semantic", "difficulty": 2},
    ...
  ]
}
```

**Tool:** GPT-4o
**Kosten:** ~$0.50 für 500 Wörter
**Output:** Vokabel-DB mit Multiple Choice Relations

---

### Phase 8: Export für LingoLock

**Format-Optionen:**

**Option A: JSON**
```json
{
  "deck_name": "Spanish with Charlotte - Part 1",
  "language_pair": "es-de",
  "cefr_level": "A1-A2",
  "total_words": 547,
  "story_chapters": 11,
  "vocabulary": [...],
  "story": [...]
}
```

**Option B: .apkg (Anki Package)**
- Konvertiere zu Anki-kompatiblem Format
- Nutze `genanki` Python Library
- Import über LingoLock's Anki-Import (Phase 3)

**Empfehlung:** JSON für Flexibilität, später .apkg Export

---

## 📊 Research Findings (Datenquellen)

### ✅ Kommerziell nutzbare Quellen

#### 1. Häufigkeitsdaten
- **FrequencyWords (OpenSubtitles)** - MIT License ✅
  - 50,000+ spanische Wörter
  - Konversationelles Spanisch
  - Klar kommerziell erlaubt

- **spanish_data by Jeff Doozan** - CC-BY-4.0 ✅
  - 50,000+ Wörter mit POS-Tags
  - Lemmatisiert
  - Attribution erforderlich

#### 2. Beispielsätze
- **Tatoeba Project** - CC-BY 2.0 ✅
  - 100k-500k Spanish-German Paare
  - Qualität: Mittel-Hoch
  - Attribution erforderlich
  - **Nutzung:** Coverage-Check, optionale Supplementierung

- **Europarl Corpus** - Public Domain ✅
  - Große Menge
  - Sehr formal (Politik)
  - Keine Attribution nötig

#### 3. CEFR Leveling
- **ELELex** - Akademisches Dataset ⚠️
  - ~13,000 Wörter (A1-C2)
  - Lizenz unklar (Anfrage nötig)

- **Algorithmic Mapping** - Eigenentwicklung ✅
  - Häufigkeit → CEFR Mapping
  - Keine Lizenz-Issues

### ⚠️ Problematische Quellen (NICHT nutzen)

#### Wörterbücher
- **Wiktionary** - CC BY-SA 3.0 ❌
  - ShareAlike = App muss Open Source sein
  - Nicht kommerziell in Closed-Source App nutzbar

- **FreeDict** - GPL v3 ❌
  - Copyleft-Lizenz
  - Source Code teilen erforderlich

**Lösung:** KI-generierte Übersetzungen nutzen (keine Lizenz-Issues)

---

## 💰 Kosten-Schätzung

### KI-Nutzung (GPT-4o)

| Phase | Tokens (ca.) | Kosten |
|-------|--------------|--------|
| Story-Generierung (11 Kapitel) | 10,000 | $0.15 |
| Wort-Übersetzungen | 8,000 | $0.12 |
| Gap-Filling (neue Szenen) | 15,000 | $0.23 |
| Multiple Choice Relations | 10,000 | $0.15 |
| **Total** | **43,000** | **~$0.65** |

**Alternative: Claude Haiku** - $0.25/1M tokens = noch günstiger (~$0.01 total)

### Datenquellen
- FrequencyWords: Kostenlos (MIT)
- spanish_data: Kostenlos (CC-BY)
- Tatoeba: Kostenlos (CC-BY)

### Gesamt-Kosten
**< $1 für komplettes Spanisch-Set (500-1000 Wörter + Story)** 🎉

---

## 🚀 Implementation Plan

### Milestone: "Spanish Content v1 - Charlotte's Story"

#### Phase 1: Setup & Data Collection
- [ ] FrequencyWords Spanisch runterladen
- [ ] spanish_data runterladen
- [ ] Tatoeba Spanish-German runterladen (optional)
- [ ] Python-Scripts Setup (virtual env, dependencies)

**Duration:** 1 hour

---

#### Phase 2: Story Generation
- [ ] Prompt Engineering für Kapitel 1-11
- [ ] KI-Generierung (iterativ, pro Kapitel)
- [ ] Story-Review (Qualität, Fluss, Grammatik)
- [ ] Story speichern als `charlotte_story_part1.txt`

**Duration:** 2-3 hours

---

#### Phase 3: Word Extraction & Translation
- [ ] KI-Prompt für Wort-für-Wort-Analyse
- [ ] JSON-Output parsen
- [ ] Vokabel-DB aufbauen (`charlotte_vocabulary.json`)
- [ ] Deduplizierung + Lemmatisierung

**Duration:** 2 hours

---

#### Phase 4: Coverage Analysis
- [ ] Python Script: Coverage-Check
- [ ] Report generieren
- [ ] Top 100 fehlende Wörter identifizieren

**Duration:** 1 hour

---

#### Phase 5: Gap-Filling
- [ ] Neue Szenen-Ideen entwickeln
- [ ] KI-Generierung für fehlende Wörter
- [ ] Iterativer Coverage-Check
- [ ] Story erweitern bis 80-90% Coverage

**Duration:** 3-4 hours

---

#### Phase 6: CEFR Leveling & Multiple Choice
- [ ] Häufigkeit → CEFR Mapping
- [ ] KI-Generierung für Distraktoren (10 pro Wort)
- [ ] Validierung (Qualität der Ablenkungswörter)

**Duration:** 2-3 hours

---

#### Phase 7: Export & Integration
- [ ] JSON Export finalisieren
- [ ] Optional: .apkg Export (Anki-kompatibel)
- [ ] Integration in LingoLock (Phase 3 des Haupt-Milestones)
- [ ] Testing in App

**Duration:** 2-3 hours

---

### **Total Duration:** 13-17 hours

---

## 🌍 Multi-Language Skalierung

### Pipeline ist sprachunabhängig!

**Für neue Sprachpaare:**
1. FrequencyWords für Zielsprache runterladen (50+ Sprachen verfügbar)
2. Story Outline anpassen (Charlotte in Paris? Tokyo? Madrid?)
3. KI-Prompt anpassen (Zielsprache ändern)
4. Pipeline laufen lassen

**Beispiele:**
- Deutsch → Französisch (Charlotte in Paris)
- Deutsch → Italienisch (Charlotte in Rom)
- Englisch → Spanisch (Charlotte from US to Mexico)
- Englisch → Japanisch (Charlotte in Tokyo)

**Kosten pro Sprachpaar:** < $1

---

## 🎯 Success Criteria

### Phase 1 (Prototyp) - Charlotte's Story Part 1
- [ ] 11 Kapitel generiert (A1-A2 Niveau)
- [ ] 400-600 einzigartige Wörter extrahiert
- [ ] 40-60% Coverage der Top 1000
- [ ] Alle Wörter mit deutschen Übersetzungen
- [ ] Beispielsätze aus Story verlinkt

### Phase 2 (Production-Ready)
- [ ] 80-90% Coverage der Top 3000
- [ ] CEFR Leveling für alle Wörter
- [ ] 10 Multiple Choice Distraktoren pro Wort
- [ ] Export als JSON + .apkg
- [ ] Integration in LingoLock App
- [ ] Kommerziell nutzbar (alle Lizenzen geklärt)

### Phase 3 (Multi-Language)
- [ ] Pipeline für 3+ Sprachpaare getestet
- [ ] Dokumentation für neue Sprachen
- [ ] Automatisierte Scripts

---

## 🔮 Future Enhancements

### Adaptive Story (Phase 4 - Advanced)
**Idee:** Story passt sich an User-Profil an

**Beispiel:**
- User beantwortet: "¿Cuál es tu hobby favorito?" → "Fútbol"
- Story generiert neue Szenen: Charlotte spielt Fußball mit Freunden
- Vokabeln: balón, equipo, gol, partido, etc.

**Technologie:**
- Real-time KI-Generierung
- User-Profil Tracking
- Dynamic Story Branching

**Status:** Future (nach V1 Launch)

---

## 📁 Repository Structure

```
spanish-content-pipeline/
├── PLANNING.md (dieses Dokument)
├── README.md
├── data/
│   ├── frequency/
│   │   ├── spanish_frequency_top5000.json
│   │   └── spanish_data_lemmatized.csv
│   ├── story/
│   │   ├── charlotte_story_part1_spanish.txt
│   │   └── charlotte_story_part1_german.txt
│   └── tatoeba/
│       └── spanish_german_pairs.tsv
├── scripts/
│   ├── 01_generate_story.py
│   ├── 02_extract_words.py
│   ├── 03_coverage_check.py
│   ├── 04_gap_filling.py
│   ├── 05_generate_distractors.py
│   └── 06_export.py
├── output/
│   ├── charlotte_vocabulary.json
│   ├── charlotte_deck.apkg
│   └── coverage_report.json
└── prompts/
    ├── story_generation.txt
    ├── word_translation.txt
    └── distractor_generation.txt
```

---

## 📝 Next Steps

### Immediate (Now)
1. ✅ Create planning document (this file)
2. ✅ Push to branch `feature/spanish-content-pipeline`
3. [ ] Set up Python environment
4. [ ] Download FrequencyWords data

### Short-term (This Week)
5. [ ] Generate Charlotte's Story Part 1 (Kapitel 1-11)
6. [ ] Extract vocabulary + translations
7. [ ] Coverage analysis
8. [ ] Decision: Build full pipeline or integrate into LingoLock first?

### Long-term (Next Month)
9. [ ] Complete gap-filling to 80-90% coverage
10. [ ] CEFR leveling + Multiple Choice relations
11. [ ] Export + LingoLock integration
12. [ ] Test multi-language pipeline

---

## 🤝 Team & Roles

**Content Creation:**
- KI (GPT-4o / Claude): Story generation, translations
- Human (Christian): Story outline, quality review

**Technical:**
- Python Scripts: Automation pipeline
- LingoLock App: Import & display

**Optional:**
- Linguist: CEFR validation, grammar review
- Native Speaker: Story authenticity check

---

## 📚 References

**Research Documents:**
- `research-spanish-content/01-dictionaries.md` - Wörterbuch-Quellen
- `research-spanish-content/02-frequency-data.md` - Häufigkeitsdaten
- `research-spanish-content/03-example-sentences.md` - Beispielsätze
- `research-spanish-content/04-cefr-leveling.md` - CEFR Datasets

**External Resources:**
- [FrequencyWords GitHub](https://github.com/hermitdave/FrequencyWords)
- [spanish_data by Jeff Doozan](https://github.com/doozan/spanish_data)
- [Tatoeba Project](https://tatoeba.org)
- [ELELex](http://www.um.es/elelex)

---

**Created:** 2026-03-02
**Last Updated:** 2026-03-02
**Version:** 1.0
**Status:** Planning Phase - Ready for Implementation
