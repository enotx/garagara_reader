#!/usr/bin/env python3
"""Build the bundled ECDICT SQLite dictionary.

The ECDICT CSV is distributed under the MIT license. This script only re-shapes
it into the tables consumed by the reader; it does not add any dictionary data.

Usage:
    python3 tools/dict-build/build_dict.py --input ecdict.csv --output ecdict.sqlite
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

SCHEMA = """
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA temp_store = MEMORY;

CREATE TABLE dict_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL COLLATE NOCASE,
  lemma TEXT NOT NULL COLLATE NOCASE,
  phonetic TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  pos TEXT NOT NULL DEFAULT '',
  collins INTEGER,
  bnc INTEGER,
  frq INTEGER,
  exchange TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX entries_word ON entries(word COLLATE NOCASE);
CREATE INDEX entries_lemma ON entries(lemma COLLATE NOCASE);

CREATE TABLE forms (
  form TEXT NOT NULL COLLATE NOCASE,
  lemma TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (form, lemma)
) WITHOUT ROWID;

CREATE INDEX forms_form ON forms(form COLLATE NOCASE);

CREATE TABLE phrases (
  phrase TEXT PRIMARY KEY COLLATE NOCASE,
  token_count INTEGER NOT NULL
) WITHOUT ROWID;
"""

FORM_CODES = frozenset("0pdis3rt")


def normalize_word(value: str) -> str:
    return " ".join(value.replace("\u00a0", " ").split())


def to_int(value: str) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def parse_exchange(word: str, exchange: str) -> tuple[str, list[tuple[str, str]]]:
    """Returns (lemma, [(form, lemma), ...]) for an ECDICT exchange field.

    ECDICT codes:
      0  lemma of an inflected entry
      p/d/i/s/3/r/t  past, past participle, -ing, plural, 3rd person,
                     comparative, superlative
    """
    lower_word = word.lower()
    lemma = lower_word
    forms: list[tuple[str, str]] = []
    for part in exchange.split("/"):
        if ":" not in part:
            continue
        code, value = part.split(":", 1)
        value = normalize_word(value).lower()
        if not value:
            continue
        if code == "0":
            lemma = value
            if value != lower_word:
                forms.append((lower_word, value))
            continue
        if code in FORM_CODES and value != lemma:
            forms.append((value, lemma))
    return lemma, forms


def build(input_path: Path, output_path: Path) -> dict[str, int]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    connection = sqlite3.connect(str(output_path))
    try:
        connection.executescript(SCHEMA)
        csv.field_size_limit(sys.maxsize)
        stats = {"rows": 0, "entries": 0, "forms": 0, "phrases": 0}

        with input_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None or "word" not in reader.fieldnames:
                raise ValueError("input CSV is missing the ECDICT 'word' column")

            insert_entry = connection.cursor()
            insert_form = connection.cursor()
            insert_phrase = connection.cursor()
            batch: list[tuple[object, ...]] = []
            forms: set[tuple[str, str]] = set()
            phrases: dict[str, int] = {}

            for row in reader:
                stats["rows"] += 1
                word = normalize_word(row.get("word") or "")
                if not word:
                    continue
                exchange = (row.get("exchange") or "").strip()
                lemma, parsed_forms = parse_exchange(word, exchange)
                batch.append(
                    (
                        word,
                        lemma,
                        (row.get("phonetic") or "").strip(),
                        (row.get("translation") or "").strip(),
                        (row.get("definition") or "").strip(),
                        (row.get("pos") or "").strip(),
                        to_int(row.get("collins") or ""),
                        to_int(row.get("bnc") or ""),
                        to_int(row.get("frq") or ""),
                        exchange,
                        (row.get("tag") or "").strip(),
                    )
                )
                forms.update(parsed_forms)
                if any(char.isspace() for char in word):
                    phrase = " ".join(word.lower().split())
                    phrases[phrase] = len(phrase.split())

                if len(batch) >= 5000:
                    insert_entry.executemany(
                        "INSERT OR IGNORE INTO entries "
                        "(word, lemma, phonetic, translation, definition, pos, collins, bnc, frq, exchange, tag) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        batch,
                    )
                    stats["entries"] += insert_entry.rowcount
                    batch.clear()

            if batch:
                insert_entry.executemany(
                    "INSERT OR IGNORE INTO entries "
                    "(word, lemma, phonetic, translation, definition, pos, collins, bnc, frq, exchange, tag) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    batch,
                )
                stats["entries"] += insert_entry.rowcount

            form_rows = sorted(forms)
            insert_form.executemany("INSERT OR IGNORE INTO forms (form, lemma) VALUES (?, ?)", form_rows)
            stats["forms"] = len(form_rows)
            phrase_rows = sorted(phrases.items())
            insert_phrase.executemany(
                "INSERT OR IGNORE INTO phrases (phrase, token_count) VALUES (?, ?)", phrase_rows
            )
            stats["phrases"] = len(phrase_rows)

        connection.executemany(
            "INSERT INTO dict_meta (key, value) VALUES (?, ?)",
            [
                ("schemaVersion", "1"),
                ("source", "ECDICT"),
                ("license", "MIT"),
                ("entries", str(stats["entries"])),
                ("forms", str(stats["forms"])),
                ("phrases", str(stats["phrases"])),
            ],
        )
        connection.commit()
        connection.execute("VACUUM")
    finally:
        connection.close()

    stats["bytes"] = output_path.stat().st_size
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the bundled ECDICT SQLite dictionary")
    parser.add_argument("--input", required=True, type=Path, help="path to ECDICT ecdict.csv")
    parser.add_argument("--output", required=True, type=Path, help="output SQLite path")
    args = parser.parse_args()

    stats = build(args.input, args.output)
    print(
        "rows={rows} entries={entries} forms={forms} phrases={phrases} bytes={bytes}".format(
            **stats
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
