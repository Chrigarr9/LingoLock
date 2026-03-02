# Spanish Word Frequency Datasets - Research

**Research Date:** March 2, 2026
**Purpose:** Find commercially-usable Spanish word frequency data for vocabulary learning prioritization

---

## Summary

Multiple open-source Spanish word frequency datasets exist with commercial-friendly licenses. The best options are:

1. **FrequencyWords (OpenSubtitles)** - CC license, 50K+ words
2. **wordfreq** - Apache/CC-BY-SA 4.0, multi-source
3. **spanish_data (doozan)** - CC-BY-SA 3.0, lemmatized
4. **Spanish Gigaword (OpenSLR)** - CC-BY-SA 3.0, 22MB JSON

**Recommended for commercial use:** FrequencyWords or wordfreq for best licensing clarity and data quality.

---

## 1. FrequencyWords (OpenSubtitles Corpus)

**Repository:** https://github.com/hermitdave/FrequencyWords

### Details
- **Source Name:** FrequencyWords (Hermit Dave)
- **Data Source:** OpenSubtitles2018 corpus
- **License:** Code: MIT License | Data: Creative Commons (CC)
- **Commercial Use:** YES
- **Size:** 50,000+ words per language
- **Regional Variant:** Combined (OpenSubtitles includes both European and Latin American Spanish)
- **Format:** Text files (word + space + frequency count)
- **Download:** https://github.com/hermitdave/FrequencyWords

### Pros
- Clear permissive licensing (MIT for code, CC for data)
- Large dataset (50K+ words)
- Widely used by open-source projects (Wikipedia, input methods, keyboards)
- Based on real conversational language (movie/TV subtitles)
- Easy format to parse
- Multiple language support
- Active community usage

### Cons
- Subtitle language may be informal/colloquial
- Regional variant not explicitly separated (mixed European and Latin American)
- Word forms only (not lemmatized by default)
- May include slang, abbreviated text, or non-standard spelling from subtitles

---

## 2. wordfreq (Multi-Source Frequency Library)

**Repository:** https://github.com/rspeer/wordfreq

### Details
- **Source Name:** wordfreq (Robyn Speer)
- **Data Source:** Multiple sources (Wikipedia, news, books, web, subtitles)
- **License:** Apache License (code) + Creative Commons Attribution-ShareAlike 4.0 (data)
- **Commercial Use:** YES (with attribution)
- **Size:** Multi-tier frequency data for 40+ languages
- **Regional Variant:** Combined
- **Format:** Python library with API; exportable data
- **Download:** https://github.com/rspeer/wordfreq or via PyPI

### Pros
- Multiple data sources minimize outliers
- High-quality aggregated frequency data
- Permissive Apache license with clear attribution requirements
- Professional-grade resource used in NLP applications
- Supports both word forms and lemmas
- Active maintenance and documentation
- Balanced across different text types (formal and informal)

### Cons
- Requires Python or API integration (not just a flat file)
- CC-BY-SA 4.0 requires attribution and share-alike for derived data
- Multi-source approach may dilute regional specificity
- Project has been sunset (no longer actively maintained as of recent updates)

---

## 3. spanish_data (Wiktionary + Tatoeba)

**Repository:** https://github.com/doozan/spanish_data

### Details
- **Source Name:** spanish_data (Jeff Doozan)
- **Data Source:** Wiktionary + hermitdave/FrequencyWords
- **License:** CC-BY-SA 3.0
- **Commercial Use:** YES (with attribution and share-alike)
- **Size:** Most frequent Spanish lemmas (exact count not specified, but comprehensive)
- **Regional Variant:** Combined
- **Format:** CSV (frequency.csv: lemma, POS, word forms combined)
- **Download:** https://github.com/doozan/spanish_data/blob/master/frequency.csv

### Pros
- Clean CSV format, easy to integrate
- Lemmatized data (words grouped by base form)
- Includes part-of-speech information
- Maintained and regularly updated (latest release 2025-07-20)
- Based on reputable linguistic sources (Wiktionary)
- Also includes Spanish-English dictionary and sentence pairs

### Cons
- CC-BY-SA requires share-alike (any derived work must use same license)
- Derived from hermitdave data (similar to source #1)
- Size not clearly specified
- Lemmatization may miss some nuances for learners who need inflected forms

---

## 4. Spanish Gigaword (OpenSLR)

**Repository:** https://www.openslr.org/21/

### Details
- **Source Name:** OpenSLR Spanish Word List
- **Data Source:** LDC Spanish Gigaword Corpus (newswire text)
- **License:** Creative Commons Attribution-ShareAlike 3.0 Unported (CC-BY-SA 3.0)
- **Commercial Use:** YES (with attribution and share-alike)
- **Size:** Derived from 750M+ tokens, 2.7M documents
- **Regional Variant:** Multiple (Spain, Latin America) - includes AFP, AP, Xinhua sources
- **Format:** JSON (es_wordlist.json.tgz, 22MB compressed)
- **Download:** https://www.openslr.org/resources/21/es_wordlist.json.tgz

### Pros
- Large corpus base (750M+ tokens)
- Formal, professional language (newswire)
- Clear CC-BY-SA 3.0 license
- JSON format easy to parse
- Multiple regional sources (Spain, Latin America)
- Time range: 1993-2005 (relatively modern)

### Cons
- CC-BY-SA requires share-alike
- Formal news language may not reflect everyday vocabulary
- Slightly dated (1993-2005, though still modern Spanish)
- May skew toward political, economic, international news topics
- Original LDC corpus requires separate license (though derivative is open)

---

## 5. Spanish Billion Word Corpus and Embeddings (SBWCE)

**Repository:** https://crscardellino.github.io/SBWCE/

### Details
- **Source Name:** Spanish Billion Word Corpus and Embeddings
- **Data Source:** Various Spanish text sources
- **License:** Creative Commons Attribution-ShareAlike 4.0 International License
- **Commercial Use:** YES (with attribution and share-alike)
- **Size:** 1 billion+ words
- **Regional Variant:** Mixed
- **Format:** Various (corpus + word embeddings)
- **Download:** https://github.com/crscardellino/sbwce

### Pros
- Massive corpus (1B+ words)
- Includes word embeddings for semantic analysis
- CC-BY-SA 4.0 license
- Modern Spanish text
- Useful for advanced NLP applications

### Cons
- CC-BY-SA requires share-alike
- Primary focus on embeddings, not just frequency
- May require additional processing to extract frequency lists
- Resource-intensive to work with

---

## 6. Leipzig Corpora Collection

**Repository:** https://wortschatz.uni-leipzig.de/en/download/

### Details
- **Source Name:** Leipzig Corpora Collection - Spanish
- **Data Source:** Web crawls, news, Wikipedia
- **License:** **Downloaded corpora: CC-BY** | Web interface: CC-BY-NC
- **Commercial Use:** **UNCLEAR** - Downloaded files appear to be CC-BY (YES), but documentation mentions CC-BY-NC for web access (NO)
- **Size:** Various sizes (10K to 1M+ words)
- **Regional Variant:** Multiple regional variants available
- **Format:** Text files with word frequency
- **Download:** https://wortschatz.uni-leipzig.de/en/download/

### Pros
- Multiple size options (10K to 1M+)
- Regional variants explicitly separated
- Academic credibility (University of Leipzig)
- Standardized corpus sizes
- Multiple text sources

### Cons
- **License ambiguity** - Downloaded files listed as CC-BY but web documentation mentions CC-BY-NC
- **Commercial use requires explicit written permission** per some documentation
- **Recommendation:** Contact Leipzig directly to clarify commercial use terms
- May require attribution and compliance verification

---

## 7. Corpus del Español (Mark Davies)

**Repository:** https://www.corpusdelespanol.org/

### Details
- **Source Name:** Corpus del Español
- **Data Source:** 10 billion+ words across genres and time periods
- **License:** **Proprietary academic license**
- **Commercial Use:** **NO** - Academic licenses explicitly prohibit creating commercial products
- **Size:** 10B+ words; frequency dictionaries available
- **Regional Variant:** Multiple dialects (Spain, Latin America, historical)
- **Format:** Web interface + downloadable data (with license)
- **Download:** https://www.corpusdelespanol.org/resources.asp (license required)

### Pros
- Massive, comprehensive corpus (10B+ words)
- Dialect-specific data available
- Historical and genre variations
- Professional linguistic analysis
- Gold standard for Spanish corpus research

### Cons
- **NOT for commercial use** - Academic licenses explicitly prohibit commercial products
- Cannot include substantial frequency/rank data in derived works
- Cannot place on public networks/websites
- Requires license agreement
- Data restrictions on derivative works
- **Not suitable for commercial vocabulary app**

---

## 8. CREA (Corpus de Referencia del Español Actual)

**Repository:** Real Academia Española (RAE)

### Details
- **Source Name:** CREA - Corpus de Referencia del Español Actual
- **Data Source:** Spanish text corpus (books, news, transcripts)
- **License:** **Proprietary/Unclear**
- **Commercial Use:** **UNCLEAR** - No clear commercial licensing information found
- **Size:** 160M+ lexical forms
- **Regional Variant:** Mixed Spanish (1975-2004)
- **Format:** Web interface; downloadable lists exist but licensing unclear
- **Download:** https://www.rae.es/ (requires investigation)

### Pros
- Authoritative source (Real Academia Española)
- Comprehensive modern Spanish (1975-2004)
- Wide range of text types
- Linguistically curated

### Cons
- **No clear commercial license** found in research
- Dated (ends 2004)
- Would require direct contact with RAE for commercial use permission
- License terms not transparent online
- **Not recommended without explicit RAE permission**

---

## 9. Wiktionary Frequency Lists

**Repository:** https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Spanish

### Details
- **Source Name:** Wiktionary Spanish Frequency Lists
- **Data Source:** Various (compiled from multiple sources)
- **License:** CC-BY-SA (Wiktionary standard)
- **Commercial Use:** YES (with attribution and share-alike)
- **Size:** Varies by list
- **Regional Variant:** Mixed
- **Format:** Wiki pages (requires scraping or export)
- **Download:** https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Spanish

### Pros
- Community-curated
- CC-BY-SA license
- Multiple source lists compiled
- Free access

### Cons
- Not a single authoritative source
- Requires data extraction from wiki format
- Quality varies by contributor
- Share-alike license requirement
- Less structured than dedicated corpora

---

## License Comparison Table

| Source | License | Commercial Use | Share-Alike? | Attribution? |
|--------|---------|---------------|--------------|--------------|
| FrequencyWords | MIT (code) + CC (data) | YES | Likely | Yes |
| wordfreq | Apache + CC-BY-SA 4.0 | YES | YES | YES |
| spanish_data | CC-BY-SA 3.0 | YES | YES | YES |
| Spanish Gigaword (OpenSLR) | CC-BY-SA 3.0 | YES | YES | YES |
| SBWCE | CC-BY-SA 4.0 | YES | YES | YES |
| Leipzig Corpora | CC-BY / CC-BY-NC (unclear) | UNCLEAR | Possibly | YES |
| Corpus del Español | Proprietary Academic | NO | N/A | N/A |
| CREA | Unclear/Proprietary | UNCLEAR | Unknown | Unknown |
| Wiktionary | CC-BY-SA | YES | YES | YES |

---

## Recommendations

### Best for Commercial Vocabulary App

**Primary Choice: FrequencyWords (hermitdave)**
- Clear licensing (MIT + CC)
- Large dataset (50K+ words)
- Conversational language appropriate for learners
- Easy integration (simple text format)
- Proven track record in commercial applications

**Alternative: wordfreq**
- Multi-source data for quality
- Apache license is business-friendly
- Professional-grade resource
- Note: Project has been sunset, but existing data remains usable

### Implementation Strategy

1. **Start with FrequencyWords** - Download the Spanish frequency list from OpenSubtitles2018
2. **Supplement with spanish_data** - Add lemmatization and POS data for enhanced learning features
3. **Consider wordfreq** - Use as validation/cross-reference for frequency rankings
4. **Attribution compliance** - Include proper attribution in app credits and documentation

### Avoid for Commercial Use

- **Corpus del Español** - Explicitly prohibits commercial products
- **CREA** - No clear commercial license
- **Leipzig** - Requires clarification/permission for commercial use

---

## Data Integration Notes

### Format Conversion Needed

Most sources provide:
- Word + frequency count
- Some provide: lemma, POS tags, regional indicators

For vocabulary app, we need:
- Word (headword/lemma)
- Frequency rank (1 = most common)
- Optional: POS, difficulty level, regional variant

### Sample Processing Workflow

1. Download FrequencyWords Spanish list
2. Parse format: `word frequency_count`
3. Sort by frequency (descending)
4. Assign rank (1, 2, 3, ...)
5. Store in database with rank for prioritization
6. Cross-reference with spanish_data for lemmatization
7. Add POS tags and word forms

---

## Regional Variant Considerations

Most free datasets combine European Spanish (ES) and Latin American Spanish (LATAM):

- **OpenSubtitles** - Mixed (movies/TV from various regions)
- **Spanish Gigaword** - Multiple sources (Spain, Latin America)
- **Corpus del Español** - Has dialect separation but not commercially usable

**Recommendation:** Start with combined frequency data (most common words are universal), then add regional indicators in future versions if needed.

---

## Next Steps

1. Download FrequencyWords Spanish dataset
2. Download spanish_data frequency.csv
3. Create database schema for word frequency storage
4. Import and rank words
5. Implement vocabulary selection algorithm (prioritize high-frequency words)
6. Add proper attribution in app documentation
7. Consider caching strategy for 10K most common words

---

## Attribution Requirements

### FrequencyWords
```
Spanish word frequency data from FrequencyWords by Hermit Dave
Source: https://github.com/hermitdave/FrequencyWords
Based on OpenSubtitles2018 corpus
License: Creative Commons
```

### wordfreq
```
Spanish word frequency data from wordfreq by Robyn Speer
Source: https://github.com/rspeer/wordfreq
License: Apache License 2.0 (code) + CC-BY-SA 4.0 (data)
```

### spanish_data
```
Spanish frequency and lemma data from spanish_data by Jeff Doozan
Source: https://github.com/doozan/spanish_data
Based on Wiktionary and FrequencyWords
License: CC-BY-SA 3.0
```

---

## Sources

- [FrequencyWords GitHub Repository](https://github.com/hermitdave/FrequencyWords)
- [wordfreq GitHub Repository](https://github.com/rspeer/wordfreq)
- [spanish_data GitHub Repository](https://github.com/doozan/spanish_data)
- [OpenSLR Spanish Word List](https://www.openslr.org/21/)
- [Spanish Billion Word Corpus and Embeddings](https://crscardellino.github.io/SBWCE/)
- [Leipzig Corpora Collection](https://wortschatz.uni-leipzig.de/en/download/)
- [Corpus del Español](https://www.corpusdelespanol.org/)
- [Wiktionary Frequency Lists](https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Spanish)
- [OpenSubtitles Corpus](https://invokeit.wordpress.com/frequency-word-lists/)
- [Leipzig Corpora Collection Download](https://wortschatz.uni-leipzig.de/en/download/)

---

**Research completed:** March 2, 2026
**Researcher:** Claude (Anthropic)
