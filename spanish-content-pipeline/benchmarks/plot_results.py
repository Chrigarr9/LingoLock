"""Plot benchmark results: quality vs cost per task, with model comparison."""

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
    "google/gemini-3.1-flash-lite-preview": "Gemini Flash Lite",
    "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
    "bytedance-seed/seed-1.6-flash": "Seed 1.6 Flash",
    "qwen/qwen3-30b-a3b": "Qwen3 30B",
}

MODEL_COLORS = {
    "google/gemini-3.1-flash-lite-preview": "#4285F4",
    "meta-llama/llama-3.3-70b-instruct": "#0467DF",
    "bytedance-seed/seed-1.6-flash": "#00C853",
    "qwen/qwen3-30b-a3b": "#FF6D00",
}

MODEL_MARKERS = {
    "google/gemini-3.1-flash-lite-preview": "o",
    "meta-llama/llama-3.3-70b-instruct": "s",
    "bytedance-seed/seed-1.6-flash": "D",
    "qwen/qwen3-30b-a3b": "^",
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
        # Composite: dialogue ratio (0-1) as quality signal
        return m.get("dialogue_ratio", 0)
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
        p = m.get("precision", 0)
        r = m.get("recall", 0)
        return round(2 * p * r / max(p + r, 0.001), 3)  # F1
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

        ax.scatter(cost * 1000, quality, c=color, marker=marker, s=120,
                   label=label, edgecolors="white", linewidths=0.5, zorder=5)

    ax.set_xlabel("Cost (USD × 10⁻³)")
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

        ax.scatter(data["total_cost"] * 1000, data["avg_chrf"], c=color, marker=marker,
                   s=120, label=label, edgecolors="white", linewidths=0.5, zorder=5)

    ax.set_xlabel("Total Cost (USD × 10⁻³)")
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
    costs = [model_costs[m] * 1000 for m in models]
    colors = [MODEL_COLORS.get(m, "#999999") for m in models]
    labels = [MODEL_LABELS.get(m, m.split("/")[-1]) for m in models]

    bars = ax.barh(range(len(models)), costs, color=colors, edgecolor="white")
    ax.set_yticks(range(len(models)))
    ax.set_yticklabels(labels, fontsize=10)
    ax.set_xlabel("Total Cost (USD × 10⁻³)")
    ax.set_title("Total Benchmark Cost by Model", fontweight="bold")
    ax.grid(True, alpha=0.3, axis="x")

    for bar, cost in zip(bars, costs):
        ax.text(bar.get_width() + 0.1, bar.get_y() + bar.get_height() / 2,
                f"${cost:.2f}×10⁻³", va="center", fontsize=9)


def main():
    results = load_all_results()
    if not results:
        print("No results found in", RESULTS_DIR)
        return

    print(f"Loaded {len(results)} result files")

    # Count by task
    tasks = defaultdict(int)
    for r in results:
        tasks[r["task"]] += 1
    for task, count in sorted(tasks.items()):
        print(f"  {task}: {count} results")

    # Check cost availability
    with_cost = sum(1 for r in results if extract_cost(r) is not None)
    print(f"\nResults with cost data: {with_cost}/{len(results)}")

    # ── Figure 1: Quality vs Cost scatter plots ──
    non_translation_tasks = [
        ("story_gen", "Dialogue Ratio"),
        ("simplification", "CEFR Compliance"),
        ("grammar", "Grammar Coverage"),
        ("gap_filler", "Vocab Coverage"),
        ("word_extraction", "F1 Score"),
    ]

    fig1, axes = plt.subplots(2, 3, figsize=(16, 10))
    fig1.suptitle("Cheap Tier: Quality vs Cost per Task", fontsize=14, fontweight="bold", y=0.98)

    for idx, (task, label) in enumerate(non_translation_tasks):
        row, col = divmod(idx, 3)
        plot_task_comparison(results, task, axes[row, col], label)

    # Translation in the 6th subplot
    plot_translation_comparison(results, axes[1, 2])

    # Shared legend
    handles, labels = axes[0, 0].get_legend_handles_labels()
    if handles:
        fig1.legend(handles, labels, loc="lower center", ncol=4, fontsize=10,
                    bbox_to_anchor=(0.5, 0.01))

    fig1.tight_layout(rect=[0, 0.06, 1, 0.96])
    fig1.savefig(RESULTS_DIR / "quality_vs_cost.png", dpi=150, bbox_inches="tight")
    print(f"\nSaved: {RESULTS_DIR / 'quality_vs_cost.png'}")

    # ── Figure 2: Translation heatmap ──
    fig2, ax2 = plt.subplots(1, 1, figsize=(14, 5))
    plot_translation_heatmap(results, fig2, ax2)
    fig2.tight_layout()
    fig2.savefig(RESULTS_DIR / "translation_heatmap.png", dpi=150, bbox_inches="tight")
    print(f"Saved: {RESULTS_DIR / 'translation_heatmap.png'}")

    # ── Figure 3: Total cost summary ──
    fig3, ax3 = plt.subplots(1, 1, figsize=(10, 4))
    plot_summary_bar(results, ax3)
    fig3.tight_layout()
    fig3.savefig(RESULTS_DIR / "total_cost_by_model.png", dpi=150, bbox_inches="tight")
    print(f"Saved: {RESULTS_DIR / 'total_cost_by_model.png'}")

    # ── Print summary table ──
    print("\n" + "=" * 80)
    print("SUMMARY: Quality Scores by Task × Model")
    print("=" * 80)

    all_models = sorted({r["model"] for r in results if not r.get("error")})
    header = f"{'Task':<25s}" + "".join(f"{MODEL_LABELS.get(m, m.split('/')[-1]):>18s}" for m in all_models)
    print(header)
    print("-" * len(header))

    for task, label in non_translation_tasks:
        row = f"{task:<25s}"
        for model in all_models:
            matching = [r for r in results if r["task"] == task and r["model"] == model and not r.get("error")]
            if matching:
                score = extract_quality_score(matching[0])
                cost = extract_cost(matching[0])
                cost_str = f"${cost*1000:.2f}" if cost else "N/A"
                row += f"  {score:.3f} ({cost_str})" if score is not None else f"{'N/A':>18s}"
            else:
                row += f"{'—':>18s}"
        print(row)

    # Translation aggregated
    agg = group_translation_results(results)
    row = f"{'translation (avg)':.<25s}"
    for model in all_models:
        if model in agg:
            d = agg[model]
            row += f"  {d['avg_chrf']:.1f} (${d['total_cost']*1000:.2f})"
        else:
            row += f"{'—':>18s}"
    print(row)

    print("\n(Costs shown as USD × 10⁻³)")


if __name__ == "__main__":
    main()
