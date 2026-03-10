"""Pass 3c: Audit grammar coverage against CEFR targets.

One LLM call per CEFR level — checks whether target grammar structures
appear in the generated sentences. Returns a structured report.
"""

from pydantic import BaseModel


class GrammarTargetResult(BaseModel):
    target: str
    present: bool
    example: str = ""


class GrammarLevelReport(BaseModel):
    cefr: str
    targets: list[GrammarTargetResult]
    coverage: float


class GrammarAuditReport(BaseModel):
    levels: dict[str, GrammarLevelReport] = {}


def audit_grammar(
    chapters_by_cefr: dict[str, list[str]],
    grammar_targets: dict[str, list[str]],
    llm=None,
) -> GrammarAuditReport:
    """Check which grammar targets appear in generated sentences."""
    if not grammar_targets or not chapters_by_cefr:
        return GrammarAuditReport()

    report = GrammarAuditReport()

    for cefr, targets in grammar_targets.items():
        if not targets:
            continue

        sentences = chapters_by_cefr.get(cefr, [])
        if not sentences:
            report.levels[cefr] = GrammarLevelReport(
                cefr=cefr,
                targets=[GrammarTargetResult(target=t, present=False) for t in targets],
                coverage=0.0,
            )
            continue

        targets_text = "\n".join(f"  {i+1}. {t}" for i, t in enumerate(targets))
        sentences_text = "\n".join(f"  - {s}" for s in sentences[:50])

        system = "You are a Spanish grammar expert analyzing sentences for specific grammatical structures."
        prompt = (
            f"CEFR Level: {cefr}\n\n"
            f"Grammar targets to check:\n{targets_text}\n\n"
            f"Sentences:\n{sentences_text}\n\n"
            f"For each grammar target, determine if it appears in any sentence above. "
            f"Return JSON:\n"
            f'{{"targets": [\n'
            f'  {{"target": "description", "present": true/false, "example": "sentence that shows it or empty string"}}\n'
            f']}}'
        )

        response = llm.complete_json(prompt, system=system)
        raw_targets = response.parsed.get("targets", [])

        results = []
        for rt in raw_targets:
            if not isinstance(rt, dict):
                continue
            results.append(GrammarTargetResult(
                target=rt.get("target", ""),
                present=rt.get("present", False),
                example=rt.get("example", ""),
            ))

        # Match LLM results back to config targets (fuzzy: LLM often truncates)
        matched_config_targets: set[str] = set()
        for r in results:
            for t in targets:
                rt_lower = r.target.lower()
                t_lower = t.lower()
                if rt_lower == t_lower or rt_lower in t_lower or t_lower in rt_lower:
                    # Normalize target name to config version
                    r.target = t
                    matched_config_targets.add(t)
                    break
        for t in targets:
            if t not in matched_config_targets:
                results.append(GrammarTargetResult(target=t, present=False))

        present_count = sum(1 for r in results if r.present)
        coverage = present_count / len(results) if results else 0.0

        report.levels[cefr] = GrammarLevelReport(
            cefr=cefr,
            targets=results,
            coverage=coverage,
        )

    return report
