"""NeoBee CLI — run brainstorming sessions from the command line."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path

import typer

from neobee.storage import session as storage
from neobee.models import SessionMeta, SessionStatus
from neobee.cli.session_cmd import session_app

app = typer.Typer(
    name="neobee",
    help="NeoBee — AI-native brainstorming on the command line",
    no_args_is_help=True,
)

# Register subcommands
app.add_typer(session_app, name="session")


@app.command()
def run(
    topic: str = typer.Argument(..., help="Topic to brainstorm about"),
    experts: int = typer.Option(3, "--experts", "-e", help="Number of expert personas", min=1, max=100),
    rounds: int = typer.Option(3, "--rounds", "-r", help="Number of debate rounds", min=1, max=10),
    language: str = typer.Option("en", "--lang", "-l", help="Language (en/zh)"),
    info: str = typer.Option("", "--info", "-i", help="Additional context about the topic"),
):
    """Run a complete brainstorming pipeline."""
    from neobee.pipeline.graph import run_pipeline

    # Create session
    path, name = storage.create_session_dir(topic, experts, rounds)
    meta = SessionMeta(
        topic=topic,
        expert_count=experts,
        round_count=rounds,
        additional_info=info,
        language=language,
        status=SessionStatus.RUNNING,
    )
    storage.write_session_meta(path, meta)

    print(f"\nSession: {name}\n")

    # Run pipeline
    start = time.time()
    try:
        final_state = asyncio.run(run_pipeline(str(path), meta))

        # Update session status
        if final_state.get("error"):
            meta.status = SessionStatus.FAILED
            print(f"\n[pipeline] Failed: {final_state['error']}")
        else:
            meta.status = SessionStatus.COMPLETED
        meta.updated_at = datetime.now(timezone.utc).isoformat()
        storage.write_session_meta(path, meta)

        elapsed = time.time() - start
        ideas = final_state.get("ideas", [])

        print(f"\n{'=' * 40}")
        print(f"Session: {name}")
        print(f"Status: {meta.status.value}")
        print(f"Duration: {elapsed:.1f}s")
        if ideas:
            print(f"\nTop Ideas:")
            for i, idea in enumerate(ideas[:5], 1):
                print(f"  {i}. [{idea.total_score:.1f}/10] {idea.title}")
        print(f"\nOutput: {path}")

    except Exception as e:
        meta.status = SessionStatus.FAILED
        storage.write_session_meta(path, meta)
        print(f"\n[pipeline] Unhandled error: {e}")


@app.callback(invoke_without_command=True)
def main_callback(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        print(app.get_help_text())


def main() -> None:
    app()