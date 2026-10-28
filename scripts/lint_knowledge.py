#!/usr/bin/env python3
"""Mechanical checks for the knowledge architecture (Python 3.10+).

Exit 1 if any error. Warnings print but do not fail unless --strict.

Vendored copies: this file embeds VERSION. Re-vendor from PIN_URL
(`curl -fsSL -o scripts/lint_knowledge.py <PIN_URL>`) and run --version.
There is no auto-update. PIN_URL is the last published artifact; development
versions differ from it. A version string is not an integrity checksum.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import unquote, urlsplit

VERSION = "0.2.0"
# Last published artifact; a development version is not available at this URL.
PIN_URL = (
    "https://raw.githubusercontent.com/AndysTMC/knowledge-architecture/"
    "v0.2.0/scripts/lint_knowledge.py"
)

KNOWN_TYPES = {
    "identity",
    "map",
    "now",
    "log",
    "decision",
    "knowledge",
    "belief",
    "source",
    "work",
    "output",
    "capture",
    "protocol",
}

# Conventional homes from the spec. Untyped files outside these paths stay a human review.
PATH_TYPE_EXACT = {
    "docs/identity.md": "identity",
    "docs/now.md": "now",
    "docs/log.md": "log",
    "docs/architecture.md": "belief",
    "docs/schema.md": "belief",
    "docs/glossary.md": "belief",
}

ANTI_FILES = (
    "FILES.md",
    "hot-cache.md",
    "MAP.md",
    "AI_CONTEXT.md",
    "NOTES.md",
    "ACTIVE_TASK.md",
    "SCRATCHPAD.md",
)

SKIP_DIR_NAMES = {
    ".git", "node_modules", ".venv", "venv", "__pycache__", ".tox",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", "dist", "build", "target",
    ".next", ".cache",
}
DECISION_DIRS = ("docs/decisions", "docs/adr", "adr", "decisions")

POINTER_MAX_LINES = 15
AGENTS_MAX_LINES = 200
README_WARN_LINES = 150

DECISION_TITLE = re.compile(r"^#\s+(\d{4})\.\s+", re.MULTILINE)
DECISION_FILENAME = re.compile(r"^(\d{4})-.+\.md$")
UPDATED = re.compile(r"^updated:\s*(\d{4}-\d{2}-\d{2})", re.MULTILINE)
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$")
SETEXT_UNDERLINE = re.compile(r"^ {0,3}(?:=+|-+)[ \t]*$")
HTML_COMMENT = re.compile(r"<!--[\s\S]*?-->")
CUSTOM_ID = re.compile(r"\{#([A-Za-z0-9._:-]+)\}\s*$")
HTML_ID = re.compile(r"<(?:a|h[1-6])\s+[^>]*(?:id|name)=[\"']([^\"']+)[\"']", re.IGNORECASE)
SUP_FIELD = re.compile(r"^Supersedes:\s*(.+)\s*$", re.MULTILINE | re.IGNORECASE)
SUP_BY_FIELD = re.compile(r"^Superseded-by:\s*(.+)\s*$", re.MULTILINE | re.IGNORECASE)
STATUS_LINE = re.compile(r"^Status[ \t]*:[ \t]*([^\r\n]*)$", re.MULTILINE | re.IGNORECASE)
DATE_LINE = re.compile(r"^Date:\s*(\d{4}-\d{2}-\d{2})", re.MULTILINE | re.IGNORECASE)
NULL_PATHS = {"/dev/null", "dev/null"}
PROTECTED_STATUS = frozenset({"accepted", "superseded"})
FENCE_OPEN = re.compile(r"^([ \t]{0,3})(`{3,}|~{3,})")
BLANK_ID = re.compile(r"^(?:—|--|-|none|n/a)?$", re.IGNORECASE)
LINE_ANCHOR = re.compile(r"^L\d+(?:-L\d+)?$")

# --format json contract (stable for v0.1.x):
# { "ok": bool, "errors": [str], "warnings": [str], "fixed": [str] }


@dataclass
class LintResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    fixed: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def repo_root() -> Path:
    parent = Path(__file__).resolve().parent
    return parent.parent if parent.name == "scripts" else parent


def git_ignored_dirs(root: Path) -> set[Path]:
    """Directories Git ignores under root; empty outside a work tree or without git."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--others", "--ignored", "--exclude-standard",
             "--directory", "-z"],
            check=False, capture_output=True,
        )
    except OSError:
        return set()
    if proc.returncode:
        return set()
    entries = proc.stdout.decode("utf-8", "surrogateescape").split("\0")
    return {(root / entry.rstrip("/")) for entry in entries if entry.endswith("/")}


def iter_files(root: Path):
    # Include untracked work, but prune dependencies and Git-ignored directories
    # before descending into them. Ignored files outside those directories stay
    # in scope. A marker scopes fixture exclusions to their owner, not all tests/.
    ignored = git_ignored_dirs(root)
    for directory, dirs, names in os.walk(root, followlinks=False):
        base = Path(directory)
        if base != root and ".knowledge-fixtures" in names:
            dirs[:] = []
            continue
        dirs[:] = sorted(
            d for d in dirs
            if d not in SKIP_DIR_NAMES and not (base / d).is_symlink() and base / d not in ignored
        )
        for name in sorted(names):
            path = base / name
            if path.is_file() and not path.is_symlink():
                yield path


def read_text(path: Path) -> str:
    # utf-8-sig drops a leading BOM that would otherwise hide frontmatter.
    return path.read_text(encoding="utf-8-sig")


def line_count(text: str) -> int:
    return len(text.splitlines())


def split_frontmatter(text: str) -> tuple[str | None, str]:
    """Return (frontmatter block, body). The block is None without a closed fence."""
    if not text.startswith("---\n"):
        return None, text
    end = re.search(r"^---[ \t]*$", text[4:], re.MULTILINE)
    if not end:
        return None, text
    return text[4:4 + end.start()], text[4 + end.end():]


def frontmatter_type(text: str) -> str | None:
    block, _ = split_frontmatter(text)
    if block is None:
        return None
    m = re.search(r"^type:\s*(\S+)\s*$", block, re.MULTILINE)
    return m.group(1).strip().strip("\"'") if m else None


def expected_type(rel: Path) -> str | None:
    key = rel.as_posix()
    if key in PATH_TYPE_EXACT:
        return PATH_TYPE_EXACT[key]
    parts = rel.parts
    if rel.suffix.lower() == ".md" and rel.parent.as_posix() in DECISION_DIRS:
        return None if rel.name.startswith("_") else "decision"
    if len(parts) >= 3 and parts[0] == "docs" and rel.suffix.lower() == ".md":
        if parts[1] == "decisions":
            if rel.name.startswith("_"):
                return None
            return "decision"
        if parts[1] == "wiki" and len(parts) >= 4:
            if parts[2] == "raw":
                return "source"
            if parts[2] == "pages":
                return "knowledge"
        if parts[1] == "skills":
            return "work"
        if parts[1] == "capture":
            return "capture"
    return None


def prose_without_fences(text: str) -> str:
    """Drop fenced code. Nested shorter fences and ~~~ fences stay inside the opener."""
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    i = 0
    while i < len(lines):
        m = FENCE_OPEN.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue
        marker = m.group(2)
        ch = marker[0]
        n = len(marker)
        close = re.compile(rf"^[ \t]{{0,3}}{re.escape(ch)}{{{n},}}[ \t]*$")
        i += 1
        while i < len(lines):
            if close.match(lines[i].rstrip("\r\n")):
                i += 1
                break
            i += 1
    return "".join(out)


def markdown_links(text: str) -> list[str]:
    """Read inline/image and reference destinations, excluding code examples.

    This is a bounded Markdown subset, not a complete CommonMark parser.
    """
    prose = prose_without_fences(text)
    prose = re.sub(r"(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)", "", prose)
    prose = HTML_COMMENT.sub("", prose)
    definitions: dict[str, str] = {}
    def definition(match: re.Match) -> str:
        definitions[" ".join(match.group(1).lower().split())] = match.group(2).strip()
        return ""
    prose = re.sub(r"^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(.+)$", definition, prose, flags=re.MULTILINE)
    links: list[str] = []
    pos = 0
    opener = re.compile(r"!?\[([^\]\n]*)\]")
    while match := opener.search(prose, pos):
        pos = match.end()
        label = match.group(1)
        if pos < len(prose) and prose[pos] == "(":
            start = pos + 1
            depth, quote, angle = 1, "", False
            i = start
            while i < len(prose):
                ch = prose[i]
                if ch == "\\":
                    i += 2
                    continue
                if quote:
                    if ch == quote:
                        quote = ""
                elif ch in "\"'" and i > start and prose[i - 1].isspace():
                    quote = ch
                elif ch == "<":
                    angle = True
                elif ch == ">":
                    angle = False
                elif not angle and ch == "(":
                    depth += 1
                elif not angle and ch == ")":
                    depth -= 1
                    if depth == 0:
                        links.append(prose[start:i])
                        pos = i + 1
                        break
                i += 1
        else:
            ref = re.match(r"\[([^\]]*)\]", prose[pos:])
            if ref:
                label = ref.group(1) or label
                pos += ref.end()
            key = " ".join(label.lower().split())
            if key in definitions:
                links.append(definitions[key])
    return links


def github_slug(heading: str) -> str:
    # github-slugger: drop punctuation, then each whitespace becomes one hyphen.
    # Do not collapse the resulting "--" (e.g. "ritual + mechanics" → "ritual--mechanics").
    text = CUSTOM_ID.sub("", heading).strip().lower()
    text = re.sub(r"(?<!!)\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])", r"\1", text)  # link text only
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    return re.sub(r"\s", "-", text)


def heading_slugs(text: str) -> set[str]:
    text = HTML_COMMENT.sub("", prose_without_fences(split_frontmatter(text)[1]))
    slugs: set[str] = set()
    seen: dict[str, int] = {}
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = HEADING.match(line)
        previous = lines[i - 1].strip() if i else ""
        if m:
            raw = re.sub(r"[ \t]+#+[ \t]*$", "", m.group(2)).strip()
        elif (
            SETEXT_UNDERLINE.match(line)
            and previous
            and not HEADING.match(lines[i - 1])
            and not SETEXT_UNDERLINE.match(lines[i - 1])
            and not re.match(r"(?:[-*+>|]|\d+[.)])(?:\s|$)", previous)
        ):
            raw = previous
        else:
            continue
        custom = CUSTOM_ID.search(raw)
        slug = custom.group(1) if custom else github_slug(raw)
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        slugs.add(f"{slug}-{n}" if n else slug)
        if custom:
            slugs.add(custom.group(1))
    for m in HTML_ID.finditer(text):
        slugs.add(m.group(1))
    return slugs


def resolve_link(src: Path, raw: str, root: Path) -> tuple[Path | None, str | None]:
    target = raw.strip()
    if target.startswith("<") and ">" in target:
        target = target[1:target.index(">")]
    else:
        target = re.sub(r'''\s+(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$''', "", target)
    if not target:
        return None, None
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target) or target.startswith("//"):
        return None, None
    parsed = urlsplit(target)
    fragment = unquote(parsed.fragment) or None
    target = unquote(parsed.path)
    if not target:
        return src, fragment
    path = Path(target)
    resolved = ((root / target.lstrip("/")) if path.is_absolute() else (src.parent / path)).resolve()
    return resolved, fragment


def parse_id_list(value: str) -> list[str]:
    value = value.strip()
    if BLANK_ID.match(value):
        return []
    return re.findall(r"(?<![\d-])\d{4}(?![\d-])", value)


def parse_status(text: str) -> str:
    m = STATUS_LINE.search(prose_without_fences(text))
    if not m:
        return ""
    return m.group(1).strip().lower()


def status_token(status: str) -> str:
    status = status.strip().lower()
    if not status:
        return ""
    if status.startswith("superseded"):
        return "superseded"
    return re.split(r"[\s,/|]+", status, maxsplit=1)[0]


def source_pointers(text: str) -> list[str]:
    pointers: list[str] = []
    block, _ = split_frontmatter(text)
    if block is not None:
        for match in re.finditer(r"^(?:source|sources):[ \t]*([^\n]*)(\n(?:[ \t]+-[ \t]+[^\n]*\n?)*)", block + "\n", re.MULTILINE | re.IGNORECASE):
            value = match.group(1).strip()
            values = value.strip("[]").split(",") if value else re.findall(r"^[ \t]+-[ \t]+(.+)$", match.group(2), re.MULTILINE)
            for item in values:
                item = item.strip().strip("\"'")
                if item and item.lower() not in {"null", "none", "~"}:
                    pointers.append(item)
    for raw in markdown_links(text):
        dest = raw.strip()
        if dest.startswith(("http://", "https://")):
            pointers.append(dest)
        elif re.search(r"(?:^|/)raw(?:/|$)", dest):
            pointers.append(dest)
    return pointers


def wiki_page_has_source(text: str) -> bool:
    return bool(source_pointers(text))


def lint(root: Path, stale_days: int = 14, strict: bool = False, fix: bool = False) -> LintResult:
    root = root.resolve()
    result = LintResult()
    if not root.is_dir():
        result.errors.append(f"lint root is not a directory: {root}")
        return result
    files = list(iter_files(root))

    def err(msg: str) -> None:
        result.errors.append(msg)

    def warn(msg: str) -> None:
        if strict:
            result.errors.append(msg)
        else:
            result.warnings.append(msg)

    reported_reads: set[Path] = set()

    def safe_read(path: Path) -> str:
        try:
            if not path.resolve().is_relative_to(root):
                raise ValueError("path escapes repository")
            return read_text(path)
        except (OSError, UnicodeError, ValueError) as exc:
            if path not in reported_reads:
                err(f"undecodable or unreadable file {path.relative_to(root)}: {exc}")
                reported_reads.add(path)
            return ""

    now = root / "docs" / "now.md"

    for path in files:
        if path.name in ANTI_FILES:
            err(f"anti-file present: {path.relative_to(root)}")

    names = {p.name for p in files}
    if "TODO.md" in names and "BACKLOG.md" in names:
        extra = " + docs/now.md" if now.is_file() else ""
        err(f"too many working memories: TODO.md + BACKLOG.md{extra}")

    tmpl = root / "docs" / "decisions" / "0000-template.md"
    if tmpl.is_file():
        err("empty ceremony: docs/decisions/0000-template.md")

    for rel in (*DECISION_DIRS, "docs/wiki", "docs/skills"):
        d = root / rel
        if d.is_dir():
            inhabitants = [p for p in d.rglob("*") if p.is_file() and p.name != ".gitkeep"]
            if not inhabitants:
                err(f"empty ring (birth rule): {rel}/")
            elif rel in DECISION_DIRS and all(p.name.startswith("_") for p in inhabitants):
                err(f"empty ceremony: {rel}/ has only index/underscore files")

    agents = root / "AGENTS.md"
    if agents.is_file():
        n = line_count(safe_read(agents))
        if n > AGENTS_MAX_LINES:
            err(f"AGENTS.md is {n} lines (max {AGENTS_MAX_LINES})")
    else:
        warn("AGENTS.md missing (ok only if no agent will work here)")

    readme = root / "README.md"
    if readme.is_file() and line_count(safe_read(readme)) > README_WARN_LINES:
        warn(f"README.md is {line_count(safe_read(readme))} lines (door becoming a wiki)")

    for p in (
        root / "CLAUDE.md",
        root / "GEMINI.md",
        root / ".github" / "copilot-instructions.md",
    ):
        if not p.is_file():
            continue
        if p.is_symlink() and p.resolve() == agents.resolve():
            continue  # a symlink to the hub is a pointer by construction (§18)
        text = safe_read(p)
        n = line_count(text)
        if n > POINTER_MAX_LINES:
            err(f"pointer too long ({n} lines): {p.relative_to(root)}")
        if "AGENTS.md" not in text:
            err(f"pointer does not mention AGENTS.md: {p.relative_to(root)}")

    if (root / "CLAUDE.md").is_file() and (root / ".claude" / "CLAUDE.md").is_file():
        err("both CLAUDE.md and .claude/CLAUDE.md exist (Claude concatenates both)")

    settings = root / ".gemini" / "settings.json"
    if settings.is_file() and (root / "GEMINI.md").is_file():
        try:
            data = json.loads(safe_read(settings))
            if not isinstance(data, dict) or not isinstance(data.get("context", {}), dict):
                raise ValueError("expected an object with an object context")
            listed = data.get("context", {}).get("fileName")
            if isinstance(listed, list) and "AGENTS.md" in listed and "GEMINI.md" in listed:
                err("Gemini would load AGENTS.md twice (settings fileName lists both and GEMINI.md exists)")
        except (json.JSONDecodeError, ValueError):
            warn("could not parse .gemini/settings.json")

    if now.is_file():
        text = safe_read(now)
        m = UPDATED.search(text)
        if not m:
            err("docs/now.md missing updated: YYYY-MM-DD")
        else:
            try:
                updated = date.fromisoformat(m.group(1))
            except ValueError:
                updated = None
                err("docs/now.md has an invalid updated date")
            if updated and updated > date.today():
                warn("docs/now.md updated date is in the future")
            if updated and date.today() - updated > timedelta(days=stale_days):
                msg = f"docs/now.md is stale ({updated}, >{stale_days} days)"
                if fix:
                    today = date.today().isoformat()
                    now.write_text(UPDATED.sub(f"updated: {today}", text, count=1), encoding="utf-8")
                    result.fixed.append(f"docs/now.md updated: → {today} (date only; content not reviewed)")
                else:
                    err(msg) if strict else warn(msg)
        kind = frontmatter_type(text)
        if kind and kind != "now":
            err(f"docs/now.md type: {kind} (expected now)")

    for decision_dir in DECISION_DIRS:
        decisions = root / decision_dir
        ids: dict[str, Path] = {}
        records: dict[str, dict[str, object]] = {}
        if decisions.is_dir():
            for path in sorted(decisions.glob("*.md")):
                if path.name.startswith("_"):
                    continue
                text = safe_read(path)
                fn = DECISION_FILENAME.match(path.name)
                title = DECISION_TITLE.search(text)
                if not title:
                    if fn:
                        warn(f"decision filename looks numbered but title is not '# NNNN. …': {path.name}")
                    continue
                did = title.group(1)
                if did == "0000":
                    err(f"decision id 0000 is reserved: {path.name}")
                    continue
                if fn and fn.group(1) != did:
                    err(f"decision id mismatch: file {path.name} vs title {did}")
                if did in ids:
                    err(f"duplicate decision id {did}: {ids[did].name} and {path.name}")
                ids[did] = path
                status = parse_status(text)
                statuses = [m.group(1).strip().lower() for m in STATUS_LINE.finditer(prose_without_fences(text))]
                if len(set(statuses)) > 1:
                    err(f"conflicting Status fields: {path.name}")
                date_m = DATE_LINE.search(text)
                if date_m:
                    try:
                        date.fromisoformat(date_m.group(1))
                    except ValueError:
                        err(f"decision has an invalid Date: {path.name}")
                records[did] = {
                    "path": path,
                    "status": status,
                    "date": date_m.group(1) if date_m else "",
                    "supersedes": parse_id_list(SUP_FIELD.search(text).group(1) if SUP_FIELD.search(text) else ""),
                    "superseded_by": parse_id_list(SUP_BY_FIELD.search(text).group(1) if SUP_BY_FIELD.search(text) else ""),
                }
                if not status_token(status):
                    err(f"decision missing Status: {path.name}")
                elif not re.fullmatch(r"proposed|accepted|deprecated|superseded(?: by \d{4})?", status):
                    err(f"decision has invalid Status {status!r}: {path.name}")
                if status_token(status) == "accepted" and not re.search(r"^##\s+Assumptions\b", text, re.MULTILINE):
                    err(f"accepted decision missing ## Assumptions: {path.name}")

            for did, rec in records.items():
                for other in rec["supersedes"]:  # type: ignore[union-attr]
                    if other == did:
                        err(f"decision {did} supersedes itself")
                        continue
                    peer = records.get(other)
                    if peer is None:
                        err(f"decision {did} supersedes missing {other}")
                        continue
                    if did not in peer["superseded_by"]:  # type: ignore[operator]
                        err(f"decision {did} supersedes {other}, but {other} does not list Superseded-by: {did}")
                    if status_token(str(rec["status"])) in PROTECTED_STATUS and status_token(str(peer["status"])) != "superseded":
                        err(f"decision {did} supersedes {other}, but {other} is not marked superseded")
                for other in rec["superseded_by"]:  # type: ignore[union-attr]
                    if other == did:
                        err(f"decision {did} superseded-by itself")
                        continue
                    peer = records.get(other)
                    if peer is None:
                        err(f"decision {did} superseded-by missing {other}")
                        continue
                    if did not in peer["supersedes"]:  # type: ignore[operator]
                        err(f"decision {did} lists Superseded-by: {other}, but {other} does not list Supersedes: {did}")
                if status_token(str(rec["status"])) == "superseded" and not rec["superseded_by"]:
                    err(f"superseded decision {did} missing Superseded-by")

            visited: set[str] = set()
            active: set[str] = set()
            def visit(did: str) -> None:
                if did in active:
                    err(f"decision supersession cycle includes {did}")
                    return
                if did in visited or did not in records:
                    return
                visited.add(did)
                active.add(did)
                for other in records[did]["supersedes"]:
                    visit(other)
                active.remove(did)
            for did in records:
                visit(did)

            index = decisions / "_index.md"
            if ids and not index.is_file():
                err(f"{decision_dir}/_index.md missing while decision files exist")
            elif index.is_file():
                index_rows: dict[str, tuple[str, str, str]] = {}
                columns: dict[str, int] = {}
                for line in safe_read(index).splitlines():
                    if not line.lstrip().startswith("|"):
                        continue
                    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
                    if "id" in [cell.lower() for cell in cells]:
                        columns = {cell.lower(): n for n, cell in enumerate(cells)}
                        if not {"id", "title", "status", "date", "supersedes"} <= columns.keys():
                            err(f"{decision_dir}/_index.md requires ID, Title, Status, Date, Supersedes columns")
                        continue
                    if not {"id", "title", "status", "date", "supersedes"} <= columns.keys():
                        continue
                    if len(cells) <= max(columns.values()):
                        continue
                    did = cells[columns["id"]]
                    if not re.fullmatch(r"\d{4}", did):
                        continue
                    if did in index_rows:
                        err(f"{decision_dir}/_index.md duplicates {did}")
                    index_rows[did] = tuple(cells[columns[key]] for key in ("status", "date", "supersedes"))
                for did in ids:
                    if did not in index_rows:
                        err(f"{decision_dir}/_index.md missing {did}")
                for did, (idx_status, idx_date, idx_sup) in index_rows.items():
                    if did not in ids:
                        err(f"{decision_dir}/_index.md lists {did} but there is no decision file")
                        continue
                    rec = records[did]
                    file_tok = status_token(str(rec["status"]))
                    idx_tok = status_token(idx_status)
                    if not file_tok and idx_tok:
                        err(
                            f"{decision_dir}/_index.md status for {did} is {idx_tok!r}, file has no parseable Status:"
                        )
                    elif file_tok and file_tok != idx_tok:
                        err(f"{decision_dir}/_index.md status for {did} is {idx_tok!r}, file is {file_tok!r}")
                    file_date = str(rec["date"])
                    idx_date_norm = "" if BLANK_ID.match(idx_date) else idx_date
                    if file_date and idx_date_norm and file_date != idx_date_norm:
                        err(
                            f"{decision_dir}/_index.md date for {did} is {idx_date_norm!r}, file is {file_date!r}"
                        )
                    elif file_date and not idx_date_norm:
                        err(f"{decision_dir}/_index.md missing date for {did}")
                    file_sup = list(rec["supersedes"])  # type: ignore[arg-type]
                    idx_sup_ids = parse_id_list(idx_sup)
                    if sorted(file_sup) != sorted(idx_sup_ids):
                        err(
                            f"{decision_dir}/_index.md supersedes for {did} is {idx_sup_ids}, file is {file_sup}"
                        )

    spec = root / "docs" / "knowledge-architecture.md"
    if spec.is_file():
        head = safe_read(spec)[:2000]
        if not re.search(r"\*\*Version:\*\*", head):
            warn("full spec has no Version field")
        review = re.search(r"Tool table review-by:\*\*\s*(\d{4}-\d{2}-\d{2})", head)
        if review:
            try:
                until = date.fromisoformat(review.group(1))
            except ValueError:
                until = None
                err("full spec has an invalid tool table review-by date")
            if until and date.today() > until:
                warn(f"§18 tool table past review-by ({until})")

    wiki_pages = root / "docs" / "wiki" / "pages"
    if wiki_pages.is_dir():
        for path in sorted(wiki_pages.rglob("*.md")):
            if path.name.startswith("_"):
                continue
            try:
                text = safe_read(path)
            except UnicodeDecodeError:
                continue
            if not wiki_page_has_source(text):
                err(f"wiki page missing source pointer: {path.relative_to(root)}")

    slug_cache: dict[Path, set[str]] = {}
    for path in files:
        if path.suffix.lower() != ".md":
            continue
        rel = path.relative_to(root)
        try:
            text = safe_read(path)
        except UnicodeDecodeError:
            err(f"undecodable markdown (not utf-8): {rel}")
            continue
        kind = frontmatter_type(text)
        expect = expected_type(rel)
        if expect:
            if not kind:
                err(f"missing type: {expect} in {rel}")
            elif kind != expect:
                err(f"{rel} type: {kind} (expected {expect})")
        if kind and kind not in KNOWN_TYPES:
            err(f"unknown type {kind!r} in {rel}")
        links = markdown_links(text)
        if rel.parts[:3] == ("docs", "wiki", "pages"):
            links.extend(source_pointers(text))
        for raw in dict.fromkeys(links):
            dest, fragment = resolve_link(path, raw, root)
            if dest is None:
                continue
            if not dest.resolve().is_relative_to(root):
                err(f"link escapes repository in {rel}: {raw}")
                continue
            if not dest.exists():
                err(f"broken link in {rel}: {raw}")
                continue
            if not fragment or LINE_ANCHOR.match(fragment) or not dest.is_file():
                continue
            if dest.suffix.lower() != ".md":
                continue
            if dest not in slug_cache:
                try:
                    slug_cache[dest] = heading_slugs(safe_read(dest))
                except UnicodeDecodeError:
                    slug_cache[dest] = set()
            if fragment not in slug_cache[dest]:
                err(f"missing anchor in {rel}: {raw}")

    return result


def is_decision_diff_path(path: str) -> bool:
    path = path.strip().replace("\\", "/")
    if path in NULL_PATHS:
        return False
    rel = Path(path)
    return (
        rel.parent.as_posix() in DECISION_DIRS
        and rel.suffix == ".md"
        and not rel.name.startswith("_")
        and rel.name != "0000-template.md"
    )


def _diff_path(raw: str) -> str:
    raw = raw.strip().split("\t", 1)[0]
    if raw.startswith('"'):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            raw = raw.strip('"')
    if raw.startswith(("a/", "b/")):
        raw = raw[2:]
    return raw


@dataclass
class GateEvent:
    kind: str  # promotion | deletion | edit
    message: str


def gate_events_in_diff(diff_text: str) -> list[GateEvent]:
    """Gate decision transitions; partial pre-images are conservatively protected.

    Full-context diffs distinguish proposed edits from protected edits. Hunk counts
    distinguish headers from removed content beginning with '-- '.
    """
    events: list[GateEvent] = []
    origin = dest = ""
    old: list[str] = []
    new: list[str] = []
    changed = False
    old_remaining = new_remaining = 0
    saw_headers = False

    def flush() -> None:
        before = {status_token(m.group(1)) for m in STATUS_LINE.finditer(prose_without_fences("\n".join(old)))}
        after = {status_token(m.group(1)) for m in STATUS_LINE.finditer(prose_without_fences("\n".join(new)))}
        before.discard("")
        after.discard("")
        origin_dec = is_decision_diff_path(origin)
        dest_dec = is_decision_diff_path(dest)
        protected = bool(before & PROTECTED_STATUS) or not before
        if origin_dec and not dest_dec:
            if protected:
                label = "accepted" if "accepted" in before else "superseded" if "superseded" in before else "protected"
                events.append(GateEvent("deletion", f"{origin}: deleted {label} decision"))
            return
        if dest_dec and "accepted" in after and (not origin_dec or "accepted" not in before):
            previous = sorted(before)[0] if before else ""
            message = f"Status {previous} → accepted" if previous else "new decision landed as accepted"
            events.append(GateEvent("promotion", f"{dest}: {message}"))
        elif dest_dec and not origin_dec and not after:
            events.append(GateEvent("promotion", f"{dest}: decision moved in without visible status; acceptance review required"))
        if origin_dec and dest_dec and changed and protected:
            events.append(GateEvent("edit", f"{dest}: edited protected decision (including status or supersession changes)"))

    def start_file(src: str = "", dst: str = "") -> None:
        nonlocal origin, dest, old, new, changed, old_remaining, new_remaining, saw_headers
        flush()
        origin, dest = src, dst
        old, new = [], []
        changed = saw_headers = False
        old_remaining = new_remaining = 0

    for line in diff_text.splitlines():
        if line.startswith("\x1b["):
            raise ValueError("diff contains terminal color codes; regenerate it with --no-color")
        if line.startswith("diff --git "):
            paths = re.match(r'^diff --git (".*?"|a/.*?) (".*"|b/.*)$', line)
            if not paths:
                raise ValueError("cannot parse diff --git paths")
            start_file(_diff_path(paths.group(1)), _diff_path(paths.group(2)))
            continue
        if line.startswith(("Binary files ", "GIT binary patch")):
            changed = True
            continue
        hunk = re.match(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
        if hunk:
            old_remaining = int(hunk.group(2) or "1")
            new_remaining = int(hunk.group(4) or "1")
            continue
        if old_remaining or new_remaining:
            if line.startswith("-"):
                old.append(line[1:])
                old_remaining = max(0, old_remaining - 1)
                changed = True
            elif line.startswith("+"):
                new.append(line[1:])
                new_remaining = max(0, new_remaining - 1)
                changed = True
            elif line.startswith(" ") or not line:
                # diff.suppressBlankEmpty prints an empty context line without its space.
                old.append(line[1:])
                new.append(line[1:])
                old_remaining = max(0, old_remaining - 1)
                new_remaining = max(0, new_remaining - 1)
            continue
        if line.startswith("rename from "):
            origin = _diff_path(line[len("rename from "):])
        elif line.startswith("rename to "):
            dest = _diff_path(line[len("rename to "):])
        elif line.startswith("--- "):
            if saw_headers:
                start_file()
            origin = _diff_path(line[4:])
            saw_headers = True
        elif line.startswith("+++ "):
            dest = _diff_path(line[4:])
        elif line.startswith(("+", "-")):
            raise ValueError("diff content outside a hunk")
    flush()
    return events


def promotions_in_diff(diff_text: str) -> list[str]:
    return [e.message for e in gate_events_in_diff(diff_text) if e.kind == "promotion"]


def deletions_in_diff(diff_text: str) -> list[str]:
    return [e.message for e in gate_events_in_diff(diff_text) if e.kind == "deletion"]


def git_decision_diff(root: Path, base: str) -> str:
    def git(*args: str) -> str:
        proc = subprocess.run(
            ["git", "-C", str(root), *args], check=False, capture_output=True, text=True,
        )
        if proc.returncode:
            raise RuntimeError(proc.stderr.strip() or "git command failed")
        return proc.stdout.strip() if args[0] != "diff" else proc.stdout
    if not base or base.startswith("-"):
        raise ValueError("base must be a Git revision, not an option")
    commit = git("rev-parse", "--verify", "--end-of-options", base + "^{commit}")
    ancestor = git("merge-base", commit, "HEAD")
    # Include staged/unstaged changes for local use. CI's merge checkout compares
    # naturally against its base parent; stale feature branches use their ancestor.
    # Pin the output format against user config (color, noprefix, mnemonicPrefix),
    # and report paths relative to root so a package --root sees its own ring.
    # Only decision directories are diffed: a move out of the ring reads as a deletion.
    return git("diff", "--no-color", "--no-ext-diff", "--no-textconv", "--src-prefix=a/",
               "--dst-prefix=b/", "--relative", "--unified=1000000", "--find-renames",
               ancestor, "--", *DECISION_DIRS)


def infer_commands(root: Path) -> dict[str, str]:
    cmds: dict[str, str] = {}
    pkg = root / "package.json"
    if pkg.is_file():
        data: object = None
        try:
            data = json.loads(read_text(pkg))
            scripts = data.get("scripts", {}) if isinstance(data, dict) else {}
            if not isinstance(scripts, dict):
                scripts = {}
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            scripts = {}
        declared = data.get("packageManager") if isinstance(data, dict) else None
        declared = declared.split("@", 1)[0] if isinstance(declared, str) else ""
        if declared in {"npm", "pnpm", "yarn", "bun"}:
            manager = declared
        elif (root / "pnpm-lock.yaml").exists():
            manager = "pnpm"
        elif (root / "yarn.lock").exists():
            manager = "yarn"
        elif (root / "bun.lock").exists() or (root / "bun.lockb").exists():
            manager = "bun"
        else:
            manager = "npm"
        # `bun test` is Bun's own runner, not the package script.
        run = f"{manager} run"
        cmds.setdefault("install", f"{manager} install")
        if "test" in scripts:
            cmds.setdefault("test", f"{run} test" if manager == "bun" else f"{manager} test")
        if "lint" in scripts:
            cmds.setdefault("lint", f"{run} lint")
        if "dev" in scripts:
            cmds.setdefault("dev", f"{run} dev")
        elif "start" in scripts:
            cmds.setdefault("dev", f"{run} start" if manager == "bun" else f"{manager} start")
    if (root / "Cargo.toml").is_file():
        cmds.setdefault("test", "cargo test")
    if (root / "go.mod").is_file():
        cmds.setdefault("test", "go test ./...")
    pyproject = root / "pyproject.toml"
    setup = root / "setup.py"
    if pyproject.is_file() or setup.is_file() or (root / "pytest.ini").is_file():
        runner = ""
        if (root / "uv.lock").is_file():
            runner = "uv run "
            cmds.setdefault("install", "uv sync")
        elif (root / "poetry.lock").is_file():
            runner = "poetry run "
            cmds.setdefault("install", "poetry install")
        elif pyproject.is_file() or setup.is_file():
            cmds.setdefault("install", "pip install -e .")
        blob = ""
        if pyproject.is_file():
            try:
                blob = read_text(pyproject)
            except (OSError, UnicodeDecodeError):
                blob = ""
        if "pytest" in blob or (root / "pytest.ini").is_file():
            cmds.setdefault("test", f"{runner}pytest")
        else:
            cmds.setdefault("test", f"{runner}python3 -m unittest")
    makefile = root / "Makefile"
    if makefile.is_file():
        try:
            mk = read_text(makefile)
        except (OSError, UnicodeDecodeError):
            mk = ""
        if re.search(r"^test:", mk, re.MULTILINE):
            cmds.setdefault("test", "make test")
        if re.search(r"^lint:", mk, re.MULTILINE):
            cmds.setdefault("lint", "make lint")
    return cmds


def render_agents(commands: dict[str, str], routes: list[tuple[str, str]]) -> str:
    labels = (
        ("install", "Install"), ("dev", "Dev"), ("test", "Test"), ("lint", "Lint / format"),
        ("knowledge", "Knowledge lint"),
    )
    cmd_lines = [f"- {label}: `{commands[key]}`" for key, label in labels if commands.get(key)]
    rows = "\n".join(f"| {need} | {path} |" for need, path in routes)
    return (
        "# Agent protocol\n\n"
        "## Commands\n\n"
        + "\n".join(cmd_lines)
        + "\n\n"
        "## Hard rules\n\n"
        "- Do not add a dependency, edit generated code, or change a migration without an explicit ask.\n"
        "- Do not commit secrets, credentials, or `.env` values.\n"
        "- Minimal diffs. Touch only what the task requires.\n"
        "- For work that will edit more than two files, write `PLAN.md` first.\n"
        "- Run the targeted test before calling the task done.\n"
        "- Do not silently flip a draft decision to accepted.\n\n"
        "## Authority\n\n"
        "- Level 0 (not facts): `PLAN.md`, chat\n"
        "- Level 2 (constraints): accepted files in `docs/decisions/` when that ring exists\n"
        "- Level 3 (prefer over prose): generated schemas and types\n"
        "- Level 4 (do not edit unless asked): this file, `docs/identity.md`, `LICENSE`\n\n"
        "## Write permissions\n\n"
        "- `PLAN.md`, capture: write.\n"
        "- Proposed decisions: create, leave status `proposed`.\n"
        "- Accepted decisions, architecture, `docs/now.md`: propose a patch. Do not apply silently.\n"
        "- Generated artifacts: never hand-edit.\n"
        "- This file, identity, license: do not change unless asked.\n"
        "- `Status: proposed` → `accepted`: a named human only. On GitHub, the PR needs the `human-accepted` label.\n"
        "- Edits to accepted/superseded decisions require human review (PR label `human-edited`).\n"
        "- Do not delete an accepted or superseded decision; supersede it. A deletion PR needs the `human-removed` label.\n\n"
        "## Where to read\n\n"
        "| Need | File |\n"
        "|---|---|\n"
        + rows
        + "\n\n"
        "## After you finish\n\n"
        "Propose, do not silently apply: a docs/now.md patch, a decision draft if you chose something, "
        "a one-line history note if git will not explain it.\n"
    )


def init_kernel(
    root: Path,
    *,
    name: str | None = None,
    install: str | None = None,
    dev: str | None = None,
    test: str | None = None,
    lint_command: str | None = None,
    force: bool = False,
    compat: bool = True,
) -> LintResult:
    """Scaffold the Tier 1 kernel. Never creates empty rings."""
    root = root.resolve()
    result = LintResult()
    if not root.is_dir():
        result.errors.append("init root must be an existing directory")
        return result
    targets = ["README.md", "AGENTS.md", "scripts/lint_knowledge.py"]
    if compat:
        targets += ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"]
    for rel in targets:
        target = root / rel
        bad_parent = any(parent.exists() and not parent.is_dir() for parent in target.parents if parent.is_relative_to(root))
        if bad_parent or not target.resolve().is_relative_to(root) or (target.exists() and not target.is_file()):
            result.errors.append(f"unsafe init target: {rel} (outside root or not a file)")
    if not result.ok:
        return result
    commands = infer_commands(root)
    if install:
        commands["install"] = install
    if dev:
        commands["dev"] = dev
    if test:
        commands["test"] = test
    if lint_command:
        commands["lint"] = lint_command
    if not commands:
        result.errors.append(
            "cannot infer install/test/lint; pass --install, --test, --dev, and/or --lint-command"
        )
        return result
    if not commands.get("test"):
        result.warnings.append("no test command inferred; pass --test so agents can verify their work")
    commands["knowledge"] = "python3 scripts/lint_knowledge.py --strict"

    title = name or root.name or "project"
    readme = root / "README.md"
    if not readme.exists():
        existed = readme.exists()
        readme.write_text(
            f"# {title}\n\nSee [AGENTS.md](AGENTS.md) for agent commands.\n",
            encoding="utf-8",
        )
        result.fixed.append(f"{'replaced' if existed else 'created'}: README.md")
    else:
        result.warnings.append("init skipped existing README.md")

    routes: list[tuple[str, str]] = []
    if (root / "README.md").is_file():
        routes.append(("What this is", "README.md"))
    if (root / "docs" / "now.md").is_file():
        routes.append(("What we are doing now", "docs/now.md"))
    if (root / "docs" / "identity.md").is_file():
        routes.append(("Scope and non-goals", "docs/identity.md"))
    for decision_dir in DECISION_DIRS:
        if (root / decision_dir).is_dir():
            routes.append(("Why a choice was made", decision_dir + "/"))

    agents = root / "AGENTS.md"
    body = render_agents(commands, routes)
    if agents.exists() and not force:
        result.warnings.append("init skipped existing AGENTS.md")
    else:
        existed = agents.exists()
        agents.write_text(body, encoding="utf-8")
        result.fixed.append(f"{'replaced' if existed else 'created'}: AGENTS.md")

    if compat:
        pointers = {
            root / "CLAUDE.md": "@AGENTS.md\n",
            root / "GEMINI.md": (
                "@AGENTS.md\n\nAll operational instructions live in AGENTS.md. Follow that file.\n"
            ),
            root / ".github" / "copilot-instructions.md": (
                "Refer to [AGENTS.md](../AGENTS.md) for all repository agent instructions. "
                "That file is the source of truth for commands, conventions, authority, and routing.\n"
            ),
        }
        if (root / ".claude" / "CLAUDE.md").exists() and not (root / "CLAUDE.md").exists():
            del pointers[root / "CLAUDE.md"]
            result.warnings.append("init skipped CLAUDE.md: .claude/CLAUDE.md exists; import @AGENTS.md there")
        for path, text in pointers.items():
            rel = path.relative_to(root).as_posix()
            if path.exists() and not force:
                result.warnings.append(f"init skipped existing {rel}")
                continue
            existed = path.exists()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            result.fixed.append(f"{'replaced' if existed else 'created'}: {rel}")

    src = Path(__file__).resolve()
    dest = (root / "scripts" / "lint_knowledge.py").resolve()
    if src != dest:
        if dest.exists() and not force:
            result.warnings.append("init skipped existing scripts/lint_knowledge.py")
        else:
            existed = dest.exists()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            result.fixed.append(
                f"{'replaced' if existed else 'created'}: scripts/lint_knowledge.py"
            )

    return result


def emit(result: LintResult, fmt: str) -> int:
    if fmt == "json":
        print(
            json.dumps(
                {
                    "ok": result.ok,
                    "errors": result.errors,
                    "warnings": result.warnings,
                    "fixed": result.fixed,
                },
                indent=2,
            )
        )
    else:
        for w in result.warnings:
            print(f"warning: {w}")
        for e in result.errors:
            print(f"error: {e}")
        for f in result.fixed:
            print(f"fixed: {f}")
        if result.errors:
            print(f"{len(result.errors)} error(s), {len(result.warnings)} warning(s)")
        else:
            print(f"ok ({len(result.warnings)} warning(s))")
    return 0 if result.ok else 1


def merge_results(first: LintResult, second: LintResult) -> LintResult:
    return LintResult(
        errors=first.errors + second.errors,
        warnings=first.warnings + second.warnings,
        fixed=first.fixed + second.fixed,
    )


def emit_version(fmt: str) -> int:
    if fmt == "json":
        print(json.dumps({"version": VERSION, "pin": PIN_URL}, indent=2))
    else:
        print(VERSION)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=None, help="repository root (default: parent of scripts/)")
    parser.add_argument("--stale-days", type=int, default=14)
    parser.add_argument("--strict", action="store_true", help="treat warnings (including stale now.md) as errors")
    parser.add_argument("--fix", "--touch-now", action="store_true", help="refresh a stale docs/now.md date only; does not review content")
    parser.add_argument("--version", action="store_true", help="print the embedded linter version and exit")
    parser.add_argument(
        "--promotion-diff",
        metavar="FILE",
        default=None,
        help="unified diff to scan for promotions and protected deletions (use - for stdin)",
    )
    parser.add_argument(
        "--promotion-base",
        metavar="GIT_REV",
        default=None,
        help="git rev to diff against (decision files only are considered)",
    )
    parser.add_argument(
        "--allow-promotion",
        action="store_true",
        help="with --promotion-*: do not fail on landing Status: accepted (human-accepted label)",
    )
    parser.add_argument(
        "--allow-deletion",
        action="store_true",
        help="with --promotion-*: do not fail on deleting an accepted/superseded decision (human-removed label)",
    )
    parser.add_argument(
        "--allow-edit",
        action="store_true",
        help="with --promotion-*: allow edits/demotions of protected decisions (human-edited label)",
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="scaffold Tier 1 (AGENTS.md + pointers). Does not create empty docs/ rings",
    )
    parser.add_argument("--name", default=None, help="with --init: project title for a missing README")
    parser.add_argument("--install", default=None, help="with --init: install command")
    parser.add_argument("--dev", default=None, help="with --init: dev command")
    parser.add_argument("--test", default=None, help="with --init: test command")
    parser.add_argument("--lint-command", default=None, help="with --init: lint/format command")
    parser.add_argument("--force", action="store_true", help="with --init: overwrite protocol, pointers and linter; preserve README")
    parser.add_argument("--no-compat", action="store_true", help="with --init: skip CLAUDE/GEMINI/Copilot pointers")
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="text or json. JSON shape (v0.1.x): {ok, errors, warnings, fixed}",
    )
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "check":
        argv = argv[1:]
    args = parser.parse_args(argv)
    if sum((args.version, args.init, args.promotion_diff is not None or bool(args.promotion_base))) > 1:
        return emit(LintResult(errors=["choose one mode: --version, --init, or --promotion-*"]), args.format)
    if args.promotion_diff is not None and args.promotion_base:
        return emit(LintResult(errors=["choose --promotion-diff or --promotion-base"]), args.format)
    gate_mode = args.promotion_diff is not None or bool(args.promotion_base)
    if (args.allow_edit or args.allow_deletion or args.allow_promotion) and not gate_mode:
        return emit(LintResult(errors=["allow flags require --promotion-diff or --promotion-base"]), args.format)
    if (args.force or args.no_compat) and not args.init:
        return emit(LintResult(errors=["--force and --no-compat require --init"]), args.format)
    if args.version:
        return emit_version(args.format)
    root = args.root.resolve() if args.root else repo_root()
    if args.promotion_diff is not None or args.promotion_base:
        try:
            if args.promotion_base:
                diff_text = git_decision_diff(root, args.promotion_base)
            elif args.promotion_diff == "-":
                diff_text = sys.stdin.read()
            else:
                diff_text = Path(args.promotion_diff).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError, RuntimeError, ValueError) as exc:
            failed = LintResult(errors=[str(exc)])
            return emit(failed, args.format)
        try:
            events = gate_events_in_diff(diff_text)
        except ValueError as exc:
            return emit(LintResult(errors=[str(exc)]), args.format)
        result = LintResult()
        promo = [e.message for e in events if e.kind == "promotion"]
        dele = [e.message for e in events if e.kind == "deletion"]
        edits = [e.message for e in events if e.kind == "edit"]
        if promo and args.allow_promotion:
            result.warnings.extend(promo)
            result.fixed.append("promotion allowed by --allow-promotion")
        elif promo:
            result.errors.extend(promo)
        if dele and args.allow_deletion:
            result.warnings.extend(dele)
            result.fixed.append("deletion allowed by --allow-deletion")
        elif dele:
            result.errors.extend(dele)
        if edits and args.allow_edit:
            result.warnings.extend(edits)
        elif edits:
            result.errors.extend(edits)
        return emit(result, args.format)
    result = LintResult()
    if args.init:
        try:
            result = init_kernel(
                root,
                name=args.name,
                install=args.install,
                dev=args.dev,
                test=args.test,
                lint_command=args.lint_command,
                force=args.force,
                compat=not args.no_compat,
            )
        except (OSError, UnicodeError, ValueError) as exc:
            result = LintResult(errors=[f"init failed: {exc}"])
        if not result.ok:
            return emit(result, args.format)
    linted = lint(root, args.stale_days, args.strict, args.fix)
    if args.init:
        linted = merge_results(result, linted)
    return emit(linted, args.format)


if __name__ == "__main__":
    sys.exit(main())
