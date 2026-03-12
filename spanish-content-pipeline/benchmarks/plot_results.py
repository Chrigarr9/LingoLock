"""Plot benchmark results: quality vs cost per task, with model comparison."""

import csv
import json
from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib
import numpy as np

matplotlib.rcParams["font.family"] = "sans-serif"
matplotlib.rcParams["font.size"] = 11

RESULTS_DIR = Path(__file__).resolve().parent / "results"

MODEL_LABELS = {
    # Cheap tier
    "google/gemini-2.5-flash-lite": "Gemini 2.5 FL",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "qwen/qwen3.5-flash-02-23": "Qwen 3.5 Flash",
    "qwen/qwen3.5-35b-a3b": "Qwen 3.5 35B",
    "google/gemini-3.1-flash-lite-preview": "Gemini 3.1 FL",
    "openai/gpt-5-mini": "GPT-5 Mini",
    "google/gemini-3-flash-preview": "Gemini 3 Flash",
    "anthropic/claude-haiku-4.5": "Claude Haiku 4.5",
    # Thinking tier
    "qwen/qwen3-max-thinking": "Qwen3 Max Think",
    "qwen/qwen3.5-plus-02-15": "Qwen 3.5 Plus",
    "qwen/qwen3.5-397b-a17b": "Qwen 3.5 397B",
    "deepseek/deepseek-v3.2-speciale": "DeepSeek V3.2",
    "moonshotai/kimi-k2.5": "Kimi K2.5",
    "minimax/minimax-m2.5": "MiniMax M2.5",
}

MODEL_COLORS = {
    # Cheap tier
    "google/gemini-2.5-flash-lite": "#34A853",
    "google/gemini-2.5-flash": "#FBBC04",
    "qwen/qwen3.5-flash-02-23": "#7C3AED",
    "qwen/qwen3.5-35b-a3b": "#FF6D00",
    "google/gemini-3.1-flash-lite-preview": "#4285F4",
    "openai/gpt-5-mini": "#10A37F",
    "google/gemini-3-flash-preview": "#1A73E8",
    "anthropic/claude-haiku-4.5": "#D97706",
    # Thinking tier
    "qwen/qwen3-max-thinking": "#A855F7",
    "qwen/qwen3.5-plus-02-15": "#C084FC",
    "qwen/qwen3.5-397b-a17b": "#E879F9",
    "deepseek/deepseek-v3.2-speciale": "#06B6D4",
    "moonshotai/kimi-k2.5": "#F43F5E",
    "minimax/minimax-m2.5": "#84CC16",
}

MODEL_MARKERS = {
    # Cheap tier
    "google/gemini-2.5-flash-lite": "v",
    "google/gemini-2.5-flash": ">",
    "qwen/qwen3.5-flash-02-23": "<",
    "qwen/qwen3.5-35b-a3b": "^",
    "google/gemini-3.1-flash-lite-preview": "o",
    "openai/gpt-5-mini": "s",
    "google/gemini-3-flash-preview": "D",
    "anthropic/claude-haiku-4.5": "P",
    # Thinking tier
    "qwen/qwen3-max-thinking": "*",
    "qwen/qwen3.5-plus-02-15": "X",
    "qwen/qwen3.5-397b-a17b": "h",
    "deepseek/deepseek-v3.2-speciale": "p",
    "moonshotai/kimi-k2.5": "d",
    "minimax/minimax-m2.5": "8",
}


def load_all_results() -> list[dict]:
    """Load all JSON result files."""
    results = []
    for path in RESULTS_DIR.rglob("*.json"):
        with open(path) as f:
            data = json.load(f)
            results.append(data)
    return results


def extract_quality_score(result: dict) -> float | None:
    """Extract primary quality metric per task type."""
    task = result["task"]
    m = result.get("deterministic_metrics", {})
    if not m:
        return None

    if task == "story_gen":
        # Subjective quality rating (1-10) if available, else dialogue ratio
        return m.get("subjective_quality", m.get("dialogue_ratio", 0))
    elif task == "simplification":
        # Fraction of sentences within CEFR word limit (higher = better)
        total = m.get("sentence_count", 0)
        exceeding = m.get("sentences_exceeding_word_limit", 0)
        return round((total - exceeding) / max(1, total), 3) if total else None
    elif task == "grammar":
        return m.get("coverage", 0)
    elif task == "gap_filler":
        return m.get("coverage_ratio", 0)
    elif task.startswith("translation_"):
        return m.get("chrf_score", 0)
    elif task == "word_extraction":
        # Composite score: translation accuracy + coverage + similar words
        return m.get("score", m.get("precision", 0))
    elif task in ("chapter_audit", "audit"):
        return m.get("f1", 0)
    return None


def extract_cost(result: dict) -> float | None:
    """Extract cost in USD."""
    cost = result.get("cost_estimate_usd")
    if cost is not None:
        return cost
    usage = result.get("usage", {})
    return usage.get("cost_usd")


def group_translation_results(results: list[dict]) -> dict:
    """Group translation results by model, averaging chrF and summing cost across pairs."""
    by_model = defaultdict(lambda: {"chrf_scores": [], "costs": [], "durations": []})
    for r in results:
        if not r["task"].startswith("translation_"):
            continue
        if r.get("error"):
            continue
        model = r["model"]
        score = extract_quality_score(r)
        cost = extract_cost(r)
        if score is not None and cost is not None:
            by_model[model]["chrf_scores"].append(score)
            by_model[model]["costs"].append(cost)
            by_model[model]["durations"].append(r.get("duration_seconds", 0))

    aggregated = {}
    for model, data in by_model.items():
        if data["chrf_scores"]:
            aggregated[model] = {
                "avg_chrf": round(np.mean(data["chrf_scores"]), 2),
                "total_cost": sum(data["costs"]),
                "total_duration": sum(data["durations"]),
                "pair_count": len(data["chrf_scores"]),
            }
    return aggregated


def plot_task_comparison(results: list[dict], task_name: str, ax, quality_label: str):
    """Plot quality vs cost for a single task."""
    task_results = [r for r in results if r["task"] == task_name and not r.get("error")]

    for r in task_results:
        model = r["model"]
        quality = extract_quality_score(r)
        cost = extract_cost(r)
        if quality is None or cost is None:
            continue

        label = MODEL_LABELS.get(model, model.split("/")[-1])
        color = MODEL_COLORS.get(model, "#999999")
        marker = MODEL_MARKERS.get(model, "o")

        ax.scatter(cost * 100, quality, c=color, marker=marker, s=120,
                   label=label, edgecolors="white", linewidths=0.5, zorder=5)

    ax.set_xlabel("Cost (¢)")
    ax.set_ylabel(quality_label)
    ax.set_title(task_name.replace("_", " ").title(), fontweight="bold")
    ax.grid(True, alpha=0.3)


def plot_translation_comparison(results: list[dict], ax):
    """Plot average chrF vs total cost for translation (aggregated across pairs)."""
    agg = group_translation_results(results)

    for model, data in agg.items():
        label = MODEL_LABELS.get(model, model.split("/")[-1])
        color = MODEL_COLORS.get(model, "#999999")
        marker = MODEL_MARKERS.get(model, "o")

        ax.scatter(data["total_cost"] * 100, data["avg_chrf"], c=color, marker=marker,
                   s=120, label=label, edgecolors="white", linewidths=0.5, zorder=5)

    ax.set_xlabel("Total Cost (¢)")
    ax.set_ylabel("Avg chrF++ Score")
    ax.set_title("Translation (10 pairs avg)", fontweight="bold")
    ax.grid(True, alpha=0.3)


def plot_translation_heatmap(results: list[dict], fig, ax):
    """Plot per-pair chrF scores as heatmap."""
    # Collect all translation results
    by_model_pair = defaultdict(dict)
    pairs_seen = set()
    models_seen = set()

    for r in results:
        if not r["task"].startswith("translation_") or r.get("error"):
            continue
        pair = r["task"].replace("translation_", "")
        model = r["model"]
        score = extract_quality_score(r)
        if score is not None:
            by_model_pair[model][pair] = score
            pairs_seen.add(pair)
            models_seen.add(model)

    if not pairs_seen:
        return

    pairs = sorted(pairs_seen)
    models = sorted(models_seen)

    data = np.zeros((len(models), len(pairs)))
    for i, model in enumerate(models):
        for j, pair in enumerate(pairs):
            data[i, j] = by_model_pair.get(model, {}).get(pair, 0)

    model_labels = [MODEL_LABELS.get(m, m.split("/")[-1]) for m in models]

    im = ax.imshow(data, cmap="RdYlGn", aspect="auto", vmin=0, vmax=80)
    ax.set_xticks(range(len(pairs)))
    ax.set_xticklabels(pairs, rotation=45, ha="right", fontsize=9)
    ax.set_yticks(range(len(models)))
    ax.set_yticklabels(model_labels, fontsize=9)
    ax.set_title("Translation chrF++ by Language Pair", fontweight="bold")

    for i in range(len(models)):
        for j in range(len(pairs)):
            val = data[i, j]
            color = "white" if val < 30 else "black"
            ax.text(j, i, f"{val:.0f}", ha="center", va="center", fontsize=8, color=color)

    fig.colorbar(im, ax=ax, shrink=0.8, label="chrF++")


def plot_summary_bar(results: list[dict], ax):
    """Plot total cost per model across all tasks."""
    model_costs = defaultdict(float)
    model_task_count = defaultdict(int)

    for r in results:
        if r.get("error"):
            continue
        cost = extract_cost(r)
        if cost:
            model_costs[r["model"]] += cost
            model_task_count[r["model"]] += 1

    models = sorted(model_costs.keys())
    costs_cents = [model_costs[m] * 100 for m in models]
    colors = [MODEL_COLORS.get(m, "#999999") for m in models]
    labels = [MODEL_LABELS.get(m, m.split("/")[-1]) for m in models]

    bars = ax.barh(range(len(models)), costs_cents, color=colors, edgecolor="white")
    ax.set_yticks(range(len(models)))
    ax.set_yticklabels(labels, fontsize=10)
    ax.set_xlabel("Total Cost (¢)")
    ax.set_title("Total Benchmark Cost by Model", fontweight="bold")
    ax.grid(True, alpha=0.3, axis="x")

    for bar, c in zip(bars, costs_cents):
        ax.text(bar.get_width() + 0.02, bar.get_y() + bar.get_height() / 2,
                f"{c:.2f}¢", va="center", fontsize=9)


THINKING_MODELS = {
    "qwen/qwen3-max-thinking", "qwen/qwen3.5-plus-02-15", "qwen/qwen3.5-397b-a17b",
    "deepseek/deepseek-v3.2-speciale", "moonshotai/kimi-k2.5", "minimax/minimax-m2.5",
}

NON_TRANSLATION_TASKS = [
    ("story_gen", "Story Quality (1-10)"),
    ("simplification", "CEFR Compliance"),
    ("grammar", "Grammar Coverage"),
    ("gap_filler", "Vocab Coverage"),
    ("word_extraction", "F1 Score"),
]

AUDIT_TASKS = [
    ("chapter_audit", "F1 Score"),
    ("audit", "F1 Score"),
    ("gap_filler", "Vocab Coverage"),
]


def _make_scatter_grid(results: list[dict], tasks: list[tuple], title: str, filename: str,
                       include_translation: bool = True):
    """Generate a quality-vs-cost scatter grid for given tasks and results."""
    n_plots = len(tasks) + (1 if include_translation else 0)
    cols = min(3, n_plots)
    rows = (n_plots + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(6 * cols, 5 * rows))
    if rows == 1 and cols == 1:
        axes = np.array([[axes]])
    elif rows == 1:
        axes = axes[np.newaxis, :]
    elif cols == 1:
        axes = axes[:, np.newaxis]
    fig.suptitle(title, fontsize=14, fontweight="bold", y=0.98)

    for idx, (task, label) in enumerate(tasks):
        r, c = divmod(idx, cols)
        plot_task_comparison(results, task, axes[r, c], label)

    if include_translation:
        idx = len(tasks)
        r, c = divmod(idx, cols)
        plot_translation_comparison(results, axes[r, c])

    # Hide unused subplots
    for idx in range(n_plots, rows * cols):
        r, c = divmod(idx, cols)
        axes[r, c].set_visible(False)

    # Collect all legend handles
    all_handles, all_labels = {}, {}
    for ax_row in axes:
        for ax in ax_row:
            h, l = ax.get_legend_handles_labels()
            for handle, label in zip(h, l):
                if label not in all_labels:
                    all_handles[label] = handle
                    all_labels[label] = label
    if all_handles:
        fig.legend(all_handles.values(), all_labels.values(), loc="lower center",
                   ncol=min(5, len(all_handles)), fontsize=9, bbox_to_anchor=(0.5, 0.01))

    fig.tight_layout(rect=[0, 0.06, 1, 0.96])
    fig.savefig(RESULTS_DIR / filename, dpi=150, bbox_inches="tight")
    print(f"Saved: {RESULTS_DIR / filename}")
    plt.close(fig)


def print_summary_table(results: list[dict], tasks: list[tuple], label: str):
    """Print a text summary table."""
    print(f"\n{'=' * 80}")
    print(f"SUMMARY ({label}): Quality Scores by Task × Model")
    print("=" * 80)

    all_models = sorted({r["model"] for r in results if not r.get("error")})
    header = f"{'Task':<25s}" + "".join(f"{MODEL_LABELS.get(m, m.split('/')[-1]):>18s}" for m in all_models)
    print(header)
    print("-" * len(header))

    for task, _ in tasks:
        row = f"{task:<25s}"
        for model in all_models:
            matching = [r for r in results if r["task"] == task and r["model"] == model and not r.get("error")]
            if matching:
                score = extract_quality_score(matching[0])
                cost = extract_cost(matching[0])
                cost_str = f"{cost*100:.2f}¢" if cost else "N/A"
                row += f"  {score:.3f} ({cost_str})" if score is not None else f"{'N/A':>18s}"
            else:
                row += f"{'—':>18s}"
        print(row)

    agg = group_translation_results(results)
    if agg:
        row = f"{'translation (avg)':.<25s}"
        for model in all_models:
            if model in agg:
                d = agg[model]
                row += f"  {d['avg_chrf']:.1f} ({d['total_cost']*100:.2f}¢)"
            else:
                row += f"{'—':>18s}"
        print(row)

    print("(Costs in US cents)")


def export_csv(results: list[dict], tasks: list[tuple], label: str):
    """Export a CSV summary: one row per model, columns for each task's score and cost."""
    all_models = sorted({r["model"] for r in results if not r.get("error")})
    task_names = [t[0] for t in tasks]

    rows = []
    for model in all_models:
        row = {"model": MODEL_LABELS.get(model, model.split("/")[-1])}
        for task in task_names:
            matching = [r for r in results if r["task"] == task and r["model"] == model and not r.get("error")]
            if matching:
                score = extract_quality_score(matching[0])
                cost = extract_cost(matching[0])
                row[f"{task}_score"] = f"{score:.3f}" if score is not None else ""
                row[f"{task}_cost_cents"] = f"{cost * 100:.2f}" if cost else ""
            else:
                row[f"{task}_score"] = ""
                row[f"{task}_cost_cents"] = ""

        # Translation aggregate
        agg = group_translation_results(results)
        if model in agg:
            d = agg[model]
            row["translation_avg_chrf"] = f"{d['avg_chrf']:.1f}"
            row["translation_total_cost_cents"] = f"{d['total_cost'] * 100:.2f}"
            row["translation_pairs"] = str(d["pair_count"])
        rows.append(row)

    if not rows:
        return

    filename = RESULTS_DIR / f"summary_{label.lower().replace(' ', '_')}.csv"
    fieldnames = list(rows[0].keys())
    with open(filename, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved: {filename}")


def main():
    results = load_all_results()
    if not results:
        print("No results found in", RESULTS_DIR)
        return

    print(f"Loaded {len(results)} result files")

    tasks = defaultdict(int)
    for r in results:
        tasks[r["task"]] += 1
    for task, count in sorted(tasks.items()):
        print(f"  {task}: {count} results")

    with_cost = sum(1 for r in results if extract_cost(r) is not None)
    print(f"\nResults with cost data: {with_cost}/{len(results)}")

    # Split results
    cheap_results = [r for r in results if r["model"] not in THINKING_MODELS]
    thinking_results = [r for r in results if r["model"] in THINKING_MODELS]

    # ── Figure 1: Cheap tier — quality vs cost ──
    _make_scatter_grid(cheap_results, NON_TRANSLATION_TASKS,
                       "Cheap Tier: Quality vs Cost", "cheap_quality_vs_cost.png",
                       include_translation=True)

    # ── Figure 2: Thinking tier — quality vs cost ──
    _make_scatter_grid(thinking_results, AUDIT_TASKS,
                       "Thinking Tier: Quality vs Cost", "thinking_quality_vs_cost.png",
                       include_translation=False)

    # ── Figure 3: All models combined — shared tasks only ──
    shared_tasks = [t for t in NON_TRANSLATION_TASKS if any(r["task"] == t[0] for r in thinking_results)]
    if shared_tasks:
        combined_tasks = shared_tasks + [t for t in AUDIT_TASKS if t not in shared_tasks]
    else:
        combined_tasks = NON_TRANSLATION_TASKS + AUDIT_TASKS
    # Deduplicate
    seen = set()
    deduped = []
    for t in combined_tasks:
        if t[0] not in seen:
            deduped.append(t)
            seen.add(t[0])
    _make_scatter_grid(results, deduped,
                       "All Models: Quality vs Cost", "all_quality_vs_cost.png",
                       include_translation=True)

    # ── Figure 4: Translation heatmap (cheap only — thinking don't do translation) ──
    fig4, ax4 = plt.subplots(1, 1, figsize=(14, max(3, len(set(r["model"] for r in cheap_results if r["task"].startswith("translation_"))) * 0.7)))
    plot_translation_heatmap(cheap_results, fig4, ax4)
    fig4.tight_layout()
    fig4.savefig(RESULTS_DIR / "translation_heatmap.png", dpi=150, bbox_inches="tight")
    print(f"Saved: {RESULTS_DIR / 'translation_heatmap.png'}")
    plt.close(fig4)

    # ── Figure 5: Total cost summary ──
    fig5, ax5 = plt.subplots(1, 1, figsize=(10, max(3, len(set(r["model"] for r in results)) * 0.4)))
    plot_summary_bar(results, ax5)
    fig5.tight_layout()
    fig5.savefig(RESULTS_DIR / "total_cost_by_model.png", dpi=150, bbox_inches="tight")
    print(f"Saved: {RESULTS_DIR / 'total_cost_by_model.png'}")
    plt.close(fig5)

    # ── Print summary tables ──
    print_summary_table(cheap_results, NON_TRANSLATION_TASKS, "Cheap Tier")
    print_summary_table(thinking_results, AUDIT_TASKS, "Thinking Tier")

    # ── CSV exports ──
    export_csv(cheap_results, NON_TRANSLATION_TASKS, "Cheap Tier")
    export_csv(thinking_results, AUDIT_TASKS, "Thinking Tier")


if __name__ == "__main__":
    main()
