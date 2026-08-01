#!/usr/bin/env python3
"""
Create graph nodes for seeded pages and generate Ollama embeddings for them.
Mirrors what saveBlocks + upsertNode + scheduleEmbed would do via the Next.js
server action, but runs directly against local Supabase via the CLI.
"""

import json
import subprocess
import sys
import urllib.request

OLLAMA_URL   = "http://localhost:11434/api/embeddings"
EMBED_MODEL  = "nomic-embed-text"
WORKSPACE_ID = "3e2d9d49-0e12-4a6c-adf4-189be28e91c3"   # test_user's Workspace

PAGE_IDS = [
    ("77660934-3390-41f9-839b-29d1dafb6b5a",
     "LinkedIn Growth System — Learnings (2026 Algorithm & Funnel)"),
    ("e0f62101-75d2-4959-a0d6-c282899779c3",
     "Content Calendar — Month One (Build in Public, Phase 1)"),
    ("9cab040e-56f0-4112-a520-94e7a440176a",
     "Abubakar's Personal Story & Voice Guide"),
    ("6005d752-e757-4209-b3b3-0f66ecfa50e3",
     "Daily LinkedIn Posts - AI Authority"),
    ("580bd77a-89af-4315-9031-19810c54745a",
     "LinkedIn Profile"),
]


def run_sql(sql):
    result = subprocess.run(
        ["npx", "supabase", "db", "query", "--local"],
        input=sql,
        capture_output=True,
        text=True,
        cwd="/Users/Apple/projects/graphbrain",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    out = result.stdout.strip()
    if not out or out.startswith(("UPDATE", "INSERT", "DELETE", "DO")):
        return {}
    return json.loads(out)


def get_page_text(page_id, title):
    """Pull all block text for a page and concatenate with the title."""
    data = run_sql(
        f"SELECT content FROM blocks WHERE page_id = '{page_id}' ORDER BY position;"
    )
    rows = data.get("rows", [])
    parts = [title]

    def walk(node):
        if isinstance(node, dict):
            if node.get("text"):
                parts.append(node["text"])
            for child in node.get("content", []):
                walk(child)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for row in rows:
        content = row["content"]
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except Exception:
                pass
        walk(content)

    return "\n".join(parts)


def get_embedding(text):
    import time as _time
    text = "".join(c for c in text if ord(c) < 0x10000)
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text[:7000]}, ensure_ascii=True).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                OLLAMA_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())["embedding"]
        except Exception as e:
            if attempt < 3:
                wait = 2 ** attempt
                print(f"  (retry {attempt+1}, waiting {wait}s: {e})")
                _time.sleep(wait)
            else:
                raise


def upsert_node(page_id):
    """Insert node if missing; return node id."""
    result = run_sql(
        f"""
        INSERT INTO nodes (workspace_id, entity_type, entity_id, updated_at)
        VALUES ('{WORKSPACE_ID}', 'page', '{page_id}', NOW())
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET updated_at = NOW()
        RETURNING id;
        """
    )
    return result["rows"][0]["id"]


def store_embedding(node_id, embedding):
    vec = "[" + ",".join(str(x) for x in embedding) + "]"
    run_sql(
        f"UPDATE nodes SET embedding = '{vec}'::vector, updated_at = NOW() "
        f"WHERE id = '{node_id}';"
    )


def main():
    import time
    for page_id, title in PAGE_IDS:
        print(f"\n→ {title}")

        # 1. Ensure node exists
        node_id = upsert_node(page_id)
        print(f"  node: {node_id}")

        # 2. Build text corpus
        text = get_page_text(page_id, title)
        print(f"  text: {len(text)} chars")

        # 3. Embed
        embedding = get_embedding(text)
        print(f"  embedding: {len(embedding)}-dim vector")

        # 4. Persist
        store_embedding(node_id, embedding)
        print(f"  stored.")
        time.sleep(2)  # let Ollama settle between requests

    # verify
    data = run_sql(
        "SELECT p.title, n.embedding IS NOT NULL as embedded "
        "FROM nodes n JOIN pages p ON p.id = n.entity_id "
        "WHERE n.workspace_id = '" + WORKSPACE_ID + "' "
        "AND n.entity_type = 'page' ORDER BY p.title;"
    )
    print("\n── Verification ──")
    for row in data["rows"]:
        status = "✓ embedded" if row["embedded"] else "✗ no embedding"
        print(f"  {status}  {row['title']}")


if __name__ == "__main__":
    main()
