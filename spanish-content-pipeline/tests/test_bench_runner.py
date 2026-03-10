"""Tests for benchmark runner configuration."""


def test_task_config_key_covers_all_tasks():
    """Every task in ALL_TASKS must have a config key mapping."""
    from benchmarks.run_benchmarks import ALL_TASKS, TASK_CONFIG_KEY

    for task_name in ALL_TASKS:
        assert task_name in TASK_CONFIG_KEY, f"Missing config key for task: {task_name}"


def test_tier_tasks_are_valid():
    """Every task listed in TIER_TASKS must exist in ALL_TASKS."""
    from benchmarks.run_benchmarks import ALL_TASKS, TIER_TASKS

    for tier, tasks in TIER_TASKS.items():
        for task in tasks:
            assert task in ALL_TASKS, f"Unknown task '{task}' in tier '{tier}'"
