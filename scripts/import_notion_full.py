#!/usr/bin/env python3
"""
Full Notion workspace import into graphbrain.
Creates parent pages, databases, and row pages with content blocks.
"""
import json, re, subprocess, sys, uuid

WS_ID  = "baa975b3-ec03-41a1-abd2-45a7305ee980"
U_ID   = "6de8461b-b52e-4b1a-9add-0087933e5112"

# ── SQL helpers ──────────────────────────────────────────────────────────────

def run_sql(sql):
    r = subprocess.run(["npx","supabase","db","query","--local"],
                       input=sql, capture_output=True, text=True,
                       cwd="/Users/Apple/projects/graphbrain")
    if r.returncode != 0:
        raise RuntimeError(r.stderr[:400])
    out = r.stdout.strip()
    if not out or out.startswith(("UPDATE","INSERT","DELETE","DO","CREATE")):
        return {}
    return json.loads(out)

def new_id(): return str(uuid.uuid4())

def esc(s): return s.replace("'","''").replace("\\","\\\\")

def insert_page(page_id, parent_id, title):
    pid = f"'{parent_id}'" if parent_id else "NULL"
    run_sql(f"""
INSERT INTO pages (id, workspace_id, parent_id, title, created_by)
VALUES ('{page_id}', '{WS_ID}', {pid}, '{esc(title)}', '{U_ID}')
ON CONFLICT (id) DO NOTHING;
""")

def insert_database(db_page_id, db_id):
    run_sql(f"""
INSERT INTO databases (id, page_id, schema)
VALUES ('{db_id}', '{db_page_id}', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
""")

def insert_db_row(db_id, row_page_id):
    run_sql(f"""
INSERT INTO database_rows (database_id, page_id, fields)
VALUES ('{db_id}', '{row_page_id}', '{{}}'::jsonb)
ON CONFLICT DO NOTHING;
""")

def insert_blocks(page_id, blocks):
    if not blocks: return
    rows = []
    for i, b in enumerate(blocks):
        cj = json.dumps(b, ensure_ascii=False).replace("'","''")
        rows.append(f"(gen_random_uuid(),'{page_id}','{b['type']}','{cj}'::jsonb,{i})")
    for start in range(0, len(rows), 40):
        batch = rows[start:start+40]
        run_sql(f"INSERT INTO blocks (id,page_id,type,content,position) VALUES {','.join(batch)};")

# ── TipTap converters ─────────────────────────────────────────────────────────

def text_node(t, marks=None):
    n = {"type":"text","text":t}
    if marks: n["marks"] = marks
    return n

def parse_inline(text):
    nodes, last = [], 0
    for m in re.finditer(r'(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)', text):
        s,e = m.start(), m.end()
        if s > last: nodes.append(text_node(text[last:s]))
        if m.group(2):   nodes.append(text_node(m.group(2),[{"type":"bold"}]))
        elif m.group(3): nodes.append(text_node(m.group(3),[{"type":"italic"}]))
        elif m.group(4): nodes.append(text_node(m.group(4),[{"type":"code"}]))
        last = e
    if last < len(text): nodes.append(text_node(text[last:]))
    return nodes or [text_node(text)]

def para(t):
    clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t)
    return {"type":"paragraph","content":parse_inline(clean)}

def heading(lvl, t):
    clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t.strip())
    return {"type":"heading","attrs":{"level":min(lvl,3)},"content":parse_inline(clean)}

def hr():   return {"type":"horizontalRule"}
def bq(t):  return {"type":"blockquote","content":[para(t)]}
def bullet_list(items):
    return {"type":"bulletList","content":[
        {"type":"listItem","content":[para(i)]} for i in items
    ]}
def ordered_list(items):
    return {"type":"orderedList","content":[
        {"type":"listItem","content":[para(i)]} for i in items
    ]}

def md_to_blocks(md):
    blocks, lines = [], md.strip().split('\n')
    i, bbuf, obuf = 0, [], []
    def flush_b():
        nonlocal bbuf
        if bbuf: blocks.append(bullet_list(bbuf)); bbuf=[]
    def flush_o():
        nonlocal obuf
        if obuf: blocks.append(ordered_list(obuf)); obuf=[]
    while i < len(lines):
        line = lines[i]
        # Skip HTML table tags
        if re.match(r'^\s*</?(?:table|tr|td|th)', line):
            i+=1; continue
        # HR
        if re.match(r'^-{3,}$|^_{3,}$', line.strip()):
            flush_b(); flush_o(); blocks.append(hr()); i+=1; continue
        # Heading
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            flush_b(); flush_o()
            blocks.append(heading(len(m.group(1)), m.group(2))); i+=1; continue
        # Blockquote
        if line.startswith('> ') or line == '>':
            flush_b(); flush_o()
            blines = [line[2:] if line.startswith('> ') else '']
            while i+1 < len(lines) and (lines[i+1].startswith('> ') or lines[i+1]=='>'):
                i+=1; blines.append(lines[i][2:] if lines[i].startswith('> ') else '')
            combined = ' '.join(l for l in blines if l)
            if combined: blocks.append(bq(combined))
            i+=1; continue
        # Task list
        m = re.match(r'^\s*-\s+\[[ x]\]\s+(.*)', line)
        if m:
            flush_o()
            bbuf.append(re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', m.group(1).strip()))
            i+=1; continue
        # Bullet
        m = re.match(r'^\s*[-*]\s+(.*)', line)
        if m:
            flush_o()
            bbuf.append(re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', m.group(1).strip()))
            i+=1; continue
        # Ordered
        m = re.match(r'^\s*\d+\.\s+(.*)', line)
        if m:
            flush_b()
            obuf.append(re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', m.group(1).strip()))
            i+=1; continue
        # Empty
        if not line.strip():
            flush_b(); flush_o(); i+=1; continue
        # Paragraph
        flush_b(); flush_o()
        clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', line.strip())
        if clean: blocks.append(para(clean))
        i+=1
    flush_b(); flush_o()
    return blocks

# ── Page content ──────────────────────────────────────────────────────────────

PAGES = {}  # title → (page_id, parent_id, content_md)

def reg(title, parent_id, content_md):
    pid = new_id()
    PAGES[title] = (pid, parent_id, content_md)
    return pid

# ─── SECTION PARENTS ─────────────────────────────────────────────────────────
AI_PARENT  = reg("AI Portfolio", None, "## AI Portfolio\n\nUpwork portfolio and catalog pages for AI engineering projects.")
TRIVIO_P   = reg("Trivio", None, "## Trivio\n\nProduct, market research, and marketing assets for Trivio — AI-native accounting for freelancers.")
CLIENT_P   = reg("Client Work", None, "## Client Work\n\nLinkedIn optimization and strategy work for clients.")

# ─── AI PORTFOLIO PAGES ───────────────────────────────────────────────────────

reg("Enterprise RAG Chatbot — Multi-Subsidiary Conglomerate", AI_PARENT, """
## The Challenge

A holding company with nine subsidiaries needed a unified AI assistant across HR, operations, manufacturing, and executive functions. Employees wasted hours hunting for data through siloed systems, emailing reports, and waiting on other departments.

---

## What We Built

**Nexus** — an internal AI assistant powered by AWS Bedrock and Claude Sonnet 3.7, deployed across the entire group. One interface. Every employee. Role-based access baked into the retrieval layer.

- An HR analyst asking "what's the turnover rate in subsidiary 4 this quarter?" gets a sourced answer from HR documents
- An executive asking the same question gets that, plus the financial impact
- A factory floor supervisor gets live operational data
- A junior employee asking gets a polite "you don't have access to that" — handled gracefully

Leave booking: employees type "I want to take Friday off" and the chatbot reads their SAP leave balance, submits the request, and confirms — no SAP login required.

---

## Why It Was Hard

Designing the LangGraph workflow to reliably classify intent (data query vs SAP action), route to the right path, and fail gracefully. The second hardest part was memory architecture: each user needed persistent conversation history in DynamoDB, fetched by Lambda at the start of every turn, written back at the end — without state bleeding between sessions.

Every design decision had a security implication. Every feature had a scale implication.

---

## Key Results

- HR teams stopped fielding repetitive employee queries about leave, benefits, and policies
- Operations managers got production visibility on demand
- Executives could ask natural language questions about revenue across subsidiaries
- 68% reduction in BI staff queries, 89% reduction in HR department queries

---

## Tech Stack

- **Chatbot Workflow:** Python, LangGraph (AWS EC2)
- **LLM:** AWS Bedrock — Anthropic Claude Sonnet 3.7
- **Vector DB / RAG:** AWS Knowledge Bases
- **Memory:** AWS Lambda + DynamoDB
- **Backend:** FastAPI
- **ERP Integration:** SAP API
- **Auth:** JWT + RBAC middleware

---

## RBAC Design

4-tier access model:
- **HR:** Employee statistics, leave rates, turnover, productivity, benefits
- **Operations/Manufacturing:** Production status, product tracking, process metrics
- **Executives:** Profitability, revenue, cash flow, cross-subsidiary KPIs
- **All Employees:** Leave booking, company policies, general HR documents

Access filters applied at the retrieval layer — each query scoped to only the document namespaces the user's role permits. No way to prompt-inject into another role's data.
""")

reg("Text-to-SQL AI Chatbot — Natural Language Database Access", AI_PARENT, """
## Service Overview

Production-ready Text-to-SQL AI agent that connects directly to your database and lets any team member ask questions in plain English.

**Pricing:** Starter $700 · Standard $1,600 · Advanced $3,200

---

## What Clients Receive

- Natural language to SQL pipeline connected to live database (PostgreSQL, MySQL, Redshift, SQL Server, BigQuery)
- Self-correcting validation loop: generates SQL, executes it, checks whether result actually answered the question
- Deep schema context injection: table definitions, column descriptions, sample values, relationship mappings
- Plain-English responses: raw query results translated into readable answers
- Session memory: users can ask follow-up questions without repeating themselves
- Clean chat UI or API endpoint ready to integrate into internal tools
- Full handover: source code, schema documentation, deployment guide

---

## Stack

AWS Bedrock · LangGraph · Amazon Redshift · Python · FastAPI

---

## Packages

**Starter ($700):** 1 database, up to 10 tables, basic SQL generation, plain-English output, source code + deployment guide

**Standard ($1,600):** 1 database, up to 25 tables, self-correcting validation loop, session memory, schema documentation

**Advanced ($3,200):** 1–2 databases, unlimited tables, validation loop, session memory, schema context injection, AWS Bedrock LLM, chat UI + API + handover call

---

## Client Requirements

1. Database type and connection credentials
2. Schema export or ERD with table/column names and relationships
3. Column descriptions or data dictionary if names are non-obvious
4. List of the 10–15 most common questions your team currently asks
5. Preferred LLM: AWS Bedrock (Claude Sonnet) or OpenAI
6. Preferred delivery: embedded chat UI or API endpoint

---

## Work Process

**Step 1 — Schema audit and context mapping (Days 1-2):** Review schema, document column semantics, identify join paths, map questions to tables.

**Step 2 — Build, validate, deliver:** Build the Text-to-SQL pipeline, implement self-correcting validation loop, tune against real schema, deploy. Source code + deployment guide + schema documentation + live walkthrough.

---

## FAQs

**What happens when the agent generates a wrong query?** Standard and Advanced include a self-correcting validation loop. The agent checks whether the result answered the question, diagnoses the error, and rewrites. Users only ever see validated answers.

**Will it work on my production database schema?** Yes. Schema context injection means the agent is tuned to your actual table names, column names, and relationships.

**What if I need to add tables after delivery?** Adding new tables means updating the schema context document — documented in the handover guide so your team can do it independently.
""")

reg("AI Workflow Automation with LangGraph — Multi-Step Agents", AI_PARENT, """
## Service Overview

Multi-step agentic workflows: systems that receive a trigger, make decisions, call APIs, handle exceptions, and confirm the final state — without a human in the loop at every turn.

**Pricing:** Starter $800 · Standard $1,800 · Advanced $3,500

---

## What Clients Receive

- Stateful LangGraph workflow: conditional routing, branching logic, human-in-the-loop checkpoints
- Session memory via DynamoDB — users never repeat context mid-conversation
- Intent classification and graceful edge-case handling (ambiguous inputs, unavailable slots, fallbacks)
- Deployed on AWS Lambda + API Gateway — serverless, scalable, production-ready
- Full handover: architecture diagram, source code, deployment guide

---

## Stack

LangGraph · LangChain · AWS Bedrock (Claude Sonnet) · Lambda · DynamoDB · FastAPI

---

## Packages

**Starter ($800):** 1 intent flow, 1 API integration, session memory, AWS deployment, source code + deployment guide

**Standard ($1,800):** Up to 3 intent flows, 3 API integrations, full edge case handling, session memory, architecture diagram + source code

**Advanced ($3,500):** Unlimited intent flows, up to 6 API integrations, multi-tenant or role-based routing, full AWS Lambda + API Gateway deployment, handover call

---

## Client Requirements

1. Description of the workflow to automate
2. List of systems the agent needs to connect to
3. API documentation or credentials for each integration
4. Description of user types if role-based routing is needed
5. Any existing codebase, infrastructure details, or AWS account access
6. Sample edge cases or failure scenarios the agent must handle

---

## Work Process

**Step 1 — Scope and architecture (Days 1-2):** Align on full workflow, triggers, intent paths, API integrations, edge cases. Deliver architecture diagram before writing a line of code.

**Step 2 — Build, test, deploy:** Build LangGraph workflow, integrate APIs, implement session memory, test against real edge cases, deploy to AWS.

---

## Past Results

NEMT booking assistant — full ride booking, modification, and cancellation via chat. Zero repeated inputs within a session. Graceful handling of unavailable time slots.
""")

reg("Custom RAG Chatbot — AWS Bedrock + Vector Search", AI_PARENT, """
## Service Overview

Production-ready RAG chatbots that let teams query documents, manuals, and data in plain English — with answers that cite the source.

**Pricing:** Starter $750 · Standard $1,800 · Advanced $3,800

---

## What Clients Receive

- RAG pipeline on your data (PDFs, Confluence, SharePoint, SQL, or APIs)
- Hybrid semantic + keyword retrieval for high-accuracy responses
- Role-based access control: each user sees only what they're permitted to
- AWS Bedrock (Claude Sonnet) or OpenAI — your choice
- Clean chat UI or API endpoint, ready to integrate
- Source code, deployment guide, and 30-min handover call

---

## Stack

AWS Bedrock · LangChain · Pinecone / pgvector · FastAPI · React

---

## Packages

**Starter ($750):** 1 data source (PDF or SQL), semantic retrieval, source citations, chat UI or API endpoint

**Standard ($1,800):** Up to 3 data sources, hybrid semantic + keyword search, RBAC up to 3 roles, architecture diagram

**Advanced ($3,800):** Up to 6 data sources, hybrid search with reranking, RBAC across unlimited roles, LLM choice, chat UI + API + handover call

---

## Past Results

Multi-subsidiary enterprise deployment with SAP integration. RBAC-enforced retrieval across 3 business units. 40% reduction in manual document lookup time.

---

## How RBAC Works

Access control is enforced at the retrieval layer — not in the UI. A user cannot query into documents outside their permission scope regardless of how the question is phrased.
""")

reg("AI Lead Scoring & Routing — Assign Leads to Agents Most Likely to Convert", AI_PARENT, """
## Service Overview

AI-powered lead allocation system that scores each incoming lead, ranks agents by conversion probability for that specific lead profile, and routes the lead to the agent most likely to close it.

**Pricing:** Starter $900 · Standard $2,200 · Advanced $4,500

---

## What Clients Receive

- Lead scoring model built on historical CRM data: behavioral, demographic, and engagement signals
- Bayesian agent-lead matching: conversion probability per agent-lead pair
- Intelligent routing engine: assigned in real time based on ranked agent-lead fit, availability, workload balance
- CRM integration: Salesforce, HubSpot, or GoHighLevel
- Stale score detection: agent performance scores update on schedule
- Fallback allocation: top-ranked agent unavailable → routes to next best fit, not round-robin
- A/B testing framework: switchback design to measure lift against existing method

---

## Stack

Python · Bayesian Model · Salesforce / HubSpot / GHL · AWS

---

## Packages

**Starter ($900):** Lead scoring model on historical data, ranked lead output per agent, scoring logic documentation

**Standard ($2,200):** Scoring model + real-time routing engine + CRM integration + fallback allocation

**Advanced ($4,500):** Bayesian scoring, CRM integration, fallback, A/B switchback testing framework, performance dashboard, handover call

---

## Client Requirements

1. CRM export of historical lead data with lead attributes and outcome labels
2. Agent roster with tenure, specialization, and existing performance data
3. CRM platform and API access (Salesforce, HubSpot, GoHighLevel)
4. Minimum 6 months of historical lead-outcome data per agent
5. Definition of "conversion": booked call, signed contract, paid invoice
6. Preferred routing constraints

---

## How It's Different from Built-in CRM Lead Scoring

Built-in CRM scoring ranks leads by quality but assigns them the same way regardless of agent fit. This system scores each agent-lead pair separately — the routing decision is based on who is most likely to convert this specific lead.
""")

reg("E-Commerce AI Search Assistant — Conversational Product Discovery", AI_PARENT, """
## The Challenge

An e-commerce platform's keyword-based search was failing customers who couldn't translate their needs into the right search terms. High drop-off at the search stage was directly impacting conversion. The platform needed a search experience that could understand natural language intent, ask clarifying questions to narrow down options, and surface genuinely relevant products.

---

## What We Built

A conversational product search assistant powered by AWS Bedrock and Claude Sonnet 3.7, on top of AWS Kendra.

The key difference: the **clarification loop**. When a customer types "I need a gift for my dad", the assistant asks follow-up questions ("What's his age range? Hobbies? Budget?"). Each answer narrows the semantic search query sent to Kendra, progressively refining the result set until the assistant is confident.

LangGraph manages this as a stateful graph — tracking what's been established, what's still ambiguous, deciding at each node whether to ask another question or trigger the final product search.

---

## Why It Was Hard

Knowing *when to stop asking questions*. Ask too many and the customer abandons. Ask too few and results are no better than keyword search. The intent classifier had to make a real-time decision at every turn.

Second challenge: query construction. AWS Kendra needs well-formed queries — the pipeline had to translate conversational context accumulated over multiple turns into a single structured, high-signal query.

Third: relevance ranking and explanation. Returning a shortlist with a plain-English reason for each match — "This one fits because you mentioned a tight budget and need for durability" — required careful prompt engineering grounded in what the customer actually said.

---

## Key Results

- Natural language search replacing keyword guessing
- Clarification loop: ambiguous queries resolved through targeted follow-up
- Grounded recommendations with plain-English explanations
- Reduced search drop-off; customers reaching relevant products faster

---

## Tech Stack

- **Chatbot Workflow:** Python, LangGraph (AWS EC2)
- **LLM:** AWS Bedrock — Anthropic Claude Sonnet 3.7
- **Search / RAG:** AWS Kendra (product catalogue index)
- **Memory:** AWS Lambda + Amazon DynamoDB
- **Backend:** FastAPI
- **Auth:** JWT
""")

reg("Medical Ride Booking Assistant — Conversational AI for NEMT", AI_PARENT, """
## The Challenge

A non-emergency medical transportation (NEMT) provider needed to replace a manual, phone-based ride booking process. Missed bookings, miscommunications, and scheduling errors were recurring. For elderly and disabled patients, the phone process was sometimes barrier enough to skip appointments entirely.

The constraint was trust. This wasn't a product recommendation engine. These were patients getting to medical appointments. The system had to be accurate, clear, and never leave someone thinking their ride was booked when it wasn't.

---

## What We Built

A conversational appointment booking assistant powered by AWS Bedrock and Claude Sonnet 3.7, with a LangGraph workflow managing the full booking dialogue.

A patient opens the chat and describes what they need. The assistant guides them through booking naturally, asking for missing details one at a time. It checks availability, confirms details back to the patient in plain language **before committing**, and issues a booking confirmation with a reference number.

The same interface handles checking, modifying, and cancelling existing bookings. The LangGraph workflow routes each intent to the correct action path and always confirms the final state before closing the interaction.

---

## Why It Was Hard

**Intent reliability.** A booking assistant that occasionally books the wrong time, or confirms a ride that didn't actually get created, is worse than no assistant at all. Every action had to be confirmed in plain English before execution.

**Edge cases everywhere.** Unavailable time slots, unparseable addresses, mid-booking mind changes, ambiguous phrasing — each required explicit handling in the LangGraph node graph.

**Accessibility.** Patients weren't always tech-savvy. Responses had to be short, clear, jargon-free. Claude's response generation was tightly prompted to maintain this register throughout.

---

## Key Results

- Full booking dialogue in plain English: new bookings, checks, modifications, cancellations
- Explicit confirmation step before every write action
- Accessible response register designed for elderly and non-technical users
- Reduced manual booking intake for staff
- Lower barrier to booking for patients who found phone processes difficult

---

## Tech Stack

- **Chatbot Workflow:** Python, LangGraph (AWS EC2)
- **LLM:** AWS Bedrock — Anthropic Claude Sonnet 3.7
- **Memory:** AWS Lambda + Amazon DynamoDB
- **Backend:** FastAPI
- **Auth:** JWT
- **Booking System:** External REST API integration

---

## Booking Dialogue Flow

1. **Intent Detection** — classifies: new booking, check existing, modify, or cancel
2. **Information Gathering** — collects required fields one at a time
3. **Availability Check** — booking system queried for the requested time slot
4. **Confirmation** — full booking details read back to patient for explicit confirmation
5. **Booking Execution** — confirmed booking written to system, reference number generated
6. **Confirmation Message** — patient receives plain-English summary with reference number
""")

reg("AI-Native Personal Finance Web App", AI_PARENT, """
## The Challenge

Personal finance apps have a usability problem. They're built around menus, forms, and dashboards that require the user to already know what they want to do. The client wanted something different: a personal finance app where the AI wasn't a feature bolted on the side — it was the interface itself.

Every action a user could take through the UI, they could also describe in plain English to the chat assistant. Not as a shortcut. As a first-class, equally capable alternative path through the entire application.

---

## What We Built

An AI-native personal finance web app where the conversational interface and the manual UI are two views of exactly the same application.

- **Manual side:** Clean Next.js frontend with Tailwind UI for managing income, expenses, budgets, savings goals, and financial summaries
- **AI side:** Chat interface powered by Gemini API — "Add a 45 dollar grocery expense for today", "What did I spend on food last month?", "Set my dining out budget to 200 dollars"

The assistant processes the intent, calls the same backend functions the UI uses, and confirms the action back to the user. One shared TypeScript backend, two ways in.

---

## Why It Was Hard

Making the two surfaces truly equivalent without duplicating logic. The AI layer needed to map natural language intents to specific backend operations with the right parameters, every time, reliably.

Action confirmation: before executing a write operation, the AI needed to confirm what it was about to do in plain language and wait for explicit approval.

Three-instance deployment on Hostinger (Next.js frontend, TypeScript backend, PostgreSQL each on separate instances) required careful coordination.

---

## Key Results

- Full feature parity between UI and chat: every manual action equally executable through AI chat
- Single shared backend: no duplicated logic, new features automatically available in both surfaces
- Structured intent extraction via Gemini function calling ensuring reliable action mapping
- Explicit confirmation step for all write operations via chat

---

## Tech Stack

- **Frontend:** Next.js, Tailwind CSS
- **Backend:** TypeScript (Node.js)
- **AI / LLM:** Google Gemini API
- **Database:** PostgreSQL (dedicated instance)
- **Deployment:** Hostinger (3 separate instances)
- **Auth:** JWT / session-based authentication

---

## Action Parity Examples

- Add transaction: Form submit ↔ "Add a 45 dollar grocery expense"
- Set budget: Budget screen ↔ "Set my dining budget to 200"
- Create savings goal: Goals screen ↔ "Create a holiday goal for 1500 dollars"
- View spending summary: Dashboard ↔ "What did I spend last month?"
""")

# ─── TRIVIO PAGES ────────────────────────────────────────────────────────────

reg("Trivio — Ideal Customer Profile (ICP)", TRIVIO_P, """
## Overview

Trivio is a freemium, full-stack SaaS accounting platform for non-accountants — freelancers, solopreneurs, and small business owners. Pricing: **Free forever** (5 AI extractions/mo) → **Pro at $29/mo or $290/yr**.

---

## Primary ICP — The Overwhelmed Solopreneur

> "I run a real business but I'm doing my books in a spreadsheet and dreading tax season."

**Firmographics:**
- Business type: Freelancer, consultant, independent contractor, solo agency
- Team size: 1 person (occasionally 1–3 contractors)
- Annual revenue: $30K–$150K
- Business age: 1–4 years old
- Geography: US, UK, Canada, Australia, India
- Industry: Design, development, copywriting, marketing, coaching, photography, legal, finance consulting

**Psychographics:**
- Currently manages finances in Excel/Google Sheets or relies on a spreadsheet accountant once a year
- Has experienced at least one "tax surprise"
- Spends 3–6 hours per month manually categorising expenses
- Generates 5–30 invoices per month
- Willing to pay for tools that save time but needs to feel the ROI within the first week

**Jobs to Be Done:**
1. Know instantly whether the business is profitable this month
2. Send professional invoices and get paid faster
3. Have clean, exportable records at tax time without hiring a bookkeeper
4. Capture receipts on the go without losing them
5. Understand cash position before making a spending decision

**Top Pain Points:**
- Tax scramble — digging through bank statements at year-end
- Invoice chasing — no visibility into which clients owe money
- No real-time P&L — can't answer "am I making money?" without a manual calculation
- Fear of accounting complexity — "double-entry", "journal entries" feel like a foreign language
- Existing tools are too complex (QuickBooks) or too limited (Wave) or too expensive (FreshBooks)

**Conversion Triggers:**
- Approaching quarterly tax filing
- Just landed a major client and need to look professional
- Got burned by a late payment and want AR tracking
- Hit the 5 AI extraction limit on the free tier

---

## Secondary ICP — The Growth-Stage Small Business

> "We've grown past the point where spreadsheets work, but we're not big enough to justify a $500/mo enterprise tool."

**Firmographics:**
- Business type: Small service business, boutique agency, e-commerce, small retail
- Team size: 2–20 employees
- Annual revenue: $150K–$2M
- Geography: US, UK, Canada, Australia

**Key Differentiators from Primary ICP:**
- Has existing accounting software but it's too expensive or complex
- Needs multi-user access (owner + bookkeeper or VA)
- Deals with recurring bills, vendor management (AP)
- Wants CRM + accounting in one place

---

## Competitive Positioning

| Competitor | Weakness | Trivio Wedge |
|------------|---------|--------------|
| Wave | Free tier restricted, 1.3/5 Trustpilot | AI extraction + proper double-entry + CRM |
| FreshBooks | Per-client caps punish growth | Full bookkeeping integrity at lower price |
| QuickBooks | Overwhelming, expensive | Simpler UI, AI-native, freemium entry |
| Xero | Complex, no freemium | Free tier + AI chat assistant |

**Trivio's Unique Position:** The only accounting tool purpose-built for the non-accountant that doesn't sacrifice bookkeeping integrity — with an AI assistant that lets you manage your entire finances conversationally.

---

## ICP Scoring Rubric

- Freelancer or 1–20 person business: +3
- Currently using spreadsheets or Wave free: +3
- Service-based business (invoices clients): +2
- English-speaking market: +2
- Expressed pain around tax/receipts/invoicing: +3
- Annual revenue $30K–$2M: +2
- Previously tried QuickBooks and churned: +2

**Score 14–18: Hot ICP. Score 8–13: Warm ICP. Below 8: Out of ICP.**
""")

reg("Trivio — LinkedIn Content Strategy", TRIVIO_P, """
## Purpose

LinkedIn content strategy for Trivio — a freemium SaaS accounting tool for freelancers and small businesses. Goal: build brand awareness, establish thought leadership, and drive sign-ups through organic LinkedIn content.

---

## Strategic Foundation

**Positioning Statement:** Trivio is the accounting software built for people who run real businesses but never studied accounting. No jargon. No overwhelm. Just clean books, fast invoices, and AI that does the heavy lifting.

**LinkedIn Objective (90-Day):**
- Build a recognisable brand voice in the freelance + small business finance space
- Grow an engaged audience of ICP followers (target: 500–1,000 net new in 90 days)
- Drive free trial sign-ups through value-first content
- Position the founder as a credible voice on "running a business without an accounting degree"

**Core Belief to Own:** Every self-employed person deserves real financial clarity — not just a spreadsheet and a prayer at tax time.

---

## The 5 Core Pain Points (by emotional intensity)

**Pain 1: The feast-or-famine trap** (broadest reach, highest emotional resonance)
- Their words: "feast or famine", "revenue roller coaster", "hustle survival mode", "heart monitor flatlining", "slow month panic"
- Trivio's answer: Smart Budget Tracking with proactive push notifications. Income trend visibility.
- Post angle: "Every other finance app shows you what happened. Trivio tells you before it does."

**Pain 2: Tax time terror** (highest urgency, strongest CTA driver)
- Their words: "tax bill shock", "once-a-year fire drill", "I owe how much?!", "scrambling before April 15"
- Trivio's answer: Automatic tax set-aside flagged after every payment.
- Post angle: "No more tax season panic."

**Pain 3: Tangled personal and business finances** (widest recognition)
- Their words: "one account for everything", "statements are a blur", "messy books", "tangled mess"
- Trivio's answer: EasyFinance (personal) + Business Finance in one unified dashboard.
- Post angle: "Personal and business, finally separated. But shown together."

**Pain 4: Lost receipts and forgotten expenses** (most product-demo friendly)
- Their words: "chasing receipts", "forgot to track that", "bookkeeping backlog", "six months of expenses in one sitting"
- Trivio's answer: AI Receipt Import. Photo it, AI reads it, categorises it, done in 5 seconds.
- Post angle: "Every forgotten receipt is a tax deduction you just gave back to the IRS."

**Pain 5: Zero visibility into actual profitability** (highest MOFU conversion)
- Their words: "busy but broke", "am I even profitable?", "flying blind", "numbers trigger anxiety"
- Trivio's answer: Real-time profit dashboard. Voice AI Chat.
- Post angle: "Stop flying blind. See your real profit, not just your balance."

---

## Trivio's 5 Competitive Edges

1. **Voice AI Chat that knows your actual data** — No competitor has this. Ask "am I profitable this month?" and get an answer grounded in your real numbers.
2. **Proactive push notifications (not passive dashboards)** — Every competitor is a rearview mirror. Trivio is a windshield.
3. **Unified personal + business finance** — No product combines both for the self-employed.
4. **AI Receipt Import as a first-class feature** — Photo it right there, AI reads it, done. Competitors do this badly.
5. **Collapses the fragmented tool stack** — Replaces QuickBooks + YNAB + spreadsheet.

---

## Content Pillars

**Pillar 1 — Education (35%):** Financial education, accounting concepts in plain English. Format: Carousel posts.

**Pillar 2 — Pain + Empathy (25%):** Speak directly to ICP frustrations using their exact language. Format: Story posts.

**Pillar 3 — Product Storytelling (25%):** Show, don't tell. Resolve a specific pain from Pillar 2 with a product demo. Format: Native video, before/after posts.

**Pillar 4 — Founder POV / Thought Leadership (15%):** Build a human brand. Format: Long-form text posts, build-in-public updates.

---

## Posting Cadence

- Monday: Education (Pillar 1) — Carousel or numbered list
- Wednesday: Pain / Empathy (Pillar 2) — Story post
- Friday: Product Storytelling (Pillar 3) — Video or demo
- Optional Sunday: Founder POV (Pillar 4) — Long-form text

**Frequency:** 3 posts/week minimum. Consistency > Volume.

---

## Master Language Rules

| Use this | Avoid this |
|----------|------------|
| "feast or famine" | "income volatility" |
| "flying blind" | "lack of financial visibility" |
| "busy but broke" | "revenue-profit discrepancy" |
| "no more tax season panic" | "tax optimization features" |
| "just ask" | "AI-powered conversational interface" |
| "personal and business, finally together" | "integrated financial management" |
| "3 apps that don't talk to each other" | "fragmented tool ecosystem" |
""")

reg("Current Tools & Gaps — Where Trivio Wins", TRIVIO_P, """
## Overview

Competitive analysis of the finance tools that freelancers, solopreneurs, and small business owners are currently using, identifying documented gaps and showing exactly where Trivio wins. Research conducted June 2026.

**Core strategic finding:** No single tool combines personal finance visibility, business finance tracking, AI voice interaction, receipt capture, and invoicing in one product built specifically for the freelancer/solopreneur.

---

## The Fragmented Tool Landscape

Freelancers typically assemble a fragmented stack across three categories:
- **Category 1: Business accounting and invoicing** — QuickBooks, FreshBooks, Wave, Bonsai, Xero
- **Category 2: Personal budgeting** — YNAB, Monarch Money, Copilot, Rocket Money
- **Category 3: Spreadsheets** — Google Sheets, Excel, manual bank statement review

The result: two or three separate apps, none of which talk to each other.

---

## Tool-by-Tool Analysis

### QuickBooks Self-Employed
**Gaps:** Still too complex for freelancers. Pricing increased significantly ($15-35/month and rising). Zero personal finance visibility. No voice or AI chat. Customer support notoriously poor ("They don't care about their customers").

**Trivio's opportunity:** Simpler onboarding. Voice AI Chat that answers questions without navigating menus. Unified personal + business view. Proactive push notifications.

### FreshBooks
**Gaps:** Pricing model punishes growth (5 clients on Lite at $21.50/month). No personal finance layer. Time tracking described as "clunky". PayPal integration removed. No AI or conversational interface.

**Trivio's opportunity:** Flat pricing without per-client caps. Voice AI Chat for instant financial Q&A. Personal finance integration.

### Wave
**Gaps:** "Free" is increasingly misleading — automatic bank imports now cost $16-19/month. Trustpilot rating: 1.3/5. Widespread reports of holding customer payments for 6-7 months. No time tracking. No AI features.

**Trivio's opportunity:** Actually free or transparent pricing. Reliability without payment-holding risk. Conversational AI that explains the numbers.

### YNAB
**Gaps:** Steep learning curve. No business finance layer — purely personal. Variable income sources require manual entry. No AI or voice chat. $109/year.

**Trivio's opportunity:** Built for variable income natively. No learning curve. Voice AI Chat asks what you want to know instead of teaching an accounting methodology.

### Monarch Money
**Gaps:** Business Mode is limited (just a filter). No invoicing, no client management. US-only. No voice or AI chat that answers questions with your actual financial data.

**Trivio's opportunity:** Includes business finance + personal finance in one product. Voice AI Chat with access to your actual data.

---

## 5 Universal Market Gaps

**Gap 1: No tool unifies personal + business finance for the self-employed.** Every tool forces a choice. No tool gives a freelancer a single dashboard showing personal spending, business income, project profitability, and tax position all in one place.

**Gap 2: No AI that actually knows your financial data and can be asked anything.** Most apps added surface-level AI in 2025. None offers a true conversational AI that holds context about your income, expenses, and profitability.

**Gap 3: No tool is proactive — they all show history, not the future.** Every current tool is reactive. None proactively alerts you when you're on track to miss a tax payment.

**Gap 4: No tool handles receipt capture as a first-class experience.** Wave's scanner produces blurry photos. QuickBooks buries it in menus. No tool makes AI-powered receipt import fast and native.

**Gap 5: All major tools have pricing or trust issues.** Wave: 1.3/5 Trustpilot. QuickBooks: poor support, rising prices. FreshBooks: per-client caps. Bonsai: 150%+ price increase over three years. YNAB: $109/year for a steep-learning-curve budgeting tool.

---

## Marketing Angles Unlocked

- **Against QuickBooks:** "QuickBooks was built for small businesses with accounting staff. Trivio was built for people who work alone and hate accounting."
- **Against Wave:** "Wave is free until it isn't. And until it holds your money for 6 months."
- **Against YNAB:** "Zero-based budgeting was not designed for feast-or-famine income. Trivio was."
- **Against the spreadsheet:** "You said you'd log that expense later. You didn't. Trivio logs it while you're still holding the receipt."
- **Against the fragmented stack:** "You're paying $40/month for 3 apps that don't talk to each other. Trivio is one product that sees the whole picture."
""")

reg("Top 5 Customer Pain Points — Freelancers & Solopreneurs", TRIVIO_P, """
## Overview

Deep research into the top 5 financial pain points of Trivio's target customers. Research June 2026.

**Key stats:** 57% of freelancers struggle to manage irregular income. 41.4% report poor financial wellbeing. These are universal, emotionally charged pain points that map directly to what Trivio solves.

---

## Pain Point 1: Irregular Income Panic & the Feast-or-Famine Trap

**Why it matters:** This is the single broadest, most emotionally resonant pain point across the entire ICP.

**Key Stats:**
- 57% of freelancers struggle to manage irregular income (Upwork, 2024)
- 41.4% of self-employed people felt their financial wellbeing was poor (Leapers, 2024)
- 51% of small employer firms list uneven cash flow as top financial challenge (Federal Reserve, 2025)

**Their exact language:** "feast or famine", "revenue roller coaster", "slow month panic", "hustle survival mode", "heart monitor flatlining", "peaks and valleys", "never know how much I'll make this month"

**Marketing angle:** Top-of-funnel hook for TikTok/Reels. POV format: "POV: you had your best month ever... then nothing."

---

## Pain Point 2: Tax Time Terror & No Withholding Safety Net

**Why it matters:** Freelancers have no employer withholding. Must calculate, set aside, and pay quarterly estimated taxes themselves. Most don't.

**Key Stats:**
- Self-employment tax is 15.3% on net earnings, on top of federal income tax
- IRS recommends setting aside 25-30% of every payment received
- Quarterly deadlines: April 15, June 16, September 15, January 15
- Most new freelancers are entirely unaware of this obligation until first tax year

**Their exact language:** "tax bill shock", "once-a-year fire drill", "I owe how much?!", "didn't save enough for taxes", "quarterly deadline panic", "no one withholds for me"

**Marketing angle:** Before/after: spreadsheet chaos vs. Trivio auto-calculating tax set-aside per invoice.

---

## Pain Point 3: Personal & Business Finances Completely Tangled

**Why it matters:** Most freelancers use a single personal bank account for both personal and business transactions. Makes it impossible to understand actual business performance.

**Key fact:** "Commingling funds" is the single most common bookkeeping mistake for small business owners. Mixed accounts cause legitimate business deductions to get lost.

**Their exact language:** "one account for everything", "statements are a blur", "can't tell what I actually made", "messy books", "tangled mess", "financial picture so murky"

**Marketing angle:** Positions EasyFinance personal module alongside business tracking as one unified dashboard.

---

## Pain Point 4: Lost Receipts & Forgotten Expenses Killing Real Profit

**Why it matters:** AI Receipt Import is a core Trivio feature. This is the direct product-market fit moment for that feature.

**Key Stats:**
- 1-2 hours per week lost to bookkeeping for average solopreneur
- New solopreneurs consistently forget 14+ expense categories
- Missing expenses directly = overpaying taxes and misreading profit margins

**Their exact language:** "chasing receipts", "forgot to track that", "subscriptions I forgot about", "doing it all retroactively", "bookkeeping backlog", "six months of expenses in one sitting"

**Marketing angle:** Direct product demo: "Watch what happens when I photograph a receipt"

---

## Pain Point 5: Zero Visibility into Actual Profitability

**Why it matters:** Most freelancers confuse revenue with profit. Numbers cause anxiety, so they avoid looking altogether.

**Their exact language:** "busy but broke", "am I even profitable?", "revenue vs. profit trap", "flying blind", "numbers trigger anxiety", "I look at my bank balance and think I'm fine"

**Marketing angle:** "You made $8,000 last month. But are you actually profitable?" Dashboard walkthrough showing net profit vs. revenue.

---

## Trivio Feature-to-Pain Point Mapping

- AI Receipt Import → Pain #4 (Lost receipts)
- Voice AI Chat → Pain #5 (Profitability blindness)
- Smart Budget Tracking + push notifications → Pain #1 (Feast-or-famine)
- Financial Dashboard → Pain #5
- EasyFinance personal module → Pain #3 (Mixed finances)
- CRM + invoicing module → Pain #1 + #2

---

## Language Rules for Trivio Marketing

| Use this | Avoid this |
|----------|------------|
| "Know exactly where your money goes" | "Financial management platform" |
| "Stop flying blind" | "Comprehensive analytics" |
| "Built for how freelancers actually earn" | "Personal finance app" |
| "No more tax season panic" | "Tax optimization features" |
| "See your real profit, not just your balance" | "P&L reporting" |
""")

reg("LinkedIn Viral Post Patterns — Learnings from The Hustle Ebook", TRIVIO_P, """
## Why This Document Exists

This layer adds format psychology on top of the existing content strategy — the structural moves that separate posts that get ignored from posts that get shared and commented on. All patterns are drawn from real posts that reached 1,000–22,000+ likes.

---

## 1. Hook Patterns That Stop the Scroll

**Surprising stat that challenges assumptions:** Lead with a number that contradicts what the reader assumed.

**Tension opener — state the limiting belief first:** Don't open with the answer. "Most freelancers think a spreadsheet is good enough. It is — until it isn't."

**Ultra-specific claim:** "Bank reconciliation used to take 2 hours. Now it takes 8 minutes." outperforms "save time on your books" every time.

**Potentially unpopular stance:** "Hiring a bookkeeper before £500K is a waste of money."

**Bait-and-switch setup:** Set up one expectation, deliver a twist. Start with the pain, pivot to the solution.

**Provocative question:** "When did you last actually look at your Profit & Loss? Not guess — actually look."

---

## 2. Structure Templates That Perform

**Mini Case Study Arc (highest engagement for product/brand content):**
Problem → Context → What changed → Specific result. Never present a product benefit without the before-state.

**Relatable Scenario Setup:** Open with a specific, cringe-inducing moment the ICP has lived. High engagement because readers feel seen before they see the solution.

**Then vs. Now Contrast:** Before-state (painful, familiar) → After-state (specific result).

**Insider Knowledge Frame:** "After talking to 50 freelancers about their accounting habits, here's what I found..."

**Warning Signs / Red Flags Format:** "5 signs you've outgrown your spreadsheet" — High emotion, widely shared.

---

## 3. Engagement Tactics

- **End with a specific question** — Not "what do you think?" but a question that invites personal experience
- **Self-identification moments** — "If you're still doing your books in a spreadsheet..." makes the right readers feel directly addressed
- **Share a real founder moment** — Authenticity beats polish
- **Insider framing** — Facts that feel like privileged information get shared

---

## 4. Visual Formats With High Share Rate

1. **Infographics** — Standalone assets that stand alone as useful get reshared
2. **Carousels / document posts** — High dwell time = algorithm boost
3. **Native video / screen recordings** — Underused in B2B SaaS, highly effective
4. **Screenshots** — Proof beats claims
5. **Before/after comparisons** — Visual delta between old workflow and new

---

## 5. The 5 Core Principles (from The Hustle)

1. Strong opinions backed by evidence spark the most discussion
2. Easy-to-grab infographics get shared massively
3. Curate and repurpose — user insights and demos can be repurposed across formats
4. Vulnerability and sharing struggles builds trust
5. Corporate humor is underused — the absurdity of tax season, receipt chaos is relatable and shareable
""")

reg("Instagram & TikTok Carousel Marketing Plan", TRIVIO_P, """
## Overview

Brand: Trivio (trivio-ai.com) by Vertex Labs
ICP: Freelancers, solopreneurs, and small business owners tired of juggling 3–5 financial apps
Goal: Drive awareness + signups via organic carousel content on Instagram and TikTok

---

## Why Carousels for Trivio

Trivio's value proposition is inherently swipe-worthy — it replaces multiple tools with one, mapping perfectly to a slide-by-slide reveal format.

- **Instagram carousels** average 1.92% engagement — 3× higher than single-image posts
- **TikTok photo carousels** generate 81% more engagement than video. Completion rate counts as a "view," triggering For You Page boost

---

## Platform Specs

### Instagram: 4:5 vertical (1080×1350px), 8–10 slides, soft CTA at slide 5–6, hard CTA on final slide
### TikTok: 9:16 vertical (1080×1920px), 5–10 slides, add trending sound
### LinkedIn: Upload as PDF, 1:1 square (1080×1080px), 5–15 slides, professional tone

---

## Content Pillars (rotate, never repeat consecutive)

1. **Pain Point Exposure** — Name exact frustration before offering solution
2. **Feature Education** — Tutorial format; drives saves
3. **Competitor Comparison** — Side-by-side breakdown; drives DM shares
4. **Social Proof / Stats** — Testimonials + metrics; builds trust
5. **Financial Education** — Pure value, no hard sell; builds authority
6. **Myth Busting** — Contrarian hook; highest viral potential

---

## Top Carousel Formats

**Instagram "Replace 5 Apps with 1":** Bold visual — 5 app icons with ✗ marks → Trivio dashboard → CTA: "Which app are you most ready to ditch?"

**Instagram "No Bank Login Required":** Privacy angle. Explain Plaid/bank-linking risks → Trivio's PDF/email import works with any bank worldwide.

**TikTok Transformation Reveal:** "My freelance finances before Trivio:" + messy spreadsheet → "After:" + clean Trivio dashboard

**TikTok Myth vs Fact:** "Accounting myths that are costing you money 🧵" — red ✗ → green ✓ reveal on each slide

---

## Proven Hook Formulas

- "You're using [X apps] to do what one app should do."
- "I used to spend 3 hours every month on bookkeeping. Now it's 15 minutes."
- "Your bank login is NOT required. Here's how."
- "The YNAB alternative nobody talks about (and it's free)."
- "Every freelancer making $3K+/month needs to see this."

---

## Cross-Platform Strategy

Same content story, different file format — not a direct repost.

1. Write the core content story (pillar + argument + hook + insights + CTA)
2. Design master at 9:16 for TikTok
3. Crop center 4:5 region for Instagram
4. Crop center 1:1 region for LinkedIn — export as PDF

---

## Key Metrics

- Instagram: Saves + DM shares (primary); Comments (secondary)
- TikTok: Completion rate — swipe-through (primary); Comments + follows (secondary)
- LinkedIn: PDF views (primary); Profile visits (secondary)
""")

# ─── CLIENT WORK PAGES ───────────────────────────────────────────────────────

reg("ICP Document — Kanwal Niazi (Project Management & Coordination Targeting Strategy 2026)", CLIENT_P, """
## What Is This Document?

This ICP document defines the exact type of employer Kanwal Niazi should be targeting on LinkedIn when seeking a project management or project coordinator role.

Kanwal's positioning anchor: Google Project Management Certificate + DPT clinical background (5 years managing complex patient caseloads) + communications and coordination work at Aurat Foundation + AI tools fluency.

---

## ICP 1 — Primary Target (Recommended)

> **BEST FIT FOR KANWAL'S CREDENTIALS AND MISSION ALIGNMENT**

**Profile:** NGO / Development Sector Organisation / Social Enterprise
- Team size: 10–30 employees
- Location: Pakistan (Islamabad, Karachi, Lahore) or international org with Pakistan office
- Focus areas: Women empowerment, health, education, community development, humanitarian

**Why this is the best fit:**
- Kanwal already has a foot in the door — Aurat Foundation is a direct, credible credential
- NGOs frequently run multi-stakeholder programmes with no dedicated PM — Google PM cert addresses an active gap
- DPT background aligns strongly with health-sector NGOs (WHO, UN Women, USAID-funded orgs)
- AI tools fluency is an emerging differentiator in development orgs

**Pain Points They're Solving:**
- Programmes run behind schedule with no visibility → needs a coordinator who builds and maintains a project tracker
- Donor reports are chaotic and last-minute → needs someone who understands timelines and documentation
- No one owns cross-team coordination → needs someone who can manage up, across, and down

**Where to Find This ICP on LinkedIn:**
- Search: "Programme Manager" / "Project Coordinator" + "NGO" + "Pakistan"
- Orgs: UN Women Pakistan, UNDP Pakistan, Aga Khan Foundation, Save the Children, Oxfam Pakistan, ActionAid
- Hashtags: #SocialImpact, #NPO, #GenderEquality, #HealthPakistan, #ProjectManagement

---

## ICP 2 — Secondary Target

**Profile:** Digital Marketing Agency / Creative Consultancy / Tech Startup
- Team size: 10–40 employees
- Location: Pakistan or remote-first
- Tech maturity: Medium to high (Asana, Monday.com, Notion, ClickUp)

**Why this works for Kanwal:**
- Agencies run fast, multi-client environments — high learning velocity for a PM generalist
- Google PM cert is directly legible to this audience
- AI tools fluency valued: agencies want coordinators who use AI to speed up status reports

---

## ICP Comparison

| Factor | ICP 1 — NGO | ICP 2 — Agency |
|--------|-------------|----------------|
| Ease of Entry | Easier (has sector credentials) | Moderate |
| Learning Speed | Medium | High |
| Portfolio Value | Moderate, niche | High, diverse |
| Mission Alignment | Very High | Low to Medium |
| Fit with Kanwal's CV | Very Strong | Strong |

---

## Messaging Framework

**For ICP 1 (NGO/Development):**
"I bring structured project management methodology from my Google PM certification, real-world programme coordination experience from Aurat Foundation, and the discipline of a healthcare professional trained to manage complexity under pressure."

**For ICP 2 (Agency/Tech Startup):**
"I bring Google PM certification, AI-assisted workflow experience, and the analytical rigour of a healthcare professional to help your team deliver client projects on time, with less chaos."
""")

reg("LinkedIn Content Strategy — Kanwal Niazi (PM Authority & Coordinator Job Search 2026)", CLIENT_P, """
## Content Strategy: Build Authority as a Project Management Professional

**Prepared for:** Kanwal Niazi
**Positioning:** Junior PM / Project Coordinator | Google PM Certificate | Healthcare-to-PM career transition | AI-assisted workflows | Aurat Foundation programme experience
**Goal:** Become recognised as a credible project management candidate by NGO programme leads, agency founders, and startup ops teams in Pakistan.

---

## 1. Strategic Positioning

**Core authority statement:** I bring structured project management methodology, healthcare-grade discipline, and AI tools fluency to organisations that need coordination done right — without constant oversight.

**What Kanwal should be known for:**
- Managing complexity systematically — not just keeping things organised, but building systems that hold
- Translating a non-traditional background (DPT + NGO comms) into real PM skills
- Using AI tools to make project coordination faster and more reliable
- Understanding mission-driven work from the inside

**Recommended niche:** Junior project management for NGOs, development organisations, and lean agency teams in Pakistan.

---

## 2. Content Pillars

**Pillar 1 — The Unconventional PM (Awareness):** Introduce Kanwal's story, make the career transition legible and compelling.
- "What physical therapy trained me to do that most PMs never learn"
- "The skills that transfer from healthcare to project management (and the ones that don't)"

**Pillar 2 — PM Insights & Lessons (Credibility):** Show that Kanwal thinks like a PM.
- "The difference between a task list and a project plan"
- "Why most projects fail in the planning phase, not the execution phase"
- "What a good status update actually contains"

**Pillar 3 — Behind the Learning (Relatability):** Honest experience of building new skills.
- "What the Google PM certificate actually teaches you (and what it leaves out)"
- "What I got wrong in my first month of studying PM seriously"

**Pillar 4 — Value for the ICP (Conversion):** Direct practical value to NGO leads and agency ops teams.
- "A simple project tracker template for NGOs with no dedicated PM budget"
- "How AI tools can cut donor report preparation time in half"

**Pillar 5 — Social Proof & Portfolio (Trust):** Evidence of real work.
- "A project I coordinated at Aurat Foundation — what the brief was, what I did, what I learned"
- "Before/after: what a disorganised workflow looked like and how I structured it"

---

## 3. Content Mix (First 90 Days)

- 30% Pillar 1 — establish the narrative
- 25% Pillar 2 — build credibility
- 20% Pillar 4 — create save-worthy content
- 15% Pillar 3 — stay relatable and honest
- 10% Pillar 5 — convert interest into trust

---

## 4. Weekly Cadence

- **Monday:** PM insight or lesson (ICP 2 — Agency/Startup vocabulary: client briefs, campaign timelines, creative handoffs, WhatsApp chaos)
- **Tuesday:** Personal story or transition reflection (ICP 1 — NGO vocabulary: programme implementation, donor reports, M&E summaries, field teams)
- **Wednesday:** Value-for-ICP practical tip (alternate ICP each week)
- **Thursday:** Behind the learning or relatable moment (ICP 1 — mission-driven context)
- **Friday:** Save-worthy resource or social proof (ICP 2 — portfolio evidence)

---

## 5. ICP-Specific Vocabulary

**ICP 1 — NGO / Development Sector:**
Use: programme implementation, donor reporting, M&E, monitoring and evaluation, stakeholder communications, field teams, logframe, project cycle, beneficiaries, capacity building.

**ICP 2 — Digital Agency / Tech Startup:**
Use: client briefs, campaign timelines, account management, creative handoffs, feedback loops, agency ops, brief-to-delivery, lean team.

---

## 6. Signature Themes to Own

1. **The Clinical-to-PM Transfer** — healthcare professionals make unusually good PMs because of how they're trained to manage uncertainty and follow structured protocols under pressure
2. **Coordination as a Discipline** — most organisations underinvest in coordination and overpay for it in missed deadlines and rework
3. **AI-Assisted PM** — AI tools don't replace PM judgment; they free up time for it

---

## 7. 90-Day Execution Roadmap

**Days 1–30:** Establish the narrative. 4–5 posts/week. Make career pivot compelling within first 10 posts.

**Days 31–60:** Build credibility through specificity. Move toward specific PM insights and tools. Create one save-worthy resource.

**Days 61–90:** Convert authority into conversations. Publish at least one mini case study. Increase personalised outreach to ICP 1 targets.
""")

print("Page definitions ready. Starting import...")

# ── Databases ─────────────────────────────────────────────────────────────────

DATABASES = [
    {
        "title": "Vertex Labs LinkedIn Optimization",
        "parent_id": None,
        "rows": [
            ("Trivio — Ideal Customer Profile (ICP)", None),
            ("Trivio — LinkedIn Content Strategy", None),
            ("LinkedIn Viral Post Patterns — Learnings from The Hustle Ebook", None),
            ("ICP Document — Kanwal Niazi (Project Management & Coordination Targeting Strategy 2026)", None),
            ("LinkedIn Content Strategy — Kanwal Niazi (PM Authority & Coordinator Job Search 2026)", None),
        ]
    },
    {
        "title": "Trivio Market Research",
        "parent_id": None,
        "rows": [
            ("Top 5 Customer Pain Points — Freelancers & Solopreneurs", None),
            ("Current Tools & Gaps — Where Trivio Wins", None),
            ("Reel Length Research — Instagram & TikTok Virality 2026", "Research into optimal reel lengths for Instagram and TikTok for Trivio's organic marketing."),
            ("Google Flow Agent System Prompt — Trivio (Talking Head Format)", "System prompt for generating Trivio talking head reel scripts using Google Flow."),
            ("Google Flow Generation Prompt — Talking Head Reels (Session Use)", "Session-use generation prompt for producing Trivio talking head reel content."),
            ("Google Flow Reel Prompts — Trivio Competitive Edge", "Reel prompts focused on Trivio's competitive advantages over QuickBooks, Wave, and FreshBooks."),
        ]
    },
    {
        "title": "Learning Roadmap — International Job Search",
        "parent_id": None,
        "rows": [
            ("LLM Evaluation", "Priority 1 | Timeline: Months 2-3 | Tools: DeepEval, RAGAS, Promptfoo | Proof: Eval suite in public repo with 30-50 golden test cases, DeepEval in CI, RAGAS scores in README"),
            ("LLM Observability & Tracing", "Priority 2 | Timeline: Months 3-4 | Tools: Langfuse, LangSmith, OpenTelemetry | Proof: Every LLM/tool/retrieval call emits a span; latency dashboard in README"),
            ("Docker & Kubernetes", "Priority 3 | Timeline: Months 5-6 | Tools: Docker, Kubernetes (minikube/k3s), GitHub Actions, Helm basics | Proof: Service running on K8s with CI/CD eval gate"),
            ("Cost Optimization & Model Routing", "Priority 4 | Timeline: Months 6-7 | Tools: Prompt caching (Bedrock/Anthropic), LangGraph router node, Langfuse cost tracking | Proof: Before/after cost-per-conversation chart"),
            ("Guardrails & LLM Security", "Priority 5 | Timeline: Month 8 | Tools: OWASP LLM Top 10, Promptfoo red-teaming, NeMo Guardrails | Proof: SECURITY.md mapping OWASP risks to mitigations + red-team results"),
            ("MCP & Agent Orchestration Depth", "Priority 6 | Timeline: Months 8-9 | Tools: MCP Python SDK, LangGraph advanced (subgraphs, interrupts, durable state) | Proof: Published MCP server exposing Text-to-SQL tools"),
            ("ML System Design", "Priority 7 | Timeline: Month 4 onward (2 hrs/wk), intensify Months 9-10 | Tools: requirements → data → design → serving → evals → monitoring → cost | Proof: 2-3 design docs in repo /docs folder"),
            ("Airflow Gap-Fill", "Priority 9 | Timeline: Month 7 (~15 hours) | Tools: Apache Airflow (Astronomer), Spark literacy via Databricks CE | Proof: Airflow DAG in repo orchestrating the retraining/eval pipeline"),
            ("DSA Maintenance Dose", "Priority 8 | Timeline: Months 9-10 | Tools: NeetCode 150 | Proof: 100-150 pattern problems solved, narrating out loud"),
            ("AWS ML Specialty Certification (Optional)", "Priority 10 | Timeline: Only if ahead of schedule | Tools: AWS Skill Builder, Stephane Maarek & Frank Kane Udemy course | Proof: Certification badge (only after Priorities 1-6 are done)"),
        ]
    },
    {
        "title": "Trivio — Marketing",
        "parent_id": None,
        "rows": [
            ("Instagram & TikTok Carousel Marketing Plan", None),
            ("Instagram Carousel — Competitor Comparison — 2026-06-30", "Instagram carousel post: Trivio vs competitors (Jun 30 2026)."),
            ("Instagram Carousel — Competitor Comparison — 2026-06-26", "Instagram carousel post: Trivio vs competitors (Jun 26 2026)."),
            ("Instagram Carousel — Competitor Comparison — 2026-06-24", "Instagram carousel post: Trivio vs competitors (Jun 24 2026)."),
            ("Instagram Carousel — Myth Busting — 2026-06-25", "Instagram carousel post: myth busting about freelancer finance (Jun 25 2026)."),
            ("Instagram Carousel — Myth Busting — 2026-06-23", "Instagram carousel post: myth busting about freelancer finance (Jun 23 2026)."),
            ("TikTok Carousel — 5 Things Education — 2026-06-30", "TikTok carousel: 5 things every freelancer should track (Jun 30 2026)."),
            ("TikTok Carousel — 5 Things Education — 2026-06-27", "TikTok carousel: 5 things education format (Jun 27 2026)."),
            ("TikTok Carousel — 5 Things Education — 2026-06-25", "TikTok carousel: 5 things education format (Jun 25 2026)."),
            ("TikTok Carousel — Myth vs Fact — 2026-06-28", "TikTok carousel: accounting myth vs fact (Jun 28 2026)."),
            ("TikTok Carousel — Myth vs Fact — 2026-06-26", "TikTok carousel: accounting myth vs fact (Jun 26 2026)."),
            ("TikTok Carousel — Myth vs Fact — 2026-06-23", "TikTok carousel: accounting myth vs fact (Jun 23 2026)."),
        ]
    },
    {
        "title": "Trivio Reddit Backlink Posts",
        "parent_id": None,
        "rows": [
            ("QuickBooks Desktop Discontinued — What to Do Next",
             "r/smallbusiness | Status: Ready to Post\n\nIntuit ended new subscriptions for QuickBooks Desktop. Clear breakdown of what happened, what your existing subscription means, and your options for 2026. Covers: what 'discontinued' actually means for current users, comparison of alternatives (QuickBooks Online, Xero, Wave, Trivio), and what to consider when switching.\n\nBlog URL: https://trivio-ai.com/blog/quickbooks-desktop-discontinued"),
            ("Freelancer Taxes: What You Actually Owe (And When to Pay It)",
             "r/personalfinance | Status: Ready to Post\n\nSelf-employment tax, quarterly estimated payments, what counts as taxable income — a clear breakdown for freelancers. Covers: how self-employment tax works, when and how to make quarterly payments, what income you have to report, and common mistakes to avoid.\n\nBlog URL: https://trivio-ai.com/blog/freelancer-taxes-guide-what-you-actually-owe"),
            ("How to Send an Invoice as a Freelancer (And Actually Get Paid)",
             "r/freelance | Status: Ready to Post\n\nWhat to include on an invoice, when to send it, and how to chase overdue payments without it feeling awkward. Includes: what every invoice needs, payment terms that work, how to write a firm but professional chaser, and what to do when a client goes quiet.\n\nBlog URL: https://trivio-ai.com/blog/how-to-send-an-invoice-as-a-freelancer-and-actually-get-paid"),
            ("What Can Freelancers Write Off on Taxes? The Full Deductions List",
             "r/tax | Status: Ready to Post\n\nEvery legitimate business deduction available to freelancers: home office, equipment and hardware, software subscriptions, professional development, health insurance premiums, retirement contributions, vehicle use, and more.\n\nBlog URL: https://trivio-ai.com/blog/what-can-freelancers-write-off-on-taxes"),
            ("How to Track Income and Expenses as a Freelancer Without Losing Your Mind",
             "r/freelance | Status: Ready to Post\n\nBrutally honest guide to knowing where your money actually goes. Covers: what to actually track (and what to skip), simple systems that take under 10 minutes a week, when to move beyond spreadsheets, and how to catch tax deductions you'd otherwise miss.\n\nBlog URL: https://trivio-ai.com/blog/how-to-track-income-expenses-freelancer-without-losing-your-mind"),
            ("What is Double-Entry Accounting? Plain English Explanation",
             "r/Accounting | Status: Ready to Post\n\nEvery transaction touches two accounts. Debits equal credits. Your books stay balanced. A plain-English explanation of how double-entry bookkeeping actually works and why understanding it matters — even if you're just a freelancer.\n\nBlog URL: https://trivio-ai.com/blog/what-is-double-entry-accounting"),
            ("How to Budget When Your Income is Irregular (The Freelancer's Guide)",
             "r/personalfinance | Status: Ready to Post\n\nThe unpredictability is real. Variable income makes standard budgeting advice almost useless. Practical system for building a budget that works when you don't know what next month will bring. Covers: baseline budgeting, building a buffer, prioritising fixed vs variable expenses, and what to do in a slow month.\n\nBlog URL: https://trivio-ai.com/blog/how-to-budget-on-irregular-income-freelancer"),
            ("The Complete Bookkeeping Guide for Freelancers (2026)",
             "r/freelance | Status: Ready to Post\n\nBeen freelancing for a while and bookkeeping was always the part I dreaded. After figuring it all out the hard way, wrote this up for anyone who's confused about where to start. Covers: cash vs accrual accounting, what records you actually need to keep, how to categorise expenses, and what you need at tax time.\n\nBlog URL: https://trivio-ai.com/blog/freelancer-bookkeeping-guide"),
        ]
    }
]

# ── Run the import ─────────────────────────────────────────────────────────────

def main():
    # 1. Clear any existing blocks for pages we're about to create
    #    (safe — we only delete blocks for pages WE create now)

    # 2. Create all section parents and standalone pages
    print(f"\nCreating {len(PAGES)} pages...")
    for title, (pid, parent_id, content_md) in PAGES.items():
        insert_page(pid, parent_id, title)
        blocks = md_to_blocks(content_md)
        # Delete any existing blocks first
        run_sql(f"DELETE FROM blocks WHERE page_id = '{pid}';")
        insert_blocks(pid, blocks)
        print(f"  ✓ {title[:60]} ({len(blocks)} blocks)")

    # 3. Create databases and their rows
    print(f"\nCreating {len(DATABASES)} databases...")
    created_pages = {title: pid for title, (pid, _, _) in PAGES.items()}

    for db in DATABASES:
        db_page_id = new_id()
        db_id = new_id()
        insert_page(db_page_id, db.get("parent_id"), db["title"])
        insert_database(db_page_id, db_id)
        print(f"  DB: {db['title']}")

        for row_info in db["rows"]:
            row_title = row_info[0]
            row_content = row_info[1] if len(row_info) > 1 else None

            # If this page title matches one we already created, reuse it
            if row_title in created_pages:
                row_page_id = created_pages[row_title]
            else:
                row_page_id = new_id()
                insert_page(row_page_id, db_page_id, row_title)
                if row_content:
                    blocks = md_to_blocks(row_content)
                    run_sql(f"DELETE FROM blocks WHERE page_id = '{row_page_id}';")
                    insert_blocks(row_page_id, blocks)

            insert_db_row(db_id, row_page_id)
            print(f"    → {row_title[:55]}")

    print("\nAll done.")

    # Verify
    data = run_sql(f"SELECT COUNT(*) as n FROM pages WHERE workspace_id = '{WS_ID}';")
    pages_count = data.get("rows", [{}])[0].get("n", "?")
    data2 = run_sql(f"SELECT COUNT(*) as n FROM databases WHERE page_id IN (SELECT id FROM pages WHERE workspace_id = '{WS_ID}');")
    db_count = data2.get("rows", [{}])[0].get("n", "?")
    data3 = run_sql(f"SELECT COUNT(*) as n FROM blocks WHERE page_id IN (SELECT id FROM pages WHERE workspace_id = '{WS_ID}');")
    block_count = data3.get("rows", [{}])[0].get("n", "?")
    print(f"\n── Final counts ──")
    print(f"  Pages:     {pages_count}")
    print(f"  Databases: {db_count}")
    print(f"  Blocks:    {block_count}")

if __name__ == "__main__":
    main()
