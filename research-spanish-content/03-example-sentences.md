# Research Report: Spanish Example Sentences with German Translations

**Research Date:** 2026-03-02
**Purpose:** Identify commercially usable sentence databases/corpora for vocabulary learning app
**Language Pair:** Spanish ↔ German

---

## Executive Summary

This report evaluates parallel corpus sources for Spanish-German sentence pairs suitable for commercial use in a vocabulary learning application. Key findings:

- **Best for Commercial Use:** Tatoeba Project (CC-BY), Europarl (public domain), ParaCrawl (CC0)
- **Avoid:** JW300 (copyright restrictions), TED Talks (NC license)
- **Largest Collections:** OpenSubtitles (billions of sentences), OPUS aggregator
- **Quality vs. Quantity Tradeoff:** Formal corpora (Europarl) vs. conversational (OpenSubtitles)

---

## 1. Tatoeba Project

### Overview
Open collaborative database of example sentences with translations in 400+ languages, specifically designed for language learners.

### License
- **Primary License:** CC-BY 2.0 FR (Creative Commons Attribution)
- **Alternative:** CC0 available for some sentences
- **Commercial Use:** **YES** (with attribution required)
- **Important Note:** Audio recordings may have additional restrictions (CC-BY, CC-BY-SA, CC-BY-NC, or no license)

### Size & Statistics
- **Total Corpus:** 12.6+ million sentences across 426 languages (as of Feb 2025)
- **Spanish Sentences:** ~338,781 (2021 data)
- **German Sentences:** ~553,727 (2021 data)
- **Language Pairs with 10k+ translations:** 276 pairs
- **Spanish-German Specific:** Exact count not published, but both are well-represented languages

### Quality Assessment
- **Pros:**
  - Designed specifically for language learners
  - Community-reviewed sentences
  - Natural, modern language
  - Short to medium sentence length (ideal for learning)
  - Native speaker contributions
  - Multiple translations per sentence available

- **Cons:**
  - Quality varies by contributor
  - Some sentences may be unusual or overly simple
  - Not professionally curated
  - Translation quality inconsistent

### Data Access
- **Download:** https://tatoeba.org/en/downloads
- **Format:** CSV, TSV (tab-delimited)
- **Mirror:** https://www.manythings.org/anki/ (good for Anki-style apps)
- **API:** Available via Hugging Face Datasets
- **Pre-aligned Pairs:** https://www.manythings.org/bilingual/

### Difficulty Tagging
- **No built-in CEFR tagging**
- Would require custom implementation or third-party analysis

### Commercial Viability
**Rating: EXCELLENT**
- Clear CC-BY license allows commercial use
- Must provide attribution to Tatoeba contributors
- Text content freely usable (check audio separately)
- Learner-focused design aligns with app goals

### Recommended Action
**Strong candidate for primary sentence source.** Download, filter by quality metrics, and add attribution.

**Sources:**
- [Tatoeba: Collection of sentences and translations](https://tatoeba.org/en/)
- [Tatoeba Downloads](https://tatoeba.org/en/downloads)
- [Tatoeba Terms of Use](https://tatoeba.org/en/terms_of_use)
- [Bilingual Sentence Pairs from Tatoeba](https://www.manythings.org/bilingual/)

---

## 2. OpenSubtitles Parallel Corpus (via OPUS)

### Overview
Massive collection of subtitle translations from movies and TV shows, automatically aligned at sentence level.

### License
- **License Status:** UNCLEAR for commercial use
- **OPUS Statement:** "We do not own any of the text from which the data has been extracted. We only offer files that we believe we are free to redistribute."
- **Requirement:** Must add link to http://www.opensubtitles.org/ in website and publications
- **Commercial Use:** **UNCLEAR** (no explicit permission stated)

### Size & Statistics
- **Total OPUS Collection:** 59.9+ billion sentence pairs across 1,005 languages
- **OpenSubtitles Subset:** 2.6 billion sentences across 60 languages, 1,689 bitexts
- **Spanish-German Specific:** Not published separately, but both languages well-represented
- **One of the largest parallel corpora available**

### Quality Assessment
- **Pros:**
  - Enormous dataset
  - Natural, conversational language
  - Modern colloquialisms and idioms
  - Real-world usage patterns
  - Automatic OCR error correction applied
  - Quality scoring for subtitle pairs

- **Cons:**
  - Translation quality highly variable
  - May contain slang, profanity, cultural references
  - Not curated for learners
  - Sentence fragments common
  - Context-dependent translations
  - Copyright uncertainties

### Data Access
- **Download:** http://opus.nlpl.eu/OpenSubtitles.php
- **Format:** TMX, Moses, TSV
- **Tools:** OpusTools package for processing
- **API:** Available via Hugging Face Datasets (Helsinki-NLP/open_subtitles)
- **Processing:** Requires filtering and cleaning

### Difficulty Tagging
- **No CEFR tagging**
- Difficulty highly variable (from simple to complex)

### Commercial Viability
**Rating: RISKY**
- No explicit commercial license
- Copyright ownership unclear
- Original subtitle copyrights may apply
- Could face legal challenges
- Requires legal review before commercial use

### Recommended Action
**Use with caution.** Consider for supplementary data only after legal consultation. The unclear licensing makes this unsuitable as primary source for commercial app.

**Sources:**
- [OPUS - Corpora](https://opus.nlpl.eu/)
- [OpenSubtitles parallel corpora | Sketch Engine](https://www.sketchengine.eu/opensubtitles-parallel-corpora/)
- [OPUS parallel corpora](https://www.sketchengine.eu/opus-parallel-corpora/)

---

## 3. Europarl Corpus

### Overview
Parallel corpus extracted from European Parliament proceedings, covering 21 European languages including Spanish and German.

### License
- **License:** Public domain / No known copyright restrictions
- **Source:** EU parliamentary proceedings
- **Alternative Version:** EuroParl-UdS has CC-BY-NC-SA 4.0 (non-commercial)
- **Commercial Use:** **YES** (original Europarl corpus)

### Size & Statistics
- **Languages:** 21 European languages
- **Spanish-English:** Large collection available
- **German-English:** Large collection available
- **Direct Spanish-German:** May require triangulation through English or custom alignment
- **Domain:** Political, legislative, formal speech

### Quality Assessment
- **Pros:**
  - Professional translations
  - High-quality, formal language
  - Consistent terminology
  - Public domain
  - Well-structured data
  - Extensively used in MT research

- **Cons:**
  - Very formal register (not conversational)
  - Political/legislative domain-specific
  - Not ideal for everyday vocabulary
  - Sentences often long and complex
  - Not designed for language learners
  - May require pivot through English

### Data Access
- **Download:** http://www.statmt.org/europarl/
- **Format:** Source release with sentence aligner, parallel corpora files
- **Alternative:** EuroParl-UdS in XML format
- **Tools:** Sentence aligner included
- **Processing:** Some alignment work may be needed

### Difficulty Tagging
- **No CEFR tagging**
- Generally B2-C2 level due to complexity and formal register

### Commercial Viability
**Rating: GOOD**
- Clear public domain status (original Europarl)
- Legally safe for commercial use
- No attribution required
- Suitable for formal/business Spanish

### Recommended Action
**Good supplementary source** for formal vocabulary and complex sentences. Not ideal as primary source due to formal register, but valuable for advanced learners (B2+).

**Important:** Verify you're using the original Europarl corpus (public domain), not EuroParl-UdS version (CC-BY-NC-SA).

**Sources:**
- [Europarl Parallel Corpus](https://www.statmt.org/europarl/)
- [Europarl - Wikipedia](https://en.wikipedia.org/wiki/Europarl_Corpus)
- [EuroParl-UdS Corpus](https://fedora.clarin-d.uni-saarland.de/europarl-uds/)

---

## 4. TED Talks Transcripts

### Overview
Parallel corpus of TED and TEDx talk transcripts with crowd-sourced translations in 100+ languages.

### License
- **License:** CC-BY-NC-ND (Creative Commons Non-Commercial, No Derivatives)
- **Commercial Use:** **NO** (non-commercial restriction)
- **Attribution Required:** YES

### Size & Statistics
- **Languages:** 109 world languages
- **Spanish:** Included with translations
- **German:** Included with translations
- **Multilingual TEDx Corpus:** 8 languages (Spanish, German included)
- **Format:** Aligned transcripts

### Quality Assessment
- **Pros:**
  - High-quality professional transcriptions
  - Educated, articulate speakers
  - Interesting, engaging content
  - Modern language
  - Well-aligned translations
  - Inspirational topics

- **Cons:**
  - NC license prohibits commercial use
  - Often complex, academic language
  - Long sentences
  - Specialized vocabulary
  - Not designed for learners
  - No derivatives allowed

### Data Access
- **Download:** OpenSLR (openslr.org/100) for Multilingual TEDx
- **Format:** Transcripts with alignment
- **GitHub:** Various TED corpus repositories
- **Hugging Face:** IWSLT ted_talks_iwslt dataset

### Difficulty Tagging
- **No CEFR tagging**
- Generally B2-C2 level (academic/professional discourse)

### Commercial Viability
**Rating: UNSUITABLE**
- NC (Non-Commercial) clause explicitly prohibits commercial use
- Cannot be used in paid vocabulary learning app
- ND (No Derivatives) also restricts adaptation

### Recommended Action
**Do not use for commercial app.** The NC license is a dealbreaker despite high content quality.

**Sources:**
- [Multilingual TEDx Corpus - OpenSLR](https://www.openslr.org/100)
- [TED Multilingual Parallel Corpus - GitHub](https://github.com/ajinkyakulkarni14/TED-Multilingual-Parallel-Corpus)
- [IWSLT TED talks - Hugging Face](https://huggingface.co/datasets/IWSLT/ted_talks_iwslt)

---

## 5. TRIS Corpus (Technical Regulations Information System)

### Overview
Specialized parallel corpus of technical regulations from the European Commission, German-Spanish aligned.

### License
- **License:** Available through CLARIN repository
- **Commercial Use:** **LIKELY YES** (academic repository, but verify terms)

### Size & Statistics
- **Version 0.3:** 229 files, 76,500+ sentences
- **Word Count:** ~1.76 million words
- **Domains:** Construction, Agriculture, Domestic Equipment
- **Alignment:** Sentence-aligned

### Quality Assessment
- **Pros:**
  - Professional translations
  - High-quality alignment
  - Specialized domains
  - Consistent terminology
  - Well-structured (TMX, TEI formats)

- **Cons:**
  - Very technical domain
  - Limited to regulatory language
  - Small corpus size
  - Not suitable for everyday vocabulary
  - Specialized terminology only

### Data Access
- **Download:** CLARIN repository (repo.clarino.uib.no)
- **Format:** TMX, TEI (XML-based)
- **Versions:** 0.1, 0.2, 0.3 available

### Difficulty Tagging
- **No CEFR tagging**
- C1-C2 level (highly technical)

### Commercial Viability
**Rating: MODERATE**
- Academic repository suggests permissive use
- Should verify specific license terms
- Too specialized for general learning app

### Recommended Action
**Skip for general vocabulary app.** Only consider if targeting professional/technical Spanish learners in specific domains.

**Sources:**
- [TRIS Corpus v0.3 - CLARIN](https://repo.clarino.uib.no/xmlui/handle/11509/79)
- [TRIS Corpus - Språkbanken](https://www.nb.no/sprakbanken/en/resource-catalogue/oai-repo-clarino-uib-no-11509-79/)
- [Design and compilation of specialized Spanish-German parallel corpus - ACL](https://aclanthology.org/L12-1326/)

---

## 6. PaGeS Corpus (Parallel German-Spanish)

### Overview
Bilingual parallel corpus of original German and Spanish texts with translations in both directions.

### License
- **License:** CC-BY (Creative Commons Attribution)
- **Commercial Use:** **YES** (with attribution)

### Size & Statistics
- **Size:** Not extensively documented
- **Content:** Original texts + translations (bidirectional)
- **Alignment:** Translation unit aligned

### Quality Assessment
- **Pros:**
  - Permissive CC-BY license
  - Bidirectional translations
  - Original texts in both languages

- **Cons:**
  - Limited documentation
  - Size unclear
  - Domain coverage unclear
  - Access information limited

### Data Access
- **Website:** www.corpuspages.eu
- **Format:** Likely standard parallel corpus formats

### Difficulty Tagging
- **No information available**

### Commercial Viability
**Rating: GOOD**
- CC-BY license allows commercial use
- Requires attribution

### Recommended Action
**Worth investigating further** if you can access the corpus. CC-BY license is ideal, but need more information on size and quality.

**Sources:**
- [Corpus PaGeS](https://www.corpuspages.eu/corpus/about/about?lang=en)
- [PaGeS: Design and Compilations - Academia.edu](https://www.academia.edu/64769758/)

---

## 7. ParaCrawl Corpus

### Overview
Large-scale parallel corpus extracted from web crawls, paired with English but can be triangulated for other pairs.

### License
- **License:** CC0 ("no rights reserved")
- **Commercial Use:** **YES** (no restrictions)

### Size & Statistics
- **Languages:** Multiple languages paired with English (German, Spanish included)
- **Size:** Very large (web-scale)
- **Spanish-English:** Available
- **German-English:** Available
- **Direct Spanish-German:** Would require triangulation through English

### Quality Assessment
- **Pros:**
  - CC0 license (most permissive)
  - Large-scale dataset
  - No attribution required
  - Web-sourced (diverse content)

- **Cons:**
  - Quality highly variable (web scraping)
  - Requires extensive filtering
  - May contain errors, noise
  - Not directly Spanish-German aligned
  - Requires triangulation work

### Data Access
- **Website:** https://paracrawl.eu/
- **Format:** Parallel corpus files

### Difficulty Tagging
- **No CEFR tagging**
- Mixed difficulty levels

### Commercial Viability
**Rating: EXCELLENT**
- CC0 license is ideal for commercial use
- No restrictions whatsoever
- No attribution required

### Recommended Action
**Good supplementary source** if you're willing to do triangulation and quality filtering. CC0 license is the best possible for commercial use.

**Sources:**
- [ParaCrawl News](https://paracrawl.eu/news)

---

## 8. JW300 Corpus (Jehovah's Witnesses Publications)

### Overview
Previously available parallel corpus with 300+ languages extracted from jw.org (Watchtower and Awake! magazines).

### License
- **License:** PROHIBITED - Copyright restrictions
- **Commercial Use:** **NO** (explicitly denied)
- **Current Status:** No longer legally available

### Size & Statistics
- **Languages:** 300+ languages
- **Average:** 100k parallel sentences per language pair
- **Spanish-German:** Was available

### Quality Assessment
- **Pros:**
  - Was comprehensive
  - Good quality translations
  - Large coverage

- **Cons:**
  - **COPYRIGHT VIOLATION** - website prohibits text/data mining
  - Permission formally denied in 2023
  - No longer legally accessible
  - Religious content domain

### Commercial Viability
**Rating: ILLEGAL**
- Explicitly prohibited by copyright holder
- Formal permission request denied
- Previous use was unauthorized

### Recommended Action
**DO NOT USE.** This corpus is not legally available for any use, commercial or non-commercial.

**Sources:**
- [JW300: A Wide-Coverage Parallel Corpus - ACL](https://aclanthology.org/P19-1310/)
- [Masakhane: JW300 Copyright Issues](https://knowledgegov.org/masakhane-projects-use-of-the-jw300-dataset-for-natural-language-processing-copyright-issues-contract-overrides-and-cross-border-implications/)
- [JW300 - ResearchGate](https://www.researchgate.net/publication/335779204_JW300_A_Wide-Coverage_Parallel_Corpus_for_Low-Resource_Languages)

---

## 9. OPUS Meta-Collection

### Overview
OPUS is not a single corpus but an aggregator hosting 1,200+ parallel corpora from various sources.

### License
- **License:** Varies by sub-corpus
- **OPUS-MT Models:** CC-BY 4.0 (commercial use allowed)
- **Underlying Data:** Check individual corpus licenses
- **Commercial Use:** **VARIES** by source

### Size & Statistics
- **Total:** 59.9+ billion sentence pairs
- **Languages:** 1,005 languages
- **Sub-corpora:** 1,213 collections
- **Spanish-German:** Multiple sources available

### Included Sources (Spanish-German)
- OpenSubtitles (unclear license)
- Europarl (public domain)
- Tatoeba (CC-BY)
- Books (varies)
- Wikipedia (CC-BY-SA)
- Many others

### Quality Assessment
- **Highly variable** - depends on sub-corpus selected

### Data Access
- **Website:** https://opus.nlpl.eu/
- **Tools:** OPUS::Tools for processing
- **Format:** Multiple formats (TMX, Moses, TSV)
- **API:** Accessible via Hugging Face

### Commercial Viability
**Rating: DEPENDS ON SUB-CORPUS**
- Must check license for each sub-corpus
- OPUS-MT models are CC-BY (commercial OK)
- Data sources have independent licenses

### Recommended Action
**Use OPUS as discovery tool.** Identify which sub-corpora have suitable licenses (Tatoeba, Europarl, etc.) and download those specifically.

**Sources:**
- [OPUS - Corpora](https://opus.nlpl.eu/)
- [OPUS on GitHub](https://github.com/Helsinki-NLP/OPUS)
- [Democratizing neural machine translation with OPUS-MT](https://link.springer.com/article/10.1007/s10579-023-09704-w)

---

## Summary Comparison Table

| Source | License | Commercial Use | Size (ES-DE) | Quality | Learner-Focused | Recommendation |
|--------|---------|----------------|--------------|---------|-----------------|----------------|
| **Tatoeba** | CC-BY 2.0 | ✅ YES | ~100k-500k | Medium-High | ✅ YES | **PRIMARY SOURCE** |
| **OpenSubtitles** | Unclear | ⚠️ UNCLEAR | Millions | Medium | ❌ NO | Risky - avoid |
| **Europarl** | Public Domain | ✅ YES | Large | High | ❌ NO | Supplementary (formal) |
| **TED Talks** | CC-BY-NC-ND | ❌ NO | Medium | High | ❌ NO | Cannot use |
| **TRIS** | Academic | ⚠️ Verify | 76k | High | ❌ NO | Too specialized |
| **PaGeS** | CC-BY | ✅ YES | Unknown | Unknown | ❌ NO | Worth investigating |
| **ParaCrawl** | CC0 | ✅ YES | Large | Variable | ❌ NO | Supplementary |
| **JW300** | Prohibited | ❌ NO | 100k | High | ❌ NO | **DO NOT USE** |
| **OPUS** | Varies | ⚠️ Varies | Billions | Varies | ❌ NO | Use as discovery tool |

---

## Recommendations

### Primary Source
**Tatoeba Project** - Best combination of:
- Clear commercial license (CC-BY)
- Learner-focused content
- Reasonable size
- Modern, natural language
- Easy to process

**Action Items:**
1. Download Spanish-German sentence pairs from Tatoeba
2. Implement attribution system ("Sentences from Tatoeba contributors - CC-BY 2.0")
3. Filter by quality metrics (length, complexity, naturalness)
4. Supplement with additional sources

### Supplementary Sources
1. **Europarl** - For formal/business Spanish (B2+)
2. **ParaCrawl** - After triangulation and heavy filtering (CC0 is ideal)

### Avoid Completely
1. **TED Talks** - NC license prohibits commercial use
2. **JW300** - Copyright violation
3. **OpenSubtitles** - Unclear licensing, legal risk

---

## CEFR Difficulty Tagging Strategy

**Problem:** Most parallel corpora lack CEFR difficulty tags.

**Solutions:**

### Option 1: Manual Tagging
- Hire Spanish teachers to tag sentences
- Expensive but accurate
- Good for seed data

### Option 2: Automatic Classification
- Use existing CEFR-tagged corpora as training data
- Train classifier on linguistic features:
  - Sentence length
  - Vocabulary frequency
  - Grammar complexity
  - Verb tenses used
- Tools: CEFR-SP corpus (English), MERLIN corpus (German)

### Option 3: Hybrid Approach
- Automatic pre-tagging
- Manual review of borderline cases
- Community feedback over time

**Recommended:** Start with Option 2 (automatic), refine with community feedback.

---

## Data Format Recommendations

### Ideal Format for Your App
```json
{
  "id": "unique_id",
  "spanish": "¿Cómo estás?",
  "german": "Wie geht es dir?",
  "cefr_level": "A1",
  "source": "tatoeba",
  "license": "CC-BY-2.0",
  "attribution": "Tatoeba contributors",
  "tags": ["greeting", "informal"],
  "audio_es": "url_or_null",
  "audio_de": "url_or_null"
}
```

### Available Formats from Sources
- **CSV/TSV** - Tatoeba, most OPUS corpora
- **TMX** - TRIS, some OPUS corpora (translation memory XML)
- **Moses format** - OPUS (plain text, one sentence per line)
- **JSON** - Custom processing required

**Conversion:** Most formats easily convertible to JSON with scripts.

---

## Legal Considerations

### Before Using Any Corpus Commercially:

1. **Read the full license text** - Don't rely on summaries
2. **Document your license compliance** - Keep records
3. **Implement attribution** - Where required (CC-BY)
4. **Monitor license changes** - Corpora can update terms
5. **Consult legal counsel** - For unclear licenses
6. **Avoid legally risky sources** - Not worth the liability

### Attribution Best Practices
For CC-BY sources like Tatoeba:
- Clear attribution in app (Settings > Data Sources)
- Per-sentence attribution not required (can be aggregate)
- Link to source and license
- Credit contributors

Example:
```
Example sentences provided by Tatoeba contributors
Licensed under CC-BY 2.0 FR
https://tatoeba.org | https://creativecommons.org/licenses/by/2.0/fr/
```

---

## Next Steps

1. **Download Tatoeba Spanish-German pairs** (~100k-500k sentences)
2. **Process and clean data** (remove duplicates, filter by length/quality)
3. **Implement CEFR auto-tagging** (can start simple with sentence length + frequency)
4. **Add Europarl formal sentences** for B2+ levels
5. **Build attribution system** into app
6. **Consider ParaCrawl** for supplementary data (CC0 is ideal)
7. **Set up data pipeline** for regular updates
8. **Implement quality feedback loop** (let users report bad sentences)

---

## Additional Resources

### Research Papers
- [OpenSubtitles2016: Extracting Large Parallel Corpora](https://aclanthology.org/L16-1147/)
- [Tatoeba Translation Challenge - Realistic Data Sets](https://aclanthology.org/2020.wmt-1.139.pdf)
- [CEFR-Based Sentence Difficulty Annotation](https://aclanthology.org/2022.emnlp-main.416.pdf)

### Tools
- **OpusTools** - For processing OPUS corpora
- **Tatoeba Tools** - For working with Tatoeba data
- **TMX parsers** - For handling translation memory files

### Related Projects
- **Anki decks** - Many use Tatoeba data (check their approach)
- **Language learning apps** - Study their attribution pages
- **MT research** - Follow licensing practices

---

## Conclusion

**Best Path Forward:**

1. **Primary:** Tatoeba Project (CC-BY) - ~100k+ sentences, learner-focused
2. **Supplement:** Europarl (public domain) - for formal register
3. **Future:** Consider ParaCrawl (CC0) after implementing quality filters

**Total Potential:** 200k-1M+ Spanish-German sentence pairs commercially usable

**Legal Status:** Clear with proper attribution

**Quality:** Medium-High after filtering, suitable for A1-C2 learners

**Cost:** $0 for data (just processing time)

---

*Report compiled from web research conducted on 2026-03-02. License information should be verified directly with source projects before commercial implementation.*
