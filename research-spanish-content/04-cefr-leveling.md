# Spanish CEFR Leveling Data - Research Findings

**Research Date:** March 2, 2026
**Researcher:** Claude (Sonnet 4.5)

---

## Executive Summary

Finding Spanish vocabulary datasets with explicit CEFR (A1-C2) level classifications is challenging. Unlike English (which has CEFR-J and extensive research), Spanish CEFR-tagged vocabulary resources are limited, often academic/restricted, or require manual mapping from frequency data.

**Key Findings:**
- **ELELex** is the most comprehensive Spanish CEFR resource (~13,000 lemmas, open-licensed)
- **Frequency lists** (doozan/spanish_data, Mark Davies) are abundant but lack CEFR tags
- **Commercial use** is generally allowed for open-licensed resources (CC-BY, MIT)
- **Best approach:** Combine frequency data + part-of-speech + manual CEFR mapping

---

## 1. ELELex - Spanish CEFR Lexical Resource

### Overview
ELELex is a CEFR-graded lexical resource for Spanish as a Foreign Language (ELE - Español como Lengua Extranjera).

### Details
- **Source:** UCLouvain CENTAL (Centre for Natural Language Processing)
- **Coverage:** ~13,000 lexical entries (lemmas) with CEFR distribution across A1-C2
- **Content:** Simple and multi-word lemmas with part of speech and observed frequencies per CEFR level
- **Methodology:** Frequencies estimated from corpora of pedagogical materials (textbooks, simplified readers) intended for Spanish L2 learners

### License & Commercial Use
- **License:** Open-licensed (specific terms not detailed in public documentation)
- **Commercial Use:** UNCLEAR - described as "open-licensed" but exact terms require verification
- **Access:** Online query engine for teachers/learners (machine-readable format)

### Data Format
- Machine-readable format
- Includes: lemma, part of speech, frequency distribution across CEFR levels
- Format details (CSV/JSON) not specified in public documentation

### Validation Method
- Corpus-based: extracted from authentic pedagogical materials (textbooks, graded readers)
- Manually checked
- Frequency distributions calculated across CEFR-aligned learning materials

### Download Link
- [CEFRLex Project Homepage](https://cental.uclouvain.be/cefrlex/)
- [ELELex Research Paper](https://dial.uclouvain.be/pr/boreal/object/boreal:204347)
- [CEFRLex Download Page](https://cental.uclouvain.be/cefrlex/download/)

### Pros & Cons

**Pros:**
- Only comprehensive Spanish CEFR-tagged lexical resource found
- Academic validation and methodology
- Machine-readable
- Includes multi-word expressions
- Part of speech information
- ~13,000 entries covers core vocabulary well

**Cons:**
- Exact license terms unclear (requires verification)
- Access method unclear (online query vs. downloadable dataset)
- File format not specified
- May not cover advanced/specialized vocabulary beyond C2
- Documentation limited for non-academic users

---

## 2. Instituto Cervantes - Plan Curricular

### Overview
The official curriculum reference for Spanish teaching aligned with CEFR levels.

### Details
- **Source:** Instituto Cervantes (official Spanish language authority)
- **Coverage:** Complete vocabulary and grammar inventories for A1-C2
- **Content:** Organized by proficiency levels with detailed descriptors
- **Methodology:** Developed according to Council of Europe CEFR recommendations

### License & Commercial Use
- **License:** Copyright Instituto Cervantes
- **Commercial Use:** UNCLEAR - educational materials, terms require verification
- **Access:** Available through Centro Virtual Cervantes (CVC) website

### Data Format
- PDF format (primarily documentation/curriculum guides)
- Not structured as machine-readable database
- Requires manual extraction

### Validation Method
- Official curriculum developed by language teaching experts
- Aligned with DELE exam specifications
- Based on pedagogical standards

### Download Link
- [Plan Curricular del Instituto Cervantes](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/)
- [CVC Homepage](https://cvc.cervantes.es/)

### Pros & Cons

**Pros:**
- Official, authoritative source
- Comprehensive coverage (A1-C2)
- Aligned with DELE exams
- Includes grammar and cultural content
- Free access

**Cons:**
- Not a structured dataset (PDF documentation)
- Requires manual extraction and processing
- License unclear for commercial applications
- Format not suitable for direct app integration
- No machine-readable vocabulary lists

---

## 3. Spanish Frequency Lists (doozan/spanish_data)

### Overview
Spanish-to-English dictionary, frequency lists, and lemma data from Wiktionary and corpus sources.

### Details
- **Source:** GitHub repository by doozan
- **Coverage:** ~50,000+ Spanish lemmas with frequency rankings
- **Content:**
  - es-en.data: Spanish-English Wiktionary data
  - frequency.csv: Ranked list of frequent Spanish lemmas with POS
  - sentences.tsv: English/Spanish sentence pairs from Tatoeba

### License & Commercial Use
- **License:** CC-BY-4.0 (repository), individual files CC-BY-SA 3.0 / CC-BY 2.0 FR
- **Commercial Use:** YES - Creative Commons licenses allow commercial use with attribution

### Data Format
- **CSV** (frequency list)
- **TSV** (sentence pairs)
- **Custom format** (dictionary data)
- Columns: Rank, Frequency, Lemma, Part of Speech

### Validation Method
- Corpus-based frequency counts
- Sourced from Wiktionary (community-validated)
- No CEFR tagging (frequency only)

### Download Link
- [GitHub: doozan/spanish_data](https://github.com/doozan/spanish_data)

### Pros & Cons

**Pros:**
- Open license (commercial use allowed)
- Machine-readable CSV format
- Large coverage (50k+ lemmas)
- Includes part of speech
- Active GitHub repository
- Free download

**Cons:**
- NO CEFR levels (frequency only)
- Requires manual CEFR mapping (frequency as proxy)
- Quality varies (community-sourced)
- Limited semantic information

---

## 4. Corpus del Español - Mark Davies Frequency Lists

### Overview
Large-scale Spanish corpus and frequency dictionaries by renowned corpus linguist Mark Davies.

### Details
- **Source:** Mark Davies (Brigham Young University)
- **Coverage:**
  - Corpus: 2+ billion words from 21 Spanish-speaking countries
  - Dictionary: Top 5,000-10,000 most frequent words
- **Content:** Lemma, frequency, example sentences, collocations

### License & Commercial Use
- **License:** Commercial product (Routledge publisher)
- **Commercial Use:** NO - requires purchase, copyright restrictions
- **Access:** Available in book form or tab-delimited download (for purchasers)

### Data Format
- Tab-delimited text format (for licensed users)
- Print book format
- Web interface at corpusdelespanol.org (limited free access)

### Validation Method
- Corpus-based (2+ billion words)
- Covers 21 Spanish-speaking countries
- Linguistically tagged and lemmatized
- Expert curation

### Download Link
- [Corpus del Español](https://www.corpusdelespanol.org/)
- [Routledge Frequency Dictionary](https://www.routledge.com/A-Frequency-Dictionary-of-Spanish-Core-Vocabulary-for-Learners/Davies-Davies/p/book/9781138686540)
- [Mark Davies Homepage](https://www.mark-davies.org/)
- [Tab-delimited support files](https://www.routledge.com/9781138686540) (for purchasers)

### Pros & Cons

**Pros:**
- Highest quality corpus data
- Massive coverage (2B+ words)
- Expert validation
- Includes regional variation
- Rich linguistic metadata

**Cons:**
- Commercial product (costs money)
- NO commercial use license
- NO CEFR tagging
- Requires purchase for full access
- Copyright restrictions

---

## 5. KELLY Project Spanish Vocabulary

### Overview
Keywords for Language Learning for Young and adults alike - core vocabulary project.

### Details
- **Source:** European research project
- **Coverage:** Core vocabulary list sorted by frequency
- **Content:** Frequency-based vocabulary divided into 6 CEFR levels
- **Methodology:** Most frequent words = A1, least frequent = C2 (equal-sized divisions)

### License & Commercial Use
- **License:** Research project license (varies by dataset)
- **Commercial Use:** UNCLEAR - requires verification from project source
- **Access:** Academic research channels

### Data Format
- Machine-readable (format varies)
- Frequency-sorted with CEFR level assignment

### Validation Method
- Frequency-based CEFR assignment (algorithmic)
- Core vocabulary focus
- Missing entries assigned C2 (highest level)

### Download Link
- [KELLY Project Research Paper](https://aclanthology.org/2020.lrec-1.43.pdf)

### Pros & Cons

**Pros:**
- CEFR levels included
- Research-validated methodology
- Core vocabulary focus
- Multiple language support

**Cons:**
- Limited documentation found
- CEFR assignment is algorithmic (not pedagogically validated)
- Coverage unclear
- Access/download unclear
- May be research-only license

---

## 6. Spanish NLP Datasets (GitHub Collections)

### Overview
Various open-source Spanish NLP resources with frequency and lemma data.

### Details
- **Sources:** Multiple GitHub repositories
  - [martin-martin/lemma_freq](https://github.com/martin-martin/lemma_freq) - OPUS-based lemma frequencies
  - [alexey-yunoshev/lemma-frequency-lists](https://github.com/alexey-yunoshev/lemma-frequency-lists)
  - [michmech/lemmatization-lists](https://github.com/michmech/lemmatization-lists)
  - [juandpinto/frequency-dictionary](https://github.com/juandpinto/frequency-dictionary) (MIT license)
  - [awesome-spanish-nlp](https://github.com/dav009/awesome-spanish-nlp) - Curated resource list

### License & Commercial Use
- **License:** MIT (for juandpinto/frequency-dictionary and some others)
- **Commercial Use:** YES (for MIT-licensed repos)
- **Access:** Public GitHub repositories

### Data Format
- CSV (most common)
- JSON (some repositories)
- Python-processable formats

### Validation Method
- Corpus-based frequency extraction
- Various sources (OPUS, OpenSubtitles, Books, etc.)
- Automated processing

### Pros & Cons

**Pros:**
- Open licenses (MIT, CC-BY)
- Commercial use allowed
- Machine-readable formats
- Free access
- Active development

**Cons:**
- NO CEFR levels
- Quality varies by source
- Limited documentation
- Requires technical skills to process

---

## 7. Word Frequency Info - Spanish 20K Lemmas

### Overview
Spanish lemma frequency list from Corpus del Español (20,000 entries).

### Details
- **Source:** wordfrequency.info / Mark Davies
- **Coverage:** Top 20,000 Spanish lemmas
- **Content:** ID (rank), Frequency, Lemma, Part of Speech

### License & Commercial Use
- **License:** Not explicitly stated in file
- **Commercial Use:** UNCLEAR - contact required (word_frequency@byu.edu)
- **Access:** Direct download from website

### Data Format
- Tab-delimited text file
- Columns: Rank | Frequency | Lemma | PoS

### Validation Method
- Based on 100-million word Corpus del Español (1900s section)
- Tagged and lemmatized
- Frequency-based ranking

### Download Link
- [Spanish Lemmas 20K](https://www.wordfrequency.info/files/spanish/spanish_lemmas20k.txt)

### Pros & Cons

**Pros:**
- Large coverage (20,000 lemmas)
- High-quality corpus source
- Simple tab-delimited format
- Includes part of speech
- Free download

**Cons:**
- License unclear
- NO CEFR levels
- Requires contact for usage terms
- Older corpus data (1900s)

---

## 8. Lexical Complexity Datasets for Spanish

### Overview
Recent machine learning datasets for Spanish lexical complexity prediction.

### Details
- **Source:** Academic research (LexComSpaL2, TELEIA)
- **Coverage:**
  - LexComSpaL2: 2,240 in-context words from 200 sentences (4 domains)
  - TELEIA: Spanish language evaluation dataset
- **Content:** Words with difficulty judgements from L2 learners

### License & Commercial Use
- **License:** Academic research licenses (varies)
- **Commercial Use:** UNCLEAR - likely research-only
- **Access:** Research publications, contact authors

### Data Format
- Research datasets (format varies)
- Annotated with difficulty judgements

### Validation Method
- Human annotations from L2 learners
- Context-based difficulty assessment
- Machine learning validation

### Download Link
- [LexComSpaL2 Paper](https://aclanthology.org/2024.lrec-main.912.pdf)
- [TELEIA Dataset](https://www.sciencedirect.com/science/article/pii/S2352340925001696)

### Pros & Cons

**Pros:**
- Research-validated difficulty ratings
- Context-aware annotations
- Modern datasets (2024)
- Machine learning ready

**Cons:**
- Small coverage (~2,000 words)
- Research licenses (not commercial)
- Not CEFR-tagged
- Limited availability

---

## 9. Duolingo Research Datasets

### Overview
Language learning data from Duolingo, including Spanish courses.

### Details
- **Source:** Duolingo Research Team
- **Coverage:** Spanish course with 5,256 words across 213 units (A1-B2)
- **Content:** User learning data, recall rates, practice timing

### License & Commercial Use
- **License:** Research datasets (specific licenses vary)
- **Commercial Use:** UNCLEAR - primarily for academic research
- **Access:** Duolingo Research website (application required)

### Data Format
- Research datasets (various formats)
- Includes user interaction data

### Validation Method
- Real learner data
- Aligned to CEFR/ACTFL frameworks
- Millions of data points

### Download Link
- [Duolingo Research](https://research.duolingo.com/)
- [Course Data (Unofficial)](https://duolingodata.com/)

### Pros & Cons

**Pros:**
- Real learner data
- CEFR-aligned (A1-B2)
- Large-scale dataset
- Research-validated

**Cons:**
- Access requires application
- Primarily research use
- Privacy restrictions
- May not include raw vocabulary lists
- Limited to A1-B2 levels

---

## Alternative Approaches (If CEFR Data Not Available)

### 1. Frequency as Proxy for CEFR Levels

**Method:** Use word frequency as a proxy for difficulty level.

**Suggested Mapping:**
- **A1:** Top 500-1,000 most frequent words
- **A2:** Words 1,001-2,000
- **B1:** Words 2,001-4,000
- **B2:** Words 4,001-7,500
- **C1:** Words 7,501-15,000
- **C2:** Words 15,001+

**Sources:**
- doozan/spanish_data (50K+ words with frequency)
- wordfrequency.info Spanish lemmas (20K words)
- Mark Davies Corpus del Español (2B+ words)

**Pros:**
- Data readily available
- Well-validated frequency counts
- Open licenses available

**Cons:**
- Not pedagogically aligned
- Frequency ≠ difficulty (e.g., "muerte" is frequent but conceptually advanced)
- Regional variation affects frequency

---

### 2. Word Complexity Heuristics

**Features to Consider:**
- **Word length:** Longer words = higher difficulty
- **Syllable count:** More syllables = more complex
- **Cognate status:** Spanish-English cognates = easier for English speakers
- **Part of speech:** Nouns/verbs = earlier levels, adverbs/conjunctions = later
- **Morphological complexity:** Root vs. derived forms
- **Semantic abstractness:** Concrete nouns = A1, abstract concepts = C1

**Implementation:**
- Combine features using machine learning
- Train on known CEFR-tagged vocabulary (e.g., ELELex)
- Apply to untagged frequency lists

**Pros:**
- Linguistically motivated
- Can handle words not in frequency lists
- Customizable to learner background

**Cons:**
- Requires development effort
- Accuracy varies
- May not align with pedagogical standards

---

### 3. Cross-Language CEFR Mapping

**Method:** Use English CEFR-tagged vocabulary (CEFR-J) and map to Spanish via translation.

**Sources:**
- [CEFR-J English Profile Dataset](https://github.com/openlanguageprofiles/olp-en-cefrj) (CC-BY-SA 4.0)
- Translation APIs or bilingual dictionaries
- Spanish-English parallel corpora

**Process:**
1. Start with English CEFR-J dataset (~13,000 words with CEFR levels)
2. Translate to Spanish using high-quality dictionary/API
3. Validate translations with native speakers
4. Cross-reference with Spanish frequency data

**Pros:**
- Leverages well-developed English resources
- CEFR-J is open-licensed (commercial use OK)
- Structured dataset with POS

**Cons:**
- Translation introduces errors
- Conceptual difficulty may differ across languages
- Cultural context varies
- Requires validation effort

---

### 4. Textbook Corpus Extraction

**Method:** Extract vocabulary from CEFR-leveled Spanish textbooks.

**Process:**
1. Collect digital textbooks for A1, A2, B1, B2, C1, C2
2. Extract vocabulary using NLP tools (FreeLing, SpaCy)
3. Assign CEFR level based on textbook level
4. Aggregate across multiple textbooks for validation

**Sources:**
- Spanish ELE textbooks (various publishers)
- SPLLOC corpus (Spanish Learner Language Oral Corpus)
- Instituto Cervantes recommended materials

**Pros:**
- Pedagogically aligned
- Reflects actual teaching practice
- Can capture multi-word expressions

**Cons:**
- Copyright issues (textbooks are protected)
- Labor-intensive
- Textbook quality varies
- May not be freely distributable

---

## Recommended Strategy

### For Commercial Application Development

**Best Approach: Hybrid Model**

1. **Start with ELELex** (~13,000 words, CEFR-tagged)
   - Contact UCLouvain for exact license terms and commercial use permission
   - Use as core validated dataset

2. **Supplement with Frequency Data** (doozan/spanish_data)
   - CC-BY-4.0 license (commercial use OK)
   - ~50,000 words with POS
   - Map frequency to CEFR using ELELex as training data

3. **Add Machine Learning Model**
   - Train on ELELex (features: frequency, length, POS, syllables)
   - Predict CEFR for unmapped words
   - Validate predictions with language teachers

4. **Manual Validation**
   - Review edge cases with Spanish language experts
   - Align with Plan Curricular del Instituto Cervantes guidelines
   - Test with real learners

### Data Sources Priority

**High Priority (Use These):**
1. ELELex (CEFR-tagged, pending license verification)
2. doozan/spanish_data (open license, large coverage)
3. CEFR-J English dataset (for cross-language mapping)

**Medium Priority (Supplementary):**
1. Mark Davies frequency lists (if budget allows purchase)
2. Plan Curricular del Instituto Cervantes (reference/validation)
3. GitHub NLP datasets (MIT-licensed repositories)

**Low Priority (Research/Reference):**
1. Duolingo datasets (access restricted)
2. Lexical complexity datasets (too small)
3. KELLY project (unclear access)

---

## License Summary Table

| Resource | License | Commercial Use | Download Available |
|----------|---------|----------------|-------------------|
| ELELex | Open (unclear type) | UNCLEAR | Query interface |
| Plan Curricular | Copyright IC | UNCLEAR | PDF (free) |
| doozan/spanish_data | CC-BY-4.0 | YES | GitHub |
| Mark Davies Corpus | Commercial | NO | Purchase only |
| KELLY Project | Research | UNCLEAR | Limited |
| GitHub NLP datasets | MIT / CC-BY | YES | GitHub |
| Word Frequency 20K | Unclear | UNCLEAR | Free download |
| Lexical Complexity | Research | NO | Contact authors |
| Duolingo | Research | NO | Application |
| CEFR-J (English) | CC-BY-SA 4.0 | YES | GitHub |

---

## Next Steps / Action Items

1. **Contact UCLouvain** - Request ELELex commercial license terms and dataset access
   - Email: cvc@cervantes.es or check CEFRLex website for contact

2. **Download Open Resources**
   - doozan/spanish_data (GitHub)
   - CEFR-J English dataset (for comparison/mapping)
   - Spanish lemma 20K list (wordfrequency.info)

3. **Develop Mapping Algorithm**
   - Train ML model on ELELex (if accessible)
   - Map frequency ranges to CEFR levels
   - Implement word complexity features

4. **Validate with Experts**
   - Consult Spanish language teachers
   - Cross-reference with Plan Curricular
   - Test with sample learners

5. **Consider Hybrid Approach**
   - Start with frequency-based approximation
   - Gradually improve with validated CEFR data
   - Implement feedback loop from users

---

## References & Sources

### Primary Sources
- [CEFRLex Project](https://cental.uclouvain.be/cefrlex/)
- [ELELex Research Paper](https://dial.uclouvain.be/pr/boreal/object/boreal:204347)
- [Plan Curricular del Instituto Cervantes](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/)
- [doozan/spanish_data GitHub](https://github.com/doozan/spanish_data)
- [Corpus del Español - Mark Davies](https://www.corpusdelespanol.org/)

### Academic Research
- [KELLY Project Research](https://aclanthology.org/2020.lrec-1.43.pdf)
- [Supplementing CEFR-graded vocabulary lists](https://www.nature.com/articles/s41599-025-05446-y)
- [LexComSpaL2 Lexical Complexity Corpus](https://aclanthology.org/2024.lrec-main.912.pdf)
- [Linking vocabulary to the CEFR](https://www.researchgate.net/publication/339915499_Linking_vocabulary_to_the_CEFR_and_the_Global_Scale_of_English_A_psychometric_model)
- [CEFR Journal - Vocabulary Development](https://cefrjapan.net/images/PDF/CEFRJournal/CEFRJournal-1-1_D_Tono_2019.pdf)

### Open Datasets
- [CEFR-J English Profile (GitHub)](https://github.com/openlanguageprofiles/olp-en-cefrj)
- [Words-CEFR-Dataset (GitHub)](https://github.com/Maximax67/Words-CEFR-Dataset)
- [Spanish Lemma Frequency (GitHub)](https://github.com/martin-martin/lemma_freq)
- [Frequency Dictionary (GitHub)](https://github.com/juandpinto/frequency-dictionary)
- [Awesome Spanish NLP (GitHub)](https://github.com/dav009/awesome-spanish-nlp)

### Commercial Resources
- [A Frequency Dictionary of Spanish - Routledge](https://www.routledge.com/A-Frequency-Dictionary-of-Spanish-Core-Vocabulary-for-Learners/Davies-Davies/p/book/9781138686540)
- [Spanish Word Frequency Lists - Lexical Computing](https://www.lexicalcomputing.com/spanish-word-frequency-lists-for-download/)
- [LanGeek Spanish Vocabulary](https://help.langeek.co/cefr-spanish-vocabulary-pdf/)

### Learning Platforms
- [Duolingo Research](https://research.duolingo.com/)
- [Spanish Kwiziq Vocabulary Lists](https://spanish.kwiziq.com/learn/theme)
- [Lingolex Spanish Vocabulary](https://lingolex.com/swom/)

### Infrastructure & Tools
- [CLARIN Wordlists](https://www.clarin.eu/resource-families/lexical-resources-wordlists)
- [FreeLing Linguistic Data](https://nlp.lsi.upc.edu/freeling/index.php/node/12)
- [Spanish NLP PyPI Package](https://pypi.org/project/spanish-nlp/)

---

## Conclusion

**Key Takeaway:** True Spanish CEFR-tagged vocabulary datasets are rare. ELELex is the best option if licensing can be confirmed. For commercial applications, a hybrid approach combining open-licensed frequency data (doozan/spanish_data) with algorithmic CEFR mapping is the most practical solution.

**Recommended Path Forward:**
1. Use **doozan/spanish_data** (CC-BY-4.0) as foundation
2. Map frequency to CEFR levels (validated against Plan Curricular)
3. Supplement with **ELELex** if commercial license obtained
4. Build ML model for continuous improvement
5. Validate with Spanish language teaching experts

**Total Estimated Coverage:**
- Immediate: ~50,000 words (frequency-based CEFR estimation)
- With ELELex: ~13,000 validated CEFR words + 37,000 estimated
- Quality: Medium-to-High with expert validation

**Timeline Estimate:**
- Data acquisition: 1-2 weeks
- CEFR mapping algorithm: 2-3 weeks
- Validation & testing: 2-4 weeks
- **Total:** 5-9 weeks for production-ready dataset

---

**Document Version:** 1.0
**Last Updated:** March 2, 2026
**Contact:** For questions about this research, contact the development team.
