# Spanish Content Pipeline 🇪🇸

> **Lerne Spanisch mit Charlotte** - KI-generierte Vokabeldatenbank mit fortlaufender Story

[![Status](https://img.shields.io/badge/status-planning-yellow)]()
[![License](https://img.shields.io/badge/license-proprietary-red)]()
[![Language](https://img.shields.io/badge/language-es--de-blue)]()

---

## 📖 Übersicht

Dieses Projekt erstellt ein eigenes Spanisch-Vokabelset für LingoLock mit:

- ✅ **Fortlaufende Story** - Charlotte's Abenteuer in Argentinien
- ✅ **KI-generiert** - Kosteneffizient & skalierbar
- ✅ **A1-A2 Niveau** - Perfekt für Anfänger
- ✅ **Kommerziell nutzbar** - Alle Rechte bei uns
- ✅ **Multi-Language-fähig** - Pipeline für alle Sprachpaare

---

## 🎯 Ziel

**Von Story zu Vokabel-Datenbank:**

```
Charlotte's Geschichte → KI-Analyse → Vokabeln extrahieren →
Coverage-Check → Gap-Filling → Export → LingoLock App
```

**Ergebnis:**
- 500-1000 Vokabeln mit Übersetzungen
- Beispielsätze aus zusammenhängender Story
- CEFR-Leveling (A1-C2)
- Multiple Choice Relations (10 Distraktoren pro Wort)
- 80-90% Coverage der Top 3000 häufigsten spanischen Wörter

---

## 📚 Dokumente

- **[PLANNING.md](./PLANNING.md)** - Vollständige Planung, Workflow, Kosten
- **Research/** - Datenquellen-Recherche (4 Berichte)

---

## 🚀 Quick Start

### 1. Setup

```bash
# Virtual Environment
python3 -m venv venv
source venv/bin/activate

# Dependencies
pip install openai anthropic requests pandas
```

### 2. Daten runterladen

```bash
# FrequencyWords (MIT License)
wget https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt

# spanish_data (CC-BY 4.0)
wget https://github.com/doozan/spanish_data/raw/main/spanish.csv
```

### 3. Story generieren

```bash
python scripts/01_generate_story.py --chapters 1-11 --output data/story/
```

### 4. Vokabeln extrahieren

```bash
python scripts/02_extract_words.py --input data/story/ --output output/vocabulary.json
```

### 5. Coverage-Check

```bash
python scripts/03_coverage_check.py --vocab output/vocabulary.json --frequency data/frequency/
```

---

## 📁 Struktur

```
spanish-content-pipeline/
├── PLANNING.md          # Vollständige Planung
├── README.md            # Dieses Dokument
├── data/                # Rohdaten (Frequency, Tatoeba, etc.)
├── scripts/             # Python-Scripts für Pipeline
├── output/              # Generierte Vokabel-DBs
├── prompts/             # KI-Prompts
└── research-spanish-content/  # Recherche-Berichte
```

---

## 💰 Kosten

**Gesamtkosten für 500-1000 Wörter:** < $1

- Story-Generierung: $0.15
- Wort-Übersetzungen: $0.12
- Gap-Filling: $0.23
- Multiple Choice: $0.15

**Datenquellen:** Alle kostenlos (MIT, CC-BY, Public Domain)

---

## 🌍 Multi-Language Support

Pipeline funktioniert für **alle Sprachpaare**:

- Deutsch ↔ Spanisch (aktuell)
- Deutsch ↔ Französisch
- Deutsch ↔ Italienisch
- Englisch ↔ Spanisch
- Englisch ↔ Japanisch
- ... und 50+ weitere Sprachen

**Kosten pro Sprache:** < $1

---

## 📊 Status

### ✅ Completed
- Research (Datenquellen, Lizenzen)
- Planning (Story Outline, Workflow)
- Branch Setup

### 🚧 In Progress
- Python Scripts Setup
- Story-Generierung Prototyp

### ⏳ Planned
- Coverage-Check Implementierung
- Gap-Filling
- CEFR Leveling
- Multiple Choice Relations
- Export zu LingoLock

---

## 🤝 Contributing

Dieses Projekt ist proprietär. Alle Rechte vorbehalten.

---

## 📝 License

**Proprietary** - Alle Rechte bei Christian

**Verwendete Open-Source-Daten:**
- FrequencyWords - MIT License (Attribution erforderlich)
- spanish_data - CC-BY 4.0 (Attribution erforderlich)
- Tatoeba - CC-BY 2.0 (Attribution erforderlich)

---

## 📧 Contact

Christian - Vokabeltrainer-Projekt

---

**Created:** 2026-03-02
**Version:** 1.0
**Status:** Planning Phase
