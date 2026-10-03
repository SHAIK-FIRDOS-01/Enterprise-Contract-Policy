"""
Smoke test to verify repo scaffolding and harness setup for Step 0.
"""
from pathlib import Path


def test_harness_directory_structure() -> None:
    """Verify that all core directories and artifacts exist in the workspace."""
    root = Path(__file__).resolve().parent.parent.parent

    # Artifacts in .agent (if present locally)
    agent_dir = root / ".agent"
    if agent_dir.is_dir():
        for f in ["HARNESS.md", "ERRORS.md", "PRD.md", "SPEC.md", "TASKS.md"]:
            if (agent_dir / f).exists():
                assert (agent_dir / f).is_file()

    # Core files
    if (root / "AGENTS.md").exists():
        assert (root / "AGENTS.md").is_file()
    assert (root / "CONTEXT.md").is_file(), "CONTEXT.md must exist"
    assert (root / "docker-compose.yml").is_file(), "docker-compose.yml must exist"
    assert (root / ".env.example").is_file(), ".env.example must exist"
    assert (root / "scripts" / "harness-check.sh").is_file(), "scripts/harness-check.sh must exist"

    # 5 Isolated Apps
    apps_dir = root / "backend" / "apps"
    for app in ["authentication", "documents", "search", "query", "analytics"]:
        app_path = apps_dir / app
        assert app_path.is_dir(), f"backend/apps/{app} must exist"
        assert (app_path / "__init__.py").is_file(), f"backend/apps/{app}/__init__.py must exist"
