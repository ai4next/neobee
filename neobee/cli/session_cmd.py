"""Session management CLI commands."""

from __future__ import annotations

import typer

from neobee.storage import session as storage

session_app = typer.Typer(help="List and inspect brainstorming sessions")


@session_app.command("list")
def list_sessions(
    limit: int = typer.Option(20, "--limit", "-n", help="Max sessions to show"),
) -> None:
    """List all brainstorming sessions, newest first."""
    sessions = storage.list_session_dirs()
    if not sessions:
        print("No sessions found.")
        raise typer.Exit()

    print(f"{'Name':<50} {'Status':<12} {'Topic':<40} {'Created'}")
    print("-" * 120)
    for name, meta in sessions[:limit]:
        print(f"{name:<50} {meta.status.value:<12} {meta.topic[:38]:<40} {meta.created_at[:16]}")


@session_app.command()
def show(
    name: str = typer.Argument(..., help="Session name (from `neobee session list`)"),
) -> None:
    """Show details of a specific session."""
    path = storage.get_session_path(name)
    if not path:
        print(f"Session not found: {name}")
        raise typer.Exit()

    meta = storage.read_session_meta(path)
    if not meta:
        print(f"No metadata found for session: {name}")
        raise typer.Exit()

    print(f"Session:      {name}")
    print(f"Topic:        {meta.topic}")
    print(f"Status:       {meta.status.value}")
    print(f"Experts:      {meta.expert_count}")
    print(f"Rounds:       {meta.round_count}")
    print(f"Language:     {meta.language}")
    print(f"Created:      {meta.created_at}")
    print(f"Updated:      {meta.updated_at}")
    print()

    # Show available output files
    stage_dirs = ["research", "experts", "insights", "ideas"]
    for stage in stage_dirs:
        stage_path = path / stage
        if stage_path.exists():
            files = list(stage_path.iterdir())
            if files:
                print(f"  {stage}/:")
                for f in files:
                    size = f.stat().st_size
                    print(f"    {f.name} ({size} bytes)")

    print()
    print(f"Full path: {path}")