# Spanish-German Dictionary Sources Research

**Research Date:** March 2, 2026
**Purpose:** Find commercially usable Spanish-German dictionaries for a paid vocabulary learning app

---

## Executive Summary

**Key Finding:** Most free/open-source Spanish-German dictionaries use licenses (CC BY-SA, GPL) that require derivative works to be open-source. This makes them **unsuitable for a proprietary paid app** that redistributes the data.

**Recommendation:** If you want to sell a closed-source app with embedded dictionary data, you likely need:
1. A CC0 or Public Domain dictionary (rare, limited coverage)
2. A paid commercial license from a dictionary provider
3. MIT/Apache licensed data (very rare for dictionaries)

---

## 1. Wiktionary Dumps

### Overview
Wiktionary provides comprehensive multilingual dictionary data extracted from community-contributed definitions.

### Access Methods

#### Option A: Kaikki.org (Processed Wiktextract Data)
- **URL:** https://kaikki.org/dictionary/rawdata.html
- **Coverage:** Both Spanish and German editions available
- **Update Frequency:** Weekly (last extract: 2026-02-01)
- **Format:** JSON (machine-readable)

#### Option B: DBnary (RDF/Linked Data)
- **URL:** https://kaiko.getalp.org/about-dbnary/
- **Coverage:** 28 languages including Spanish and German
- **Format:** RDF/Ontolex (structured semantic data)
- **Estimated Size:** Millions of entries across languages

#### Option C: Raw Wikimedia Dumps
- **URL:** https://dumps.wikimedia.org/
- **Coverage:** Complete Spanish and German Wiktionary editions
- **Format:** XML (requires parsing)

### License: CC BY-SA 3.0 / GFDL

**Commercial Use:** YES (technically)
**Redistribution:** YES
**Attribution Required:** YES (must credit Wiktionary)
**Critical Restriction:** ⚠️ **ShareAlike/Copyleft** - Any app using this data must be released under the same open license

### License Analysis
According to Creative Commons documentation, CC BY-SA permits:
- Commercial use and monetization
- Redistribution in any format
- Modification and adaptation

BUT REQUIRES:
- Attribution to Wiktionary/contributors
- **Any derivative work MUST be licensed under CC BY-SA or compatible license**
- Source code and data must be made available to users

**Verdict for Paid Closed-Source App:** ❌ **NOT SUITABLE**

The ShareAlike clause means your entire app would need to be open-source if you embed this data. You could potentially:
- Link to external Wiktionary data (not embed it)
- Use it for a free, open-source app
- Negotiate a separate license (unlikely)

### Pros
- Excellent coverage (hundreds of thousands of entries)
- High quality (community-vetted)
- Free to access
- Multiple formats available
- Regularly updated
- Includes pronunciations, etymology, examples

### Cons
- ShareAlike requirement kills proprietary use
- Attribution required
- Data quality varies by entry
- Requires parsing/processing
- No official support

---

## 2. FreeDict Project

### Overview
Open-source bilingual dictionary project founded in 2000 with 140+ dictionaries in 45 languages.

- **URL:** https://freedict.org/
- **Spanish-German:** Check downloads page for specific language pair availability
- **Format:** TEI XML, various export formats

### License: GPL v3 or Later

**Commercial Use:** YES (technically)
**Redistribution:** YES
**Attribution Required:** Recommended but not strictly required by GPL
**Critical Restriction:** ⚠️ **Copyleft** - Derivative works must be GPL-licensed

### License Analysis
The GPL allows:
- Commercial distribution and selling
- Modification and redistribution
- Use in commercial applications

BUT REQUIRES:
- **Source code of your entire app must be available**
- Users must receive the same GPL freedoms
- Any modifications must also be GPL
- Must provide written offer to distribute source

**Verdict for Paid Closed-Source App:** ❌ **NOT SUITABLE**

GPL is even more restrictive than CC BY-SA for closed-source commercial apps. Your entire application would need to be open-source.

### Pros
- Specifically designed for dictionary applications
- Clean, structured data (TEI XML)
- Free to access
- Active community
- Export to multiple formats

### Cons
- GPL copyleft restrictions
- May have limited coverage for some language pairs
- Spanish-German pair availability uncertain
- Would force entire app to be open-source

---

## 3. Dictionary APIs (External Data)

### Option A: PONS Dictionary API

- **URL:** https://en.pons.com/p/online-dictionary/developers/api
- **Coverage:** Spanish ↔ German supported
- **Free Tier:** 1,000 queries/month
- **License:** Commercial use unclear - requires investigation

**Commercial Use:** UNCLEAR (need to contact)
**Redistribution:** NO (API-based, no data redistribution)
**Attribution Required:** Likely YES

**Approach:** API calls (not embedded data)

### Pros
- No redistribution needed (API model)
- Professional quality data
- Avoids licensing issues with data storage
- Regular updates maintained by PONS

### Cons
- Requires internet connection
- 1,000 requests/month may be too limited
- Paid tiers unknown
- Dependency on third-party service
- Potential API deprecation risk

---

### Option B: Linguatools Dictionary API

- **URL:** https://linguatools.org/language-apis/linguatools-dictionary-api/
- **Coverage:** German ↔ Spanish supported
- **Free Tier:** 1,000 requests/month (via RapidAPI)

**Commercial Use:** UNCLEAR
**Redistribution:** NO (API-based)
**Attribution Required:** Likely YES

### Pros
- Specifically includes Spanish-German
- Available via RapidAPI
- Professional quality

### Cons
- Limited free tier
- Requires internet
- Commercial terms unclear
- Third-party dependency

---

### Option C: Lexicala API

- **URL:** https://api.lexicala.com/
- **Coverage:** 50+ languages (check for Spanish-German)
- **License:** Commercial licensing available

**Commercial Use:** YES (with paid plan)
**Redistribution:** NO (API-based)
**Attribution Required:** Check terms

### Pros
- Explicitly offers commercial licensing
- Professional multilingual dictionary
- Comprehensive language support

### Cons
- Likely expensive for commercial use
- Requires internet
- Need to verify Spanish-German translation support

---

## 4. Paid Commercial Dictionary Licenses

### Option A: Cambridge Dictionary Data

- **URL:** https://dictionary.cambridge.org/us/license.html
- **Coverage:** Multiple languages (verify Spanish-German)
- **License:** Custom commercial licenses available

**Commercial Use:** YES
**Redistribution:** YES (with license)
**Attribution Required:** Negotiable

**Pricing:** Contact for quote (likely expensive for language learning apps)

### Pros
- Full commercial rights
- High-quality professional data
- No copyleft restrictions
- Can embed in app
- Official support

### Cons
- Expensive (enterprise-level pricing)
- May not have Spanish-German translations
- Overkill for small app
- Ongoing license fees possible

---

### Option B: LEO Dictionary

- **URL:** https://www.leo.org/
- **Coverage:** ~208,000 Spanish-German entries
- **Usage:** 2 million queries/day
- **License:** Commercial licenses required for corporate/commercial use

**Commercial Use:** YES (with license)
**Redistribution:** Unknown (need to contact)
**Attribution Required:** Negotiable

**Approach:** Contact LEO for commercial licensing terms

### Pros
- Specifically has Spanish-German
- Large entry count
- Widely used and trusted
- Established service

### Cons
- No public pricing
- License terms unknown
- May be expensive
- Primarily designed for web lookup

---

## 5. Alternative Approaches

### Option A: User-Generated Content Model

**Approach:** Start with a small curated dictionary and let users contribute translations

**Pros:**
- You own the data
- No licensing issues
- Community engagement
- Grows over time

**Cons:**
- Poor initial coverage
- Quality control needed
- Slow growth
- May not attract users without existing content

---

### Option B: Hybrid API + Offline Model

**Approach:** Use dictionary APIs for online mode, cache allowed data for offline use

**Pros:**
- Best of both worlds
- Reduced API costs
- Works offline for cached entries
- Can negotiate caching terms

**Cons:**
- Complex implementation
- Legal gray area for caching
- Still requires internet for new words

---

### Option C: Create/License Your Own

**Approach:** Hire linguists to create a basic Spanish-German dictionary

**Pros:**
- Full ownership
- No licensing restrictions
- Customized for your use case
- Can be expanded over time

**Cons:**
- Very expensive upfront
- Time-consuming
- Requires linguistic expertise
- Limited initial coverage

---

## 6. Understanding License Types

### CC0 / Public Domain
- **Commercial Use:** ✅ YES
- **Redistribution:** ✅ YES
- **Attribution:** ❌ NOT REQUIRED
- **Copyleft:** ❌ NO
- **Verdict:** ✅ **IDEAL for commercial closed-source apps**

**Problem:** Very rare for comprehensive dictionaries

---

### CC BY (Attribution)
- **Commercial Use:** ✅ YES
- **Redistribution:** ✅ YES
- **Attribution:** ✅ REQUIRED
- **Copyleft:** ❌ NO
- **Verdict:** ✅ **ACCEPTABLE for commercial apps**

**Note:** You can sell the app, just need to credit the source

---

### CC BY-SA (Attribution-ShareAlike)
- **Commercial Use:** ✅ YES (technically)
- **Redistribution:** ✅ YES
- **Attribution:** ✅ REQUIRED
- **Copyleft:** ⚠️ **YES - derivative must be same license**
- **Verdict:** ❌ **NOT SUITABLE for closed-source paid apps**

**This is what Wiktionary uses**

---

### GPL (GNU General Public License)
- **Commercial Use:** ✅ YES (technically)
- **Redistribution:** ✅ YES
- **Copyleft:** ⚠️ **YES - entire app must be GPL**
- **Source Code:** ⚠️ **MUST BE PROVIDED**
- **Verdict:** ❌ **NOT SUITABLE for closed-source paid apps**

**This is what FreeDict uses**

---

### MIT / Apache
- **Commercial Use:** ✅ YES
- **Redistribution:** ✅ YES
- **Attribution:** ✅ REQUIRED (for MIT)
- **Copyleft:** ❌ NO
- **Verdict:** ✅ **IDEAL for commercial apps**

**Problem:** Extremely rare for dictionary data (more common for software)

---

## Recommendations

### For a Paid, Closed-Source App

**Your best options are:**

1. **Use a Dictionary API (PONS, Linguatools, Lexicala)**
   - No data redistribution = no copyleft issues
   - Pay per use or subscription
   - Requires internet connection
   - **Action:** Contact PONS and Linguatools about commercial pricing

2. **Purchase a Commercial License (Cambridge, LEO)**
   - Full rights to embed data
   - Expensive but legal and clear
   - No copyleft restrictions
   - **Action:** Request quotes from Cambridge and LEO

3. **Build Your Own Dictionary**
   - Hire translators to create a basic 5,000-10,000 word dictionary
   - Expand over time with user contributions
   - Full ownership
   - **Action:** Get quotes from translation agencies

### What NOT to Do

❌ **DO NOT** use Wiktionary dumps in a closed-source paid app
❌ **DO NOT** use FreeDict in a closed-source paid app
❌ **DO NOT** ignore ShareAlike/GPL requirements

**These licenses REQUIRE your entire app to be open-source.**

### Hybrid Approach (If You Want to Start Free)

1. Launch with API-based lookups (PONS free tier)
2. Build user-contributed dictionary alongside
3. Eventually purchase commercial license as you scale
4. Phase out expensive API as your own data grows

---

## Next Steps

1. **Immediate:** Contact PONS about commercial API pricing for Spanish-German
2. **Immediate:** Contact Linguatools about commercial terms
3. **Research:** Get quote from Cambridge Dictionary for Spanish-German license
4. **Research:** Contact LEO about commercial licensing
5. **Alternative:** Research cost of hiring translators to build custom dictionary
6. **Decision:** Evaluate budget vs. coverage needs

---

## Sources

### Open Source Dictionary Projects
- [FreeDict Project](https://freedict.org/)
- [FreeDict Licensing Documentation](https://github.com/freedict/fd-dictionaries/wiki/FreeDict-HOWTO-%E2%80%93-Licensing-And-Copyright)
- [FreeDict Downloads](https://freedict.org/downloads/)

### Wiktionary Resources
- [Wikimedia Dumps License Information](https://dumps.wikimedia.org/legal.html)
- [Wiktionary License Discussion](https://en.wiktionary.org/wiki/Wiktionary:License_discussion)
- [Kaikki.org Wiktionary Extracts](https://kaikki.org/dictionary/rawdata.html)
- [Wiktextract GitHub](https://github.com/tatuylonen/wiktextract)
- [DBnary Project](https://kaiko.getalp.org/about-dbnary/)
- [DBnary Zenodo Archive](https://zenodo.org/records/10475278)

### Dictionary APIs
- [PONS Dictionary API](https://en.pons.com/p/online-dictionary/developers/api)
- [Linguatools Dictionary API](https://linguatools.org/language-apis/linguatools-dictionary-api/)
- [Lexicala Multilingual API](https://api.lexicala.com/)
- [Free Dictionary API](https://dictionaryapi.dev/)
- [FreeDictionaryAPI](https://freedictionaryapi.com/)

### Commercial Dictionary Licenses
- [Cambridge Dictionary Licensing](https://dictionary.cambridge.org/us/license.html)
- [LEO Dictionary](https://en.wikipedia.org/wiki/LEO_(website))

### License Information
- [Creative Commons CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- [Creative Commons License Types](https://creativecommons.org/share-your-work/cclicenses/)
- [CC0 Public Domain Dedication](https://creativecommons.org/public-domain/cc0/)
- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [GPL License Overview](https://www.gnu.org/licenses/gpl-3.0.en.html)
- [Understanding Copyleft](https://en.wikipedia.org/wiki/Copyleft)

---

## Glossary

**Copyleft:** License requirement that derivative works must use the same license (ShareAlike, GPL)

**Attribution:** Requirement to credit the original creator/source

**Redistribution:** Including a copy of the data in your application

**Derivative Work:** Your app that incorporates or modifies the dictionary data

**ShareAlike (SA):** Creative Commons term for copyleft - derivatives must use same license

**GPL:** GNU General Public License - strong copyleft requiring source code availability

**Public Domain:** No copyright restrictions - use however you want

**CC0:** Creative Commons "No Rights Reserved" - like public domain but more legally robust
