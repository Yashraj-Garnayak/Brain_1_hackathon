#!/usr/bin/env python3
"""Convert the QA Markdown plan to a styled .docx using macOS textutil.

Usage: python3 scripts/make-docx.py docs/QA-TEST-PLAN.md docs/TILE-RUSH-QA-TEST-PLAN.docx
"""
import html
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)
    return text


def convert(markdown: str) -> str:
    lines = markdown.splitlines()
    out = []
    i = 0
    list_open = None
    in_code = False
    code = []

    def close_list():
        nonlocal list_open
        if list_open:
            out.append(f"</{list_open}>")
            list_open = None

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            if in_code:
                out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
                code = []
                in_code = False
            else:
                close_list()
                in_code = True
            i += 1
            continue
        if in_code:
            code.append(line)
            i += 1
            continue
        if not line.strip():
            close_list()
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            close_list()
            level = len(m.group(1))
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
            i += 1
            continue
        if line.lstrip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|", lines[i + 1]):
            close_list()
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            rows = []
            i += 2
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            out.append("<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in header) + "</tr></thead><tbody>")
            for row in rows:
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>")
            out.append("</tbody></table>")
            continue
        m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", line)
        if m:
            kind = "ul" if m.group(2) in "-*+" else "ol"
            if list_open != kind:
                close_list()
                out.append(f"<{kind}>")
                list_open = kind
            out.append(f"<li>{inline(m.group(3))}</li>")
            i += 1
            continue
        close_list()
        out.append(f"<p>{inline(line)}</p>")
        i += 1
    close_list()
    if in_code:
        out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
    return "\n".join(out)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: make-docx.py input.md output.docx")
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    body = convert(source.read_text(encoding="utf-8"))
    document = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
body {{ font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.45; }}
h1 {{ font-size: 22pt; margin: 0 0 8pt; }}
h2 {{ font-size: 15pt; margin: 18pt 0 6pt; border-bottom: 1px solid #bbb; padding-bottom: 3pt; }}
h3 {{ font-size: 12pt; margin: 12pt 0 4pt; }}
p {{ margin: 4pt 0; }}
ul, ol {{ margin: 4pt 0 4pt 18pt; }}
li {{ margin: 2pt 0; }}
table {{ border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; }}
th, td {{ border: 1px solid #999; padding: 4pt 5pt; font-size: 9pt; vertical-align: top; }}
th {{ background: #eee; text-align: left; }}
code {{ font-family: Menlo, monospace; font-size: 9pt; background: #f3f3f3; }}
pre {{ background: #f3f3f3; padding: 8pt; font-size: 9pt; }}
</style></head><body>{body}</body></html>"""
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as fh:
        fh.write(document)
        tmp = fh.name
    try:
        subprocess.run(["textutil", "-convert", "docx", "-output", str(target), tmp], check=True)
    finally:
        Path(tmp).unlink(missing_ok=True)
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
