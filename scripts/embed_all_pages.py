#!/usr/bin/env python3
"""Embed all pages in the workspace that have blocks but no node+embedding yet."""

import json, subprocess, urllib.request, time

WS_ID = "baa975b3-ec03-41a1-abd2-45a7305ee980"
OLLAMA_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"

def run_sql(sql):
    r = subprocess.run(["npx","supabase","db","query","--local"],
                       input=sql, capture_output=True, text=True,
                       cwd="/Users/Apple/projects/graphbrain")
    out = r.stdout.strip()
    if not out or out.startswith(("UPDATE","INSERT","DELETE","DO")): return {}
    return json.loads(out)

def get_embedding(text):
    text = "".join(c for c in text if ord(c) < 0x10000)
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text[:7000]}, ensure_ascii=True).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(OLLAMA_URL, data=payload,
                                         headers={"Content-Type":"application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())["embedding"]
        except Exception as e:
            if attempt < 3:
                wait = 2**attempt
                print(f"    (retry {attempt+1}, waiting {wait}s: {e})")
                time.sleep(wait)
            else:
                raise

def get_page_text(page_id, title):
    data = run_sql(f"SELECT content FROM blocks WHERE page_id='{page_id}' ORDER BY position;")
    rows = data.get("rows", [])
    parts = [title]
    def walk(node):
        if isinstance(node, dict):
            if node.get("text"): parts.append(node["text"])
            for child in node.get("content", []): walk(child)
        elif isinstance(node, list):
            for item in node: walk(item)
    for row in rows:
        content = row["content"]
        if isinstance(content, str):
            try: content = json.loads(content)
            except: pass
        walk(content)
    return "\n".join(parts)

def upsert_node(page_id):
    res = run_sql(f"""
INSERT INTO nodes (workspace_id, entity_type, entity_id, updated_at)
VALUES ('{WS_ID}','page','{page_id}',NOW())
ON CONFLICT (entity_type, entity_id) DO UPDATE SET updated_at=NOW()
RETURNING id;
""")
    return res["rows"][0]["id"]

def store_embedding(node_id, embedding):
    vec = "[" + ",".join(str(x) for x in embedding) + "]"
    run_sql(f"UPDATE nodes SET embedding='{vec}'::vector, updated_at=NOW() WHERE id='{node_id}';")

def main():
    # Get all pages with blocks but without embeddings
    data = run_sql(f"""
SELECT DISTINCT p.id, p.title
FROM pages p
JOIN blocks b ON b.page_id = p.id
WHERE p.workspace_id = '{WS_ID}'
  AND NOT EXISTS (
    SELECT 1 FROM nodes n
    WHERE n.entity_id = p.id AND n.embedding IS NOT NULL
  )
ORDER BY p.title;
""")
    pages = data.get("rows", [])
    print(f"Found {len(pages)} pages to embed.\n")

    for i, row in enumerate(pages):
        pid, title = row["id"], row["title"]
        print(f"[{i+1}/{len(pages)}] {title[:60]}")
        try:
            node_id = upsert_node(pid)
            text = get_page_text(pid, title)
            print(f"  text: {len(text)} chars")
            if len(text.strip()) < 10:
                print("  skip: too short")
                continue
            embedding = get_embedding(text)
            print(f"  embedding: {len(embedding)}-dim")
            store_embedding(node_id, embedding)
            print(f"  stored.")
            time.sleep(1)  # let Ollama breathe between requests
        except Exception as e:
            print(f"  ERROR: {e}")
            continue

    # Summary
    data2 = run_sql(f"""
SELECT COUNT(*) as total,
       SUM(CASE WHEN n.embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded
FROM nodes n WHERE n.workspace_id='{WS_ID}';
""")
    row = data2.get("rows", [{}])[0]
    print(f"\n── Summary ──  {row.get('embedded','?')}/{row.get('total','?')} nodes embedded")

if __name__ == "__main__":
    main()
