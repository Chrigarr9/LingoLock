"""Tests for benchmark runner configuration and parallelization."""

import threading


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


def test_run_models_parallel_invokes_all():
    """run_models_parallel should call the function once per model entry."""
    from benchmarks.common import run_models_parallel

    call_log = []

    def mock_fn(entry):
        call_log.append(entry["model"])
        return entry["model"]

    models = [
        {"model": "model-a", "provider": "openrouter"},
        {"model": "model-b", "provider": "openrouter"},
        {"model": "model-c", "provider": "openrouter"},
    ]
    results = run_models_parallel(models, mock_fn, max_workers=3)

    assert len(results) == 3
    assert set(call_log) == {"model-a", "model-b", "model-c"}
    assert set(results) == {"model-a", "model-b", "model-c"}


def test_run_models_parallel_actually_concurrent():
    """Verify models run concurrently, not sequentially."""
    import time
    from benchmarks.common import run_models_parallel

    active_threads = []

    def slow_fn(entry):
        active_threads.append(threading.current_thread().name)
        time.sleep(0.1)
        return entry["model"]

    models = [{"model": f"m{i}", "provider": "x"} for i in range(4)]
    start = time.monotonic()
    run_models_parallel(models, slow_fn, max_workers=4)
    elapsed = time.monotonic() - start

    # 4 tasks × 0.1s each: sequential would take ~0.4s, parallel should be ~0.1s
    assert elapsed < 0.3, f"Expected parallel execution, but took {elapsed:.2f}s"
    # Should have used multiple threads
    assert len(set(active_threads)) > 1


def test_run_models_parallel_handles_errors(capsys):
    """Errors in one model should not prevent others from completing."""
    from benchmarks.common import run_models_parallel

    def sometimes_fail(entry):
        if entry["model"] == "bad":
            raise ValueError("intentional failure")
        return entry["model"]

    models = [
        {"model": "good-a", "provider": "x"},
        {"model": "bad", "provider": "x"},
        {"model": "good-b", "provider": "x"},
    ]
    results = run_models_parallel(models, sometimes_fail, max_workers=3)

    assert len(results) == 2
    assert set(results) == {"good-a", "good-b"}
    captured = capsys.readouterr()
    assert "ERROR [bad]" in captured.out


def test_all_benchmarks_accept_parallel_kwarg():
    """Every benchmark function in ALL_TASKS must accept parallel and max_workers kwargs."""
    import inspect
    from benchmarks.run_benchmarks import ALL_TASKS

    for name, fn in ALL_TASKS.items():
        sig = inspect.signature(fn)
        params = set(sig.parameters.keys())
        assert "parallel" in params, f"{name} benchmark missing 'parallel' parameter"
        assert "max_workers" in params, f"{name} benchmark missing 'max_workers' parameter"
