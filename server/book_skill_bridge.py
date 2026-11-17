#!/usr/bin/env python3
"""Bridge between Froge Trainer and myBookToSkills (book_to_skill + skill QA tools)."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

DEFAULT_BOOK_TO_SKILL_DIR = Path(
    os.environ.get("BOOK_TO_SKILL_DIR", r"C:\25th_Dynasty_Workspace\myBookToSkills")
)


def _ensure_import_path(root: Path) -> bool:
    if not root.exists():
        return False
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    return True


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:64] or "custom-skill"


def _split_sections(text: str, fallback_title: str, estimate_tokens_fn) -> list[dict[str, Any]]:
    lines = text.splitlines()
    heading_re = re.compile(
        r"^(?:#{1,3}\s+(.+)|={40,}\s*$|((?:Chapter|Act|Part|Section|Module)\s+[\w.:-]+\s*.*?))\s*$",
        re.IGNORECASE,
    )
    sections: list[dict[str, Any]] = []
    current_title = fallback_title
    current_lines: list[str] = []
    in_source_banner = False

    def flush_section():
        nonlocal current_title, current_lines
        body = "\n".join(current_lines).strip()
        if not body:
            current_lines = []
            return
        sections.append(
            {
                "index": len(sections) + 1,
                "title": current_title.strip()[:120] or f"Section {len(sections) + 1}",
                "slug": _slugify(current_title or f"section-{len(sections) + 1}"),
                "words": len(body.split()),
                "tokens": estimate_tokens_fn(body),
                "preview": body[:280].replace("\n", " "),
                "text": body,
            }
        )
        current_lines = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("=" * 20):
            in_source_banner = not in_source_banner
            continue
        if in_source_banner and stripped.startswith("SOURCE:"):
            flush_section()
            current_title = stripped.replace("SOURCE:", "", 1).split("(Path:")[0].strip()
            continue

        md_match = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        ch_match = re.match(
            r"^((?:Chapter|Act|Part|Section|Module)\s+(?:\d+|[IVXLCDM]+)\b[^\n]{0,90})$",
            stripped,
            re.IGNORECASE,
        )
        if md_match:
            if len("\n".join(current_lines).strip()) > 120:
                flush_section()
                current_title = md_match.group(2).strip()
                continue
        elif ch_match:
            if len("\n".join(current_lines).strip()) > 120:
                flush_section()
                current_title = ch_match.group(1).strip()
                continue

        current_lines.append(line)

    flush_section()

    # If everything landed in one huge section, split cleanly into ~800-token chapters
    if len(sections) == 1 and sections[0]["tokens"] > 1200:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", sections[0]["text"]) if p.strip()]
        chunked: list[dict[str, Any]] = []
        buf: list[str] = []
        buf_tokens = 0
        for para in paragraphs:
            ptok = estimate_tokens_fn(para)
            if buf and buf_tokens + ptok > 850:
                chunk_text = "\n\n".join(buf)
                idx = len(chunked) + 1
                title = f"{fallback_title} — Part {idx}"
                chunked.append(
                    {
                        "index": idx,
                        "title": title,
                        "slug": _slugify(title),
                        "words": len(chunk_text.split()),
                        "tokens": estimate_tokens_fn(chunk_text),
                        "preview": chunk_text[:280].replace("\n", " "),
                        "text": chunk_text,
                    }
                )
                buf = [para]
                buf_tokens = ptok
            else:
                buf.append(para)
                buf_tokens += ptok
        if buf:
            chunk_text = "\n\n".join(buf)
            idx = len(chunked) + 1
            title = f"{fallback_title} — Part {idx}"
            chunked.append(
                {
                    "index": idx,
                    "title": title,
                    "slug": _slugify(title),
                    "words": len(chunk_text.split()),
                    "tokens": estimate_tokens_fn(chunk_text),
                    "preview": chunk_text[:280].replace("\n", " "),
                    "text": chunk_text,
                }
            )
        if chunked:
            return chunked

    return sections


def _extract_glossary_and_patterns(sections: list[dict[str, Any]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    glossary: list[dict[str, str]] = []
    seen_terms: set[str] = set()
    patterns: list[dict[str, str]] = []
    seen_patterns: set[str] = set()

    def_re = re.compile(
        r"^(?:[-*•]\s+)?(?:\*\*([^*:\n]{2,60})\*\*|`([^`:\n]{2,60})`|([A-Z][A-Za-z0-9 _/-]{2,45}))\s*[:—-]\s+(.{20,320})$"
    )
    pattern_re = re.compile(
        r"^(?:[-*•]|\d+\.)\s+(?:\*\*([^*:\n]{3,70})\*\*[:—-]?\s*)?(.{24,280})$"
    )
    skip_term_prefixes = ("chapter ", "act ", "part ", "prologue", "epilogue", "source", "note", "http")

    for sec in sections:
        sec_title = sec["title"]
        for raw_line in sec["text"].splitlines():
            line = raw_line.strip()
            if not line:
                continue
            m = def_re.match(line)
            if m:
                term = (m.group(1) or m.group(2) or m.group(3) or "").strip()
                definition = m.group(4).strip()
                key = term.lower()
                if (
                    term
                    and key not in seen_terms
                    and not any(key.startswith(prefix) for prefix in skip_term_prefixes)
                ):
                    seen_terms.add(key)
                    glossary.append(
                        {"term": term, "definition": definition, "section": sec_title}
                    )
                    if len(glossary) >= 80:
                        break
                continue

            pm = pattern_re.match(line)
            if pm:
                title = (pm.group(1) or "").strip()
                detail = pm.group(2).strip()
                if not title:
                    title = detail.split(".")[0][:65]
                pkey = title.lower()
                if pkey not in seen_patterns:
                    seen_patterns.add(pkey)
                    patterns.append(
                        {"title": title, "summary": detail, "section": sec_title}
                    )
                    if len(patterns) >= 60:
                        break

    glossary.sort(key=lambda item: item["term"].lower())
    return glossary, patterns


def cmd_check() -> int:
    available = _ensure_import_path(DEFAULT_BOOK_TO_SKILL_DIR)
    if not available:
        print(
            json.dumps(
                {
                    "available": False,
                    "rootDir": str(DEFAULT_BOOK_TO_SKILL_DIR),
                    "error": f"myBookToSkills not found at {DEFAULT_BOOK_TO_SKILL_DIR}",
                    "extractors": [],
                }
            )
        )
        return 0

    import shutil
    from book_to_skill.config import supported_formats_message
    from book_to_skill.dependencies import DEPENDENCY_GROUPS, python_module_available

    extractors = []
    for group in DEPENDENCY_GROUPS:
        mods = group.get("modules", [])
        sys_tools = group.get("system", [])
        mod_status = {m: python_module_available(m) for m in mods}
        sys_status = {cmd: bool(shutil.which(cmd)) for cmd, _, _ in sys_tools}

        if group.get("any_of_modules"):
            mod_ok = any(mod_status.values()) if mods else False
        else:
            mod_ok = all(mod_status.values()) if mods else False
        sys_ok = any(sys_status.values()) if sys_tools else False
        ready = mod_ok or (group.get("any_tool_suffices") and sys_ok) or (not mods and sys_ok)

        extractors.append(
            {
                "label": group["label"],
                "ready": bool(ready),
                "note": group.get("note", ""),
                "modules": mod_status,
                "system": sys_status,
            }
        )

    print(
        json.dumps(
            {
                "available": True,
                "rootDir": str(DEFAULT_BOOK_TO_SKILL_DIR),
                "supportedFormats": supported_formats_message(),
                "extractors": extractors,
            }
        )
    )
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    if not _ensure_import_path(DEFAULT_BOOK_TO_SKILL_DIR):
        raise RuntimeError(f"myBookToSkills not found at {DEFAULT_BOOK_TO_SKILL_DIR}")

    from book_to_skill.sanitize import sanitize_extracted_text
    from book_to_skill.utils import (
        detect_structure,
        estimate_tokens,
        extract_single_file,
        resolve_input_files,
    )
    from tools.scan_generated_skill import _scan_text

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    input_files = resolve_input_files(args.inputs)
    if not input_files:
        raise RuntimeError("No supported knowledge files found in the provided paths.")

    extracted_sources = []
    combined_chunks = []
    skipped = []
    total_invisible_removed = 0

    for fpath in input_files:
        try:
            with contextlib.redirect_stdout(sys.stderr):
                res = extract_single_file(fpath, args.mode, "no")
        except Exception as exc:
            skipped.append({"file": str(fpath), "error": str(exc)})
            continue
        clean_text, removed = sanitize_extracted_text(res["text"])
        total_invisible_removed += removed
        res["text"] = clean_text
        extracted_sources.append(res)
        separator = f"\n\n{'=' * 80}\nSOURCE: {res['filename']} (Path: {res['source_file']})\n{'=' * 80}\n\n"
        combined_chunks.append(separator + clean_text)

    if not extracted_sources:
        detail = "; ".join(f"{s['file']}: {s['error']}" for s in skipped)
        raise RuntimeError(f"All sources failed extraction: {detail}")

    consolidated_text = "".join(combined_chunks).strip()
    structure_text = "\n\n".join(src["text"] for src in extracted_sources)
    structure = detect_structure(structure_text)
    structure["has_toc"] = any(src.get("has_toc") for src in extracted_sources)

    sections = _split_sections(consolidated_text, args.name or extracted_sources[0]["filename"], estimate_tokens)
    glossary, patterns = _extract_glossary_and_patterns(sections)
    scan_findings = _scan_text("extracted.txt", consolidated_text)

    (out_dir / "extracted.txt").write_text(consolidated_text, encoding="utf-8")
    (out_dir / "sections.json").write_text(
        json.dumps({"sections": sections, "glossary": glossary, "patterns": patterns}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    meta = {
        "name": args.name or extracted_sources[0]["filename"],
        "mode": args.mode,
        "totalSources": len(extracted_sources),
        "skipped": skipped,
        "words": len(consolidated_text.split()),
        "chars": len(consolidated_text),
        "estimatedTokens": estimate_tokens(consolidated_text),
        "chaptersDetected": len(sections),
        "hasToc": bool(structure.get("has_toc")),
        "invisibleRemoved": total_invisible_removed,
        "securityFindings": [
            {"line": f.line, "ruleId": f.rule_id, "message": f.message}
            for f in scan_findings[:30]
        ],
        "glossaryCount": len(glossary),
        "patternCount": len(patterns),
        "sources": [
            {
                "filename": s["filename"],
                "sourceFile": s["source_file"],
                "format": s["format"],
                "extractionMethod": s["extraction_method"],
                "words": s["words"],
                "estimatedTokens": s["estimated_tokens"],
                "pages": s["pages"],
            }
            for s in extracted_sources
        ],
        "sectionsPreview": [
            {
                "index": sec["index"],
                "title": sec["title"],
                "words": sec["words"],
                "tokens": sec["tokens"],
                "preview": sec["preview"],
            }
            for sec in sections
        ],
        "glossaryPreview": glossary[:20],
        "patternsPreview": patterns[:20],
    }
    (out_dir / "meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(meta, ensure_ascii=False))
    return 0


def cmd_build_skill(args: argparse.Namespace) -> int:
    if not _ensure_import_path(DEFAULT_BOOK_TO_SKILL_DIR):
        raise RuntimeError(f"myBookToSkills not found at {DEFAULT_BOOK_TO_SKILL_DIR}")

    from book_to_skill.sanitize import sanitize_extracted_text
    from book_to_skill.utils import estimate_tokens
    from tools.scan_generated_skill import scan_generated_skill
    from tools.validate_skill import audit

    source_dir = Path(args.source_dir)
    sections_file = source_dir / "sections.json"
    meta_file = source_dir / "meta.json"
    if not sections_file.exists():
        raise RuntimeError(f"Extracted sections.json not found in {source_dir}")

    sections_payload = json.loads(sections_file.read_text(encoding="utf-8"))
    meta_payload = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.exists() else {}
    sections = sections_payload.get("sections", [])
    glossary = sections_payload.get("glossary", [])
    patterns = sections_payload.get("patterns", [])

    slug = _slugify(args.slug or args.title or meta_payload.get("name", "domain-skill"))
    title = (args.title or meta_payload.get("name") or slug).strip()
    description = (
        args.description
        or f"Structured domain skill and training reference distilled from {title}."
    ).strip()
    if len(description) > 1000:
        description = description[:997] + "..."

    skill_dir = Path(args.output_dir)
    chapters_dir = skill_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)

    chapter_links = []
    for idx, sec in enumerate(sections, start=1):
        ch_filename = f"ch{idx:02d}-{_slugify(sec['title'])[:40]}.md"
        ch_body, _ = sanitize_extracted_text(sec["text"])
        ch_md = (
            f"# {sec['title']}\n\n"
            f"- **Estimated tokens:** ~{sec.get('tokens', estimate_tokens(ch_body))}\n"
            f"- **Words:** {sec.get('words', len(ch_body.split()))}\n\n"
            f"{ch_body}\n"
        )
        (chapters_dir / ch_filename).write_text(ch_md, encoding="utf-8")
        chapter_links.append((idx, sec["title"], ch_filename, sec.get("tokens", 0)))

    glossary_lines = [f"# {title} — Glossary & Lexicon\n"]
    if glossary:
        for item in glossary:
            term, _ = sanitize_extracted_text(item["term"])
            defn, _ = sanitize_extracted_text(item["definition"])
            glossary_lines.append(f"- **{term}** ({item['section']}): {defn}")
    else:
        glossary_lines.append("No explicit term:definition entries were auto-detected; refer to chapter files.")
    (skill_dir / "glossary.md").write_text("\n".join(glossary_lines) + "\n", encoding="utf-8")

    pattern_lines = [f"# {title} — Patterns & Decision Rules\n"]
    if patterns:
        for item in patterns:
            ptitle, _ = sanitize_extracted_text(item["title"])
            psummary, _ = sanitize_extracted_text(item["summary"])
            pattern_lines.append(f"## {ptitle}\n- **Source:** {item['section']}\n- {psummary}\n")
    else:
        pattern_lines.append("Refer to individual chapter guides for structured procedures.")
    (skill_dir / "patterns.md").write_text("\n".join(pattern_lines) + "\n", encoding="utf-8")

    cheatsheet_lines = [
        f"# {title} — Cheatsheet\n",
        "| Section | File | Est. Tokens |",
        "|---|---|---|",
    ]
    for idx, sec_title, ch_file, tok in chapter_links:
        cheatsheet_lines.append(f"| {idx}. {sec_title} | `chapters/{ch_file}` | ~{tok} |")
    (skill_dir / "cheatsheet.md").write_text("\n".join(cheatsheet_lines) + "\n", encoding="utf-8")

    skill_md_lines = [
        "---",
        f"name: {slug}",
        f'description: "{description.replace(chr(34), chr(39))}"',
        "license: MIT",
        "---",
        "",
        f"# {title}",
        "",
        description,
        "",
        "## Core Mental Models & Knowledge Map",
        f"- **Total sections:** {len(chapter_links)}",
        f"- **Lexicon terms:** {len(glossary)}",
        f"- **Extracted patterns:** {len(patterns)}",
        f"- **Corpus estimate:** ~{meta_payload.get('estimatedTokens', 0):,} tokens",
        "",
        "## Supporting References (Load On-Demand)",
        "- [`glossary.md`](glossary.md) — Alphabetical lexicon and domain terminology",
        "- [`patterns.md`](patterns.md) — Actionable patterns, techniques, and rules",
        "- [`cheatsheet.md`](cheatsheet.md) — Section index and token-budget lookup",
        "",
        "## Chapter Index",
    ]
    for idx, sec_title, ch_file, tok in chapter_links:
        skill_md_lines.append(f"{idx}. [{sec_title}](chapters/{ch_file}) (~{tok} tokens)")

    skill_md_path = skill_dir / "SKILL.md"
    skill_md_path.write_text("\n".join(skill_md_lines) + "\n", encoding="utf-8")

    errors, warns = audit(str(skill_md_path), lens=args.lens)
    findings = scan_generated_skill(skill_dir)

    result = {
        "slug": slug,
        "title": title,
        "description": description,
        "lens": args.lens,
        "skillDir": str(skill_dir),
        "skillMdPath": str(skill_md_path),
        "chaptersCount": len(chapter_links),
        "glossaryCount": len(glossary),
        "patternsCount": len(patterns),
        "validation": {
            "passed": len(errors) == 0,
            "errors": errors,
            "warnings": warns,
        },
        "securityScan": {
            "passed": len(findings) == 0,
            "findings": [
                {"path": f.path, "line": f.line, "ruleId": f.rule_id, "message": f.message}
                for f in findings[:40]
            ],
        },
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


def _chunk_text_by_tokens(text: str, target_tokens: int, estimate_tokens_fn) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    # Merge short leading headings/metadata into the next paragraph so a chunk is never header-only
    merged: list[str] = []
    idx = 0
    while idx < len(paragraphs):
        cur = paragraphs[idx]
        if idx + 1 < len(paragraphs) and (cur.startswith("#") or estimate_tokens_fn(cur) < 35):
            merged.append(f"{cur}\n\n{paragraphs[idx + 1]}")
            idx += 2
        else:
            merged.append(cur)
            idx += 1

    chunks: list[str] = []
    buf: list[str] = []
    buf_tokens = 0
    for para in merged:
        ptok = estimate_tokens_fn(para)
        if buf and buf_tokens + ptok > target_tokens:
            chunks.append("\n\n".join(buf))
            buf = [para]
            buf_tokens = ptok
        else:
            buf.append(para)
            buf_tokens += ptok
    if buf:
        chunks.append("\n\n".join(buf))
    return chunks


def _load_records_from_skill_dir(skill_dir: Path, estimate_tokens_fn) -> dict[str, Any]:
    skill_md = (skill_dir / "SKILL.md").read_text(encoding="utf-8") if (skill_dir / "SKILL.md").exists() else ""
    title = skill_dir.name
    m = re.search(r"^#\s+(.+)$", skill_md, re.MULTILINE)
    if m:
        title = m.group(1).strip()

    meta_block_re = re.compile(r"^(?:-\s+\*\*Estimated tokens:\*\*.*\n?)(?:-\s+\*\*Words:\*\*.*\n?)?", re.MULTILINE)
    sections: list[dict[str, Any]] = []
    chapters_dir = skill_dir / "chapters"
    if chapters_dir.exists():
        for ch_path in sorted(chapters_dir.glob("*.md")):
            txt = ch_path.read_text(encoding="utf-8").strip()
            txt = meta_block_re.sub("", txt).strip()
            h = re.search(r"^#\s+(.+)$", txt, re.MULTILINE)
            sec_title = h.group(1).strip() if h else ch_path.stem
            sections.append({"title": sec_title, "text": txt, "tokens": estimate_tokens_fn(txt)})

    for extra in ("patterns.md", "cheatsheet.md"):
        extra_path = skill_dir / extra
        if extra_path.exists():
            txt = extra_path.read_text(encoding="utf-8").strip()
            if txt:
                sections.append({"title": f"{title} ({extra})", "text": txt, "tokens": estimate_tokens_fn(txt)})

    if not sections and skill_md:
        sections.append({"title": title, "text": skill_md, "tokens": estimate_tokens_fn(skill_md)})

    glossary: list[dict[str, str]] = []
    glossary_path = skill_dir / "glossary.md"
    if glossary_path.exists():
        for line in glossary_path.read_text(encoding="utf-8").splitlines():
            gm = re.match(r"^[-*]\s+\*\*([^*]+)\*\*(?:\s+\(([^)]+)\))?:\s+(.+)$", line.strip())
            if gm:
                glossary.append(
                    {
                        "term": gm.group(1).strip(),
                        "section": (gm.group(2) or title).strip(),
                        "definition": gm.group(3).strip(),
                    }
                )

    return {"title": title, "skillMd": skill_md, "sections": sections, "glossary": glossary}


def cmd_compile_dataset(args: argparse.Namespace) -> int:
    if not _ensure_import_path(DEFAULT_BOOK_TO_SKILL_DIR):
        raise RuntimeError(f"myBookToSkills not found at {DEFAULT_BOOK_TO_SKILL_DIR}")

    from book_to_skill.sanitize import sanitize_extracted_text
    from book_to_skill.utils import estimate_tokens

    input_dir = Path(args.input_dir)
    if (input_dir / "SKILL.md").exists():
        bundle = _load_records_from_skill_dir(input_dir, estimate_tokens)
    elif (input_dir / "sections.json").exists():
        sec_data = json.loads((input_dir / "sections.json").read_text(encoding="utf-8"))
        meta_data = (
            json.loads((input_dir / "meta.json").read_text(encoding="utf-8"))
            if (input_dir / "meta.json").exists()
            else {}
        )
        bundle = {
            "title": meta_data.get("name", input_dir.name),
            "skillMd": "",
            "sections": sec_data.get("sections", []),
            "glossary": sec_data.get("glossary", []),
        }
    else:
        raise RuntimeError(f"No SKILL.md or sections.json found in {input_dir}")

    title = bundle["title"]
    system_prompt = (
        args.system_prompt.strip()
        if args.system_prompt
        else f"You are a specialized local assistant trained on the '{title}' skill and knowledge base. Answer accurately using the structured concepts and terminology."
    )
    target_tokens = max(120, min(2048, int(args.target_tokens)))

    raw_rows: list[dict[str, Any]] = []

    for sec in bundle["sections"]:
        sec_title, _ = sanitize_extracted_text(sec["title"])
        sec_text, _ = sanitize_extracted_text(sec["text"])
        chunks = _chunk_text_by_tokens(sec_text, target_tokens, estimate_tokens)
        for idx, chunk in enumerate(chunks, start=1):
            if len(chunk.strip()) < 40:
                continue
            part_label = f" (Part {idx}/{len(chunks)})" if len(chunks) > 1 else ""
            if args.format == "text":
                raw_rows.append({"text": f"## {sec_title}{part_label}\n\n{chunk}"})
            elif args.format == "instruction":
                raw_rows.append(
                    {
                        "messages": [
                            {
                                "role": "user",
                                "content": f"Explain the key concepts, rules, and details from {title} — {sec_title}{part_label}.",
                            },
                            {"role": "assistant", "content": chunk},
                        ]
                    }
                )
            else:
                raw_rows.append(
                    {
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {
                                "role": "user",
                                "content": f"Using the {title} skill, walk me through {sec_title}{part_label}.",
                            },
                            {"role": "assistant", "content": chunk},
                        ]
                    }
                )

    for item in bundle.get("glossary", []):
        term, _ = sanitize_extracted_text(item["term"])
        defn, _ = sanitize_extracted_text(item["definition"])
        if not term or not defn:
            continue
        if args.format == "text":
            raw_rows.append({"text": f"{term}: {defn} (Source: {item.get('section', title)})"})
        elif args.format == "instruction":
            raw_rows.append(
                {
                    "messages": [
                        {"role": "user", "content": f"Define '{term}' in the context of {title}."},
                        {"role": "assistant", "content": defn},
                    ]
                }
            )
        else:
            raw_rows.append(
                {
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"What does '{term}' mean in {title}?"},
                        {"role": "assistant", "content": defn},
                    ]
                }
            )

    # Deduplicate rows cleanly
    deduped_lines: list[str] = []
    seen_hashes: set[str] = set()
    total_tokens = 0
    sample_rows: list[Any] = []

    for row in raw_rows:
        serialized = json.dumps(row, ensure_ascii=False)
        digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        deduped_lines.append(serialized)
        total_tokens += estimate_tokens(serialized)
        if len(sample_rows) < 5:
            sample_rows.append(row)

    if not deduped_lines:
        raise RuntimeError("Compilation produced 0 training examples.")

    out_path = Path(args.output_file)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(deduped_lines)
    out_path.write_text(content, encoding="utf-8")

    print(
        json.dumps(
            {
                "outputFile": str(out_path),
                "examples": len(deduped_lines),
                "duplicatesRemoved": len(raw_rows) - len(deduped_lines),
                "estimatedTokens": total_tokens,
                "avgTokensPerExample": round(total_tokens / len(deduped_lines)),
                "sizeBytes": out_path.stat().st_size,
                "format": args.format,
                "sampleRows": sample_rows,
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Froge Trainer <-> myBookToSkills bridge")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check")

    p_extract = sub.add_parser("extract")
    p_extract.add_argument("--inputs", nargs="+", required=True)
    p_extract.add_argument("--mode", choices=("text", "technical"), default="text")
    p_extract.add_argument("--name", default="")
    p_extract.add_argument("--output-dir", required=True)

    p_skill = sub.add_parser("build-skill")
    p_skill.add_argument("--source-dir", required=True)
    p_skill.add_argument("--slug", default="")
    p_skill.add_argument("--title", default="")
    p_skill.add_argument("--description", default="")
    p_skill.add_argument("--lens", choices=("claude", "copilot", "amp"), default="claude")
    p_skill.add_argument("--output-dir", required=True)

    p_compile = sub.add_parser("compile-dataset")
    p_compile.add_argument("--input-dir", required=True)
    p_compile.add_argument("--format", choices=("messages", "instruction", "text"), default="messages")
    p_compile.add_argument("--target-tokens", type=int, default=450)
    p_compile.add_argument("--system-prompt", default="")
    p_compile.add_argument("--output-file", required=True)

    args = parser.parse_args()
    if args.command == "check":
        return cmd_check()
    if args.command == "extract":
        return cmd_extract(args)
    if args.command == "build-skill":
        return cmd_build_skill(args)
    if args.command == "compile-dataset":
        return cmd_compile_dataset(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
