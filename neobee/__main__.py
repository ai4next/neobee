"""Main entry point for the NeoBee CLI."""

from __future__ import annotations

from neobee.cli.app import app


def main() -> None:
    app()


if __name__ == "__main__":
    main()