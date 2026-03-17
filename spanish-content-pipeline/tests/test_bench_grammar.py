"""Tests for bench_grammar benchmark."""
from benchmarks.bench_grammar import compute_grammar_audit_metrics


def test_compute_grammar_audit_metrics():
    """Known targets: 3 total, 2 detected = 66.7% coverage."""
    from pipeline.grammar_auditor import GrammarAuditReport, GrammarLevelReport, GrammarTargetResult
    report = GrammarAuditReport(levels={
        "A2": GrammarLevelReport(
            cefr="A2",
            targets=[
                GrammarTargetResult(target="pretérito indefinido", present=True, example="fui"),
                GrammarTargetResult(target="reflexive verbs", present=True, example="se llama"),
                GrammarTargetResult(target="modal verbs", present=False),
            ],
            coverage=0.667,
        )
    })
    metrics = compute_grammar_audit_metrics(report)
    assert metrics["targets_total"] == 3
    assert metrics["targets_detected"] == 2
    assert metrics["targets_missing"] == 1
