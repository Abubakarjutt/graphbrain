#!/usr/bin/env python3
"""Convert Notion Enhanced Markdown pages to TipTap blocks and seed Supabase."""

import json
import re
import subprocess
import sys

# Page IDs from the seeded graphbrain database
PAGE_IDS = {
    "linkedin_growth": "77660934-3390-41f9-839b-29d1dafb6b5a",
    "content_calendar": "e0f62101-75d2-4959-a0d6-c282899779c3",
    "voice_guide": "9cab040e-56f0-4112-a520-94e7a440176a",
    "daily_posts": "6005d752-e757-4209-b3b3-0f66ecfa50e3",
    "linkedin_profile": "580bd77a-89af-4315-9031-19810c54745a",
}

# ── TipTap helpers ──────────────────────────────────────────────────────────

def text_node(text, marks=None):
    n = {"type": "text", "text": text}
    if marks:
        n["marks"] = marks
    return n

def parse_inline(text):
    """Parse inline markdown (bold, italic, code) into TipTap text nodes."""
    nodes = []
    # Pattern: **bold**, *italic*, `code`, or plain
    pattern = r'(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)'
    last = 0
    for m in re.finditer(pattern, text):
        start, end = m.start(), m.end()
        if start > last:
            nodes.append(text_node(text[last:start]))
        if m.group(2):  # bold
            nodes.append(text_node(m.group(2), [{"type": "bold"}]))
        elif m.group(3):  # italic
            nodes.append(text_node(m.group(3), [{"type": "italic"}]))
        elif m.group(4):  # code
            nodes.append(text_node(m.group(4), [{"type": "code"}]))
        last = end
    if last < len(text):
        nodes.append(text_node(text[last:]))
    return nodes or [text_node(text)]

def para(text):
    return {"type": "paragraph", "content": parse_inline(text)}

def empty_para():
    return {"type": "paragraph"}

def heading(level, text):
    # Strip markdown link syntax [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    return {"type": "heading", "attrs": {"level": level}, "content": parse_inline(text)}

def bullet_list(items):
    return {
        "type": "bulletList",
        "content": [
            {"type": "listItem", "content": [para(i)]}
            for i in items
        ]
    }

def ordered_list(items):
    return {
        "type": "orderedList",
        "content": [
            {"type": "listItem", "content": [para(i)]}
            for i in items
        ]
    }

def blockquote(text):
    return {"type": "blockquote", "content": [para(text)]}

def hr():
    return {"type": "horizontalRule"}

def code_block(code):
    return {"type": "codeBlock", "content": [{"type": "text", "text": code}]}

# ── Markdown → TipTap parser ────────────────────────────────────────────────

def parse_markdown(md):
    """Parse simple markdown into TipTap nodes."""
    blocks = []
    lines = md.split('\n')
    i = 0
    bullet_buf = []
    ordered_buf = []

    def flush_bullets():
        nonlocal bullet_buf
        if bullet_buf:
            blocks.append(bullet_list(bullet_buf))
            bullet_buf = []

    def flush_ordered():
        nonlocal ordered_buf
        if ordered_buf:
            blocks.append(ordered_list(ordered_buf))
            ordered_buf = []

    while i < len(lines):
        line = lines[i]

        # Skip HTML table lines
        if line.strip().startswith('<table') or line.strip().startswith('<tr') or \
           line.strip().startswith('<td') or line.strip().startswith('</'):
            i += 1
            continue

        # Code block
        if line.startswith('```'):
            flush_bullets(); flush_ordered()
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code_lines.append(lines[i])
                i += 1
            blocks.append(code_block('\n'.join(code_lines)))
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^-{3,}$', line.strip()) or re.match(r'^_{3,}$', line.strip()):
            flush_bullets(); flush_ordered()
            blocks.append(hr())
            i += 1
            continue

        # Headings
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            flush_bullets(); flush_ordered()
            level = min(len(m.group(1)), 3)
            blocks.append(heading(level, m.group(2).strip()))
            i += 1
            continue

        # Blockquote
        if line.startswith('> ') or line == '>':
            flush_bullets(); flush_ordered()
            text = line[2:] if line.startswith('> ') else ''
            # Collect continuation lines
            bq_lines = [text]
            while i + 1 < len(lines) and (lines[i+1].startswith('> ') or lines[i+1] == '>'):
                i += 1
                bq_lines.append(lines[i][2:] if lines[i].startswith('> ') else '')
            combined = ' '.join(l for l in bq_lines if l)
            if combined:
                blocks.append(blockquote(combined))
            i += 1
            continue

        # Task list item (- [ ] or - [x])
        m = re.match(r'^(\s*)-\s+\[[ x]\]\s+(.*)', line)
        if m:
            flush_ordered()
            bullet_buf.append(re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', m.group(2).strip()))
            i += 1
            continue

        # Bullet list
        m = re.match(r'^(\s*)-\s+(.*)', line)
        if m:
            flush_ordered()
            text = m.group(2).strip()
            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
            bullet_buf.append(text)
            i += 1
            continue

        # Numbered list
        m = re.match(r'^(\s*)\d+\.\s+(.*)', line)
        if m:
            flush_bullets()
            text = m.group(2).strip()
            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
            ordered_buf.append(text)
            i += 1
            continue

        # Empty line
        if line.strip() == '':
            flush_bullets(); flush_ordered()
            i += 1
            continue

        # Paragraph
        flush_bullets(); flush_ordered()
        # Clean up markdown links
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', line.strip())
        if text:
            blocks.append(para(text))
        i += 1

    flush_bullets()
    flush_ordered()
    return blocks


# ── Page content ─────────────────────────────────────────────────────────────

LINKEDIN_GROWTH = """
## 0. The core diagnosis: the authority paradox

There are three positions on LinkedIn:

- **Subject matter expert** — deepest knowledge in the room, almost nobody knows they exist.
- **Creator** — knows how to get attention, substance is often an inch deep.
- **Thought leader** — an expert who learned distribution. Depth of #1, reach of #2.

**Abubakar is squarely #1.** 6+ years, a 3,000-employee deployment, 89% fewer HR queries, 68% fewer BI queries. The trap is assuming that because the expertise is real, people will care. They don't — not yet.

> Expertise and attention are two different currencies. You can be rich in one and broke in the other.

Posting valuable things ≠ getting attention. The rest of this doc is how to convert one currency into the other.

---

## 1. First touchpoint — comments, not posts

When your own posts reach nobody, you are talking to an empty room. Other people's comment sections are **already full of your ICP**. A comment puts you in that room today, for free.

This is not engagement farming — it runs on reciprocity. A genuinely useful comment gets noticed, replied to, and the author's audience clicks through.

**The system:**

- Build a list of **20–30 creators** whose audience matches the ICP (founders, COOs, Heads of Ops/Data/CX at 50–5,000-person B2B companies).
- Build a second list of **20–30 real ICPs** you see active in those comment sections.
- Spend **30 minutes a day commenting — before writing your own post.**

A good comment does one of three things: adds value, respectfully challenges, or tells a story.

**What it never does:** restate the post back. "So true, consistency really is key" adds nothing.

---

## 2. The profile is the landing page

Your content is the ad. Your profile is the landing page. A stranger who clicks your name runs one 10-second gut check: *do I understand what this person does, and is it for me?*

Reported effect of fixing only the headline and About section: **+226% reach, +327% engagement.** Same ads, new landing page.

**Element by element:**

- **Photo** — zoomed into the face, approachable. Brand-colour background.
- **Headline** — the problem you solve and who you solve it for, in the buyer's own words. Current best option: *GenAI Engineer | I build custom AI agents, internal chatbots & Text-to-SQL systems that reduce manual work and decision bottlenecks.*
- **About** — structure as **problem → solution → proof → CTA.** Treat the first two lines as a hook.
- **Featured + custom button** — send people to a world you own: booking link, lead magnet, newsletter. **LinkedIn owns your followers, you don't.**

Fix the profile before posting anything. Every post published against a broken profile is an ad pointing at a dead page.

---

## 3. What changed in the 2026 algorithm

LinkedIn went public on **March 12, 2026** about a feed rebuild. Several separate ranking systems were replaced with **one unified LLM-powered model** that routes content to people who'd want it — including people who don't follow you.

Three consequences:

1. **Percentiles, not raw engagement.** Engagement quality moves you up a percentile. Pods do not.
2. **It structurally favours smaller accounts.** "I'll take LinkedIn seriously once I'm bigger" is no longer a coherent plan.
3. **The first ~50 words are an audition.** Spend them on slow setup and you fail before a human ever votes.

---

## 4. Total addressable content — the five formats

1. **Brandjacking** — use a credible brand's move as the frame for your insight.
2. **Newsjacking** — be the first credible voice explaining what industry news actually means for your reader.
3. **Memejacking** — reference a person your audience already follows and add something real.
4. **Hot takes** — a genuinely held belief that challenges what the industry accepts, stated plainly enough that people must pick a side.
5. **Trend riding** — when a post structure starts spreading, pour your expertise into that shape while it's still climbing.

---

## 5. Write the hook last

Stop writing the hook first. That's cutting the trailer before shooting the film.

Write the whole post — story, numbers, framework — then read it back and find the sharpest line already doing the heavy lifting. **Drag that line to the top.**

> If you read it back and nothing is worth pulling to the top, the problem was never the hook. It was the post. Write a better post.

---

## 6. The content funnel — four buckets

- **Growth (40%)** — Reach new people who've never heard of you
- **Authority (30%)** — Frameworks, client results — prove you actually know this
- **Conversion (20%)** — Show them the door when they're ready to walk through it
- **Personal (10%)** — Be remembered as a human, not a pitch

Both failure modes are real: experts post ~100% authority to an audience that doesn't know them yet → handing out business cards in an empty room.

### Gap analysis — posts 032–061

Reviewing the last 30 posts: they are **almost entirely authority + newsjacking**, nearly all opening on a research statistic. The craft is strong — but the mix is close to **100% authority**, which is precisely the SME failure mode.

**What's missing:** growth content, any real conversion post, personal content, and plainly-stated hot takes.

---

## 7. The thread through everything: point of view

**Abubakar's POV:**

- AI companies are selling a superintelligence narrative because they need to raise funds — and companies are laying people off against a promise that turns out to be false. **AI is supplementary, not a replacement.**
- Most enterprise AI adoption is signalling for board decks and investor reports, not problem-solving.
- Benchmark and research claims deserve deep skepticism — learned the hard way when a published baseline turned out to be irreproducible.
- Enterprise problems are genuinely complicated and need genuinely complicated solutions — not clever prompts.

These are strong, real, and currently underused. **They should be stated plainly and often.**

---

## 8. The DM, and what precedes it

Eventually a stranger sends "been following your stuff for a while, want to chat?" It came from a comment, a profile click, a saved post, and weeks of each bucket doing its job.

- **Reply the same day, ideally within hours.**
- **Don't only wait for the DM.** People leave signals: the same names commenting weekly, saves, profile views from your exact ICP.
- A message as plain as *"I keep seeing you in the comments — what are you working on?"* outperforms any written sequence.

---

## 9. Operating checklist

- [ ] Fix headline + About (problem → solution → proof → CTA) before anything else
- [ ] Point Featured + custom button at an owned destination
- [ ] Build the 20–30 creator list and the 20–30 ICP list
- [ ] 30 min of commenting daily, before posting
- [ ] Rebalance to 40 growth / 30 authority / 20 conversion / 10 personal
- [ ] Front-load the first 50 words; write the hook last
- [ ] State the POV plainly — especially the anti-hype position
- [ ] Reply to DMs same-day; nudge repeat commenters warmly
"""

CONTENT_CALENDAR = """
**LinkedIn: 12 posts (3/week) · YouTube: 1 long-form video + 2 Shorts**

Mapped to Roadmap Phase 1 (starting the flagship repo + eval work). Week 1 posts are drafted in full. Weeks 2–4 are briefs with hooks, since their specifics depend on what actually happens as you build.

**Pillar mix this month:** 6 build-in-public, 4 production lessons, 2 business translation.

**Formatting rules for every post:** 1,300+ characters, one real visual, 3–5 niche tags max, first line must work as a hook.

---

## Week 1

### Post 1 (Mon) — Pillar 2: Production lesson — FULL DRAFT

> The hardest part of putting a chatbot in front of 3,000 employees wasn't the LLM. It was the SQL.

When we built a text-to-SQL system for a large enterprise, the model could write beautiful queries. The problem was that beautiful and correct are different things. A query can run without errors, return a plausible-looking table, and still be wrong: wrong join, wrong filter, wrong fiscal year convention that only someone in finance would catch.

A wrong answer that looks right is worse than an error message. Errors get reported. Confident wrong answers get pasted into board decks.

What actually fixed it, in rough order of impact:

1. Schema descriptions written by the people who own the tables, not autogenerated ones
2. A hard rule that ambiguous questions get a clarifying question back, not a best guess
3. Showing the generated SQL next to the answer so analysts could audit it
4. A feedback button that routed bad answers straight to us with the full trace

Result over time: BI teams saw a 68% drop in routine query requests.

**Tags:** #MachineLearning #LLM #TextToSQL #GenAI

---

### Post 2 (Wed) — Pillar 1: Build in public — FULL DRAFT

> I'm building my next production-grade agent in public. Here's the plan and the first commit.

The project: an agentic text-to-SQL assistant (LangGraph + FastAPI) on a public dataset, built the way I'd build it for a client.

Most agent demos skip straight to the happy path. I've maintained these systems long enough to know the demo is maybe 20% of the work. The other 80% is knowing when it's wrong, how much it costs, and what happens when someone asks it something weird.

So the build order is deliberately backwards compared to most tutorials:

- Week 1–4: evaluation harness before features. 40 golden test cases, automated scoring on every change, RAGAS metrics for retrieval.
- Week 5–8: full tracing with Langfuse. Every LLM call, tool call, and retrieval as a span.
- After that: Kubernetes deployment with the eval suite as a CI gate, cost dashboard, guardrails.

**Tags:** #BuildInPublic #LangGraph #AIEngineering #LLMOps

---

### Post 3 (Fri) — Pillar 3: Business translation — FULL DRAFT

> A question I wish more companies asked before paying anyone to build them a chatbot: "How will we know when it's wrong?"

Not "what model does it use." Those matter, but every vendor has a good answer ready for them.

In my experience shipping conversational AI inside large organizations, the systems that survive past the pilot phase all have the same unglamorous thing in common: somebody defined what a correct answer looks like, wrote down 30–50 real examples, and tests every change against them.

Three questions that separate real production systems from demos:

1. Show me your test set. If there isn't one, the system has never been measured.
2. What does it do with a question it can't answer? "It always answers" is the wrong answer.
3. Can a non-technical reviewer see why it said what it said?

**Tags:** #AIStrategy #EnterpriseAI #DigitalTransformation

---

## Week 2 — theme: golden datasets

- [ ] **Post 4 (Mon)** "I wrote my first 20 golden test cases this week. Writing them taught me more about my own system than building it did." Show 3 real test cases including one that surprised you.
- [ ] **Post 5 (Wed)** Production lesson: how user questions in the Engro system differed from what we expected pre-launch. Vague phrasing, typos, mixed Urdu/English, questions about data that didn't exist.
- [ ] **Post 6 (Fri)** First DeepEval run screenshot: X of 20 tests passing. Walk through one failure honestly. Hook: "My agent failed 6 of its first 20 tests. Good."

---

## Week 3 — theme: LLM-as-judge and metrics

- [ ] **Post 7 (Mon)** Explaining G-Eval / LLM-as-judge in plain terms with your actual judge prompt as the visual. Include the calibration problem.
- [ ] **Post 8 (Wed)** Business translation: "Your AI vendor says the chatbot is 95% accurate. Accurate at what, measured how, on whose questions?"
- [ ] **Post 9 (Fri)** RAGAS results on the retrieval side. Faithfulness vs answer relevancy scores, and one concrete retrieval fix the metrics pointed you to.

---

## Week 4 — theme: shipping the eval suite + first video

- [ ] **Post 10 (Mon)** Production lesson: the RAKEZ drift-detection angle. "Models don't fail loudly in production. They fade."
- [ ] **Post 11 (Wed)** The eval suite is now a CI gate: screenshot of a blocked merge. Hook: "My repo now refuses my own bad code."
- [ ] **Post 12 (Fri)** Announce the first YouTube video, embed the vertical cut natively on LinkedIn, and summarize the top 3 lessons from month one.

---

## YouTube Video 1 (record in Week 4)

**Title options:**

1. "Building an Eval Suite for a LangGraph Agent with DeepEval (Full Walkthrough)"
2. "Your LLM Agent Needs Tests. Here's How I Built Mine (DeepEval + RAGAS)"
3. "How I Test My Text-to-SQL Agent Before Every Deploy"

**Length:** 10–14 minutes, screen share + voice, small corner face cam.

**Structure:**

- 0:00–0:40 Hook: show a confidently wrong SQL answer from your own agent.
- 0:40–2:00 The problem: why "looks right" isn't a metric.
- 2:00–5:00 Golden dataset: the actual 40 test cases, how they were written.
- 5:00–9:00 Live walkthrough: DeepEval running, one failing test, fixing the agent, re-running.
- 9:00–11:30 RAGAS on the retrieval layer plus the CI gate demo.
- 11:30–12:30 What this would have caught in production systems I've shipped.

---

## Weekly engagement routine (~1.5 hrs/week)

- Before each post: 10 minutes commenting substantively on posts by ML engineers, AI leads, and hiring managers at target-list companies.
- After each post: reply to every comment within a few hours.
- Weekly: 5 thoughtful comments on posts by people at bucket-A/B/C companies specifically.

---

## Measurement (check monthly)

- **Leading:** profile views, search appearances, connection requests from target-company employees
- **Real:** recruiter InMails, DMs referencing a post, repo stars and traffic from LinkedIn
- **Ignore:** likes from outside the niche, follower count for its own sake
"""

VOICE_GUIDE = """
This document is used by the daily LinkedIn post AI to write posts that actually sound like you — not a generic AI consultant. The AI reads this before writing every post.

---

## 1. Origin Story

I was never good in school, but I was always drawn to computers — playing games, trying different software, amazed by how much a computer could help you accomplish. I was into science, technology, documentaries. Because my grades weren't good, my dad (a professor of accounting and finance) pushed me toward that field, thinking it would at least get me a job. So I studied it, took it seriously once I realized I needed to build a career.

After graduating I tried different jobs and found them all boring — repetitive, mechanical, not impactful. I was just a small cog in a machine. I moved to banking thinking it would be more complex, more mentally stimulating. It wasn't. Same procedures, same repetitive work for customers.

So I started exploring. I took some digital marketing courses, and somewhere along the way I stumbled onto videos about AI and data science. It fascinated me — the idea that computers could do this much. I found a university that admitted me to a master's in data science, and I fell in love with AI and machine learning.

By the time I graduated, the transformer architecture was taking off, and what it could do was even more mind-blowing than everything that came before. I started as a research associate in a lab, then moved into industry. The area I'm most drawn to, and where I believe AI will be most impactful, is healthcare.

---

## 2. The Work That Changed How You Think

The 3,000-employee project was an internal chatbot for a conglomerate — a holding company with nine subsidiaries. The system needed to connect to their databases, documents, and leave management system through a single chat interface.

Going in, we thought it would be straightforward: connect some APIs with Python functions and the chatbot would work. We were completely wrong. The initial version was dumb — it couldn't handle the complexity of what the business actually needed.

We had to tear it down and re-engineer everything. Every component had to be meticulously designed so the system worked as a whole. We added guardrails, built out nodes to handle edge cases we assumed the LLM would manage on its own, and built an entire orchestration layer from scratch.

Before that project, my mental model was simple: connect a model to a dataset, get outputs, use them. This system rewired how I think. It taught me that enterprise problems are genuinely complicated, and they require genuinely complicated solutions — not just clever prompts or quick integrations.

---

## 3. Failures and Wrong Turns

When I was working as a research associate, my task was to mitigate identity bias in text classification models. I tried everything: n-gram tokenization, different architectures, various techniques. The bias kept persisting.

Then came the comparison phase. There was a prior paper solving the same problem with published results, and I needed to benchmark against it. That's when things fell apart: the results in that paper were not reproducible. We couldn't replicate their numbers with their own dataset and their own model. The baseline we were supposed to beat didn't actually exist.

That experience made me deeply skeptical of benchmark claims in AI research. Around that time I watched a Veritasium video where the host explained that roughly 80% of published research is not reproducible. A lot of research is published just to publish.

---

## 4. Strong Opinions

I think AI companies are lying to us. They're selling the narrative of superintelligence that will replace everything humans do, and they're doing it because they need to raise funds. That story is creating real damage: companies are laying off employees on the promise that AI will do all the work, only to eventually find out that promise was false.

AI is a supplementary technology. It helps humans do more, faster. It is not a replacement for human intelligence, and the two are fundamentally different types of intelligence. Humans have emotions, gut feelings, the ability to read a room, to sense trends, to understand other humans in ways AI simply cannot.

In the future, AI will be a copilot. A powerful one that significantly increases productivity. But the companies building the narrative that AI replaces jobs are the problem, not the technology itself.

---

## 5. What Actually Drives You

It's the sense of fulfillment that comes from solving something complex. When I'm working on AI, building a solution, wrestling with a hard problem, I feel like I'm achieving my potential. Like I'm actually creating something that didn't exist before.

Mundane work doesn't do that for me. But when I'm deep in an AI problem and I can see the solution taking shape, there's a satisfaction there that's hard to describe.

I think this is actually an innate human need: the desire to create. For me, that feeling comes from building AI solutions that change how businesses operate. Something that didn't exist, and now it does, and it matters.

---

## 6. Background That Shapes Your Perspective

My accounting and finance degree wasn't just accounting and finance. I studied human resources, organizational behavior, international business. All of that gave me a lens for how businesses actually work — how problems inside organizations need solutions that deliver business outcomes, not just technical outputs.

That perspective is something a lot of ML engineers don't have. They can build the model but struggle to connect it to a business result. I think about both simultaneously.

Growing up in Pakistan taught me to be resourceful in a constrained environment. The internet was slow, resources were limited, there were no Ivy League universities nearby. But the internet changed everything for me — Stanford and Harvard lectures on YouTube, documentation, forums, tutorials.

---

## 7. Your Working Style

I like to think through a solution first, but I validate ideas quickly. Once I have a hypothesis, I want to implement it and test it. If it doesn't work, that's still progress: I now know that approach doesn't work, and I understand why. That informs the next idea.

Then I iterate again. And again. Experimentation and iteration is the process that consistently produces the best results for me.

---

## 8. Things You've Noticed That Others Miss

A lot of companies adopt AI just so they can say they're adopting AI. It goes into board meeting presentations, investor reports, customer communications. Those implementations deliver very little real value.

The implementations that actually matter are the ones where a company has a genuine problem that AI can solve, and they pursue it because of that problem, not because of how it looks.

What AI is genuinely good at is removing inefficiencies in business operations: repetitive processes, information retrieval, decision support at scale.

---

## 9. Personal Context

Right now I'm juggling a lot: trying to improve my health and fitness, constantly learning to stay valuable for clients and employers, and navigating a world that feels increasingly heavy with inflation and global conflict.

Outside of work, my biggest interest is knowledge itself. I have a deep craving to learn new things, especially in science and technology. Astrophysics and medicine are two areas I follow closely. I'm also a big fan of music.

---

## 10. What You Don't Want in Posts

No false claims. Nothing exaggerated or made up to sound impressive.

Most importantly: posts should not sound robotic or AI-written. They need to sound like me. If it doesn't sound like something I would actually say, it's wrong.
"""

LINKEDIN_PROFILE = """
# Muhammad Abubakar

> I build AI agents that let SMBs query their data in plain English, with access controls built in | First ROI in 90 days

Islāmābād, Pakistan

---

## Profile Summary

Most SMBs are drowning in repetitive work. Support tickets are piling up. Hiring cycles that take weeks. Customer queries answered too late. Good candidates lost to slow follow-ups. And at the center of it all, a team spending 80% of their time on tasks that should never reach a human in the first place.

That's the problem I solve.

I build AI automation systems that eliminate the operational overhead killing your margins, specifically in three areas:

- **Customer Support:** AI agents that handle 70–80% of tickets instantly, 24/7, without hiring more staff
- **Lead Follow-Up:** Automated pipelines that respond, qualify, and nurture leads the moment they come in
- **Hiring Workflows:** AI-assisted systems that screen, shortlist, and schedule candidates, cutting hiring time by half

My guarantee: measurable ROI within 90 days, or we keep working until you see it.

---

## Top Skills

- Cloud Computing
- Solution Architecture
- AI Agents

---

## Experience

### Forward Deployed Engineer (AI) — Ras Al Khaimah Economic Zone (RAKEZ)

October 2025 – Present · Islāmābād, Pakistan

Built predictive models for customer segmentation, churn/renewal prediction, and lead prioritization. Implemented automated drift detection and retraining pipelines to keep models accurate in production. Delivered decision frameworks that measurably improved operational efficiency.

### Forward Deployed Engineer (AI) — Addo AI

July 2024 – Present · San Francisco, CA

Engro Holdings' 3,000+ employees had to route database questions through BI analysts and HR queries through the HR department, creating backlogs and slowing decisions.

Built a Text2SQL2Text and HR chatbot from scratch using LangGraph, AWS Bedrock, and FastAPI with streaming response support. Also developed a video anomaly detection system using OpenCV, TensorFlow, and TensorRT.

**Impact:** 68% reduction in BI staff queries, 89% reduction in HR department queries. Video system reduced annotation time by 35% and improved annotator throughput by 42%.

### Associate AI Consultant — Addo AI

March 2022 – June 2024 · San Francisco, CA

Designed and built an AI-assisted annotation tool integrating Google T5, Meta Detectron2, SpaCy NER, and POS taggers with an active learning loop. Mentored three junior data scientists.

**Impact:** Reduced annotation time by 82–96% across different use cases.

### Forward Deployed Engineer (AI) — Engro Group

August 2024 – September 2025

Led implementation of the LangGraph + AWS Bedrock chatbot internally. Trained two junior data scientists and two peers in GenAI and chatbot architecture.

**Impact:** 68% fewer BI queries, 89% fewer HR escalations.

### Research Associate — Information Technology University

February 2021 – February 2022 · Lahore

Ran comprehensive EDA on crime datasets and built predictive models for trend and hotspot detection. Researched and implemented state-of-the-art bias mitigation algorithms.

### Machine Learning Intern — Auxtend

July 2019 – January 2020 · Lahore

Fine-tuned transformer models with attention mechanisms and beam search for a chatbot. Rebuilt document search using pretrained embeddings and cosine similarity.

**Impact:** 20% improvement in chatbot response accuracy; 30% increase in document search relevance.

---

## Education

- **University of Management and Technology (UMT)** — Master's degree, Data Science · 2018–2020
- **University of Central Punjab** — Masters of Commerce, Accounting and Finance · 2013–2016
- **University of the Punjab** — Bachelor's degree, Business/Commerce · 2011–2013
"""

DAILY_POSTS_INTRO = """
> **Operating rule (added 2026-07-22):** Every post is drafted using the LinkedIn Growth System as the blueprint (funnel bucket mix, hook-last, POV, format rotation), and every draft is run through the `be-human` skill before finalizing so it reads like Abubakar, not an AI.

# Daily LinkedIn Posts - AI Authority

Purpose: a running doc for daily LinkedIn post drafts based on the Content Strategy, Recommended Propositions & Ideal Client Profile, and current web research in Abubakar's field of practical AI systems.

## Operating rule

- Before creating a new post, read this doc first to avoid repeating topics and to preserve continuity.
- Check the funnel mix before writing: target 40% growth / 30% authority / 20% conversion / 10% personal.
- Posts go from newest (top) to oldest (bottom).

---

## Post 061 (2026-07-29) — Authority | Newsjacking

> 89% of our HR queries disappeared after we deployed an AI agent.
> Here's what nobody tells you about that number.

The 89% figure is real. It comes from a production system handling 3,000+ employees at a large conglomerate.

But here's what that number doesn't show: the 11% that didn't disappear got *more complex*.

When an AI handles the routine — leave balances, policy lookups, payroll questions — the queries that reach humans are the edge cases. The ambiguous ones. The ones that require judgment.

That's actually the right outcome. Human time is now allocated to genuinely human problems.

But it means you need to design for the handoff from day one. Not as an afterthought.

Three things we got right that made the handoff work:

1. Clear escalation paths. The agent knew exactly when to say "I can't help with this" and who to route to.
2. Context passing. When a query escalated, the human got the full conversation history, not a cold start.
3. Feedback loop. HR could flag incorrect agent responses directly, and those flags fed our retraining process.

The 89% headline is real. The 11% is where the real work lives.

What's your escalation strategy look like?

---

## Post 060 (2026-07-28) — Authority | Production lesson

> I've shipped 3 production LLM systems. The one thing they all have in common isn't the model. It's the evaluation suite.

Most AI projects I see fail the same way.

They nail the demo. The model answers well in controlled conditions. Stakeholders are impressed. They ship.

Six months later, it's quietly switched off.

What happened? One of three things:

- It degraded and nobody noticed until someone got a badly wrong answer in front of the CEO.
- Nobody could explain why it said what it said, so trust never built.
- The model provider updated the underlying model and behavior changed in production.

All three are evaluation problems, not model problems.

Here's what a real eval suite gives you:

**Regression detection.** When behavior changes — deliberately or because the model updated — you find out in the test run, not from an angry Slack message.

**Explainability baseline.** You can't explain a single response. You can explain a system that passes 47 of 50 defined test cases, with the 3 failures documented.

**Deployment confidence.** You deploy when 95%+ of golden cases pass. Not when it "feels good."

The model is a commodity now. The eval suite is the moat.

---

## Post 059 (2026-07-25) — Growth | Audience builder

> A lot of people are building AI agents right now.
> Very few are asking the question that actually determines whether they ship.

The question is: **how will you know when it's wrong?**

Not "is it accurate." Accurate at what. Measured how. On whose questions.

I've been in rooms where the demo was flawless and the product was broken. Not because anyone was dishonest. Because nobody had defined what "working" meant beyond "it answers."

The two things I always ask before I write a single line of agent code:

1. What does a correct answer look like? Who decides?
2. What does a graceful failure look like? Is "I don't know" an acceptable answer?

If you can't answer both in plain English, you're not ready to build. You're ready to prototype. That's fine — but name it correctly.

---

## Post 058 (2026-07-23) — Authority | Framework

> Most people building AI agents are solving the wrong problem first.

They start with the model. Then the integration. Then the UI. Then — if there's time — the evaluation.

The eval suite is last because it feels like QA. It's treated like polishing.

It's not polishing. It's architecture.

Here's the difference between teams that ship production AI and teams that demo it:

**Demo teams:** model → integration → UI → (optional) eval

**Production teams:** golden dataset → eval harness → model → integration → UI

The golden dataset forces you to define success before you build. That definition shapes every downstream decision: what the model needs to do, what integrations matter, what edge cases you're handling, what you're explicitly not handling.

Build the eval suite first. Not because it's better process. Because it makes the build faster and the result more defensible.

---

## Post 057 (2026-07-22) — Growth | Newsjacking

> LinkedIn rebuilt its entire feed algorithm and went public about it.
> Here's what it actually means for people who post seriously.

On March 12, 2026, Tim Jerka (VP of Engineering) announced that LinkedIn replaced several separate ranking systems with one unified LLM-powered model.

Three things changed that actually matter:

**1. The algorithm now reads your content, not just your engagement.**

The old system weighted likes, comments, shares. The new one uses an LLM to understand what your post is about and routes it to people who'd want it — including people who don't follow you.

This means keyword stuffing doesn't work. Writing for your real audience does.

**2. Smaller accounts now have structural lift.**

A/B tests showed gains for members with fewer connections. The old graph-based system naturally amplified large accounts. The new content-based system is more level.

**3. Your first ~50 words are a retrieval query.**

The model uses your opening to decide whether you enter the candidate pool at all. Slow setups mean you fail before a human ever votes.

If you're posting seriously, these three changes are worth building around.

---

## Post 056 (2026-07-21) — Authority | Production lesson

> Text-to-SQL sounds simple. It isn't.

The model writes a query. The query runs. You get a result. What could go wrong?

Here's what actually goes wrong:

**Wrong join.** The model uses the closest-sounding table relationship, not the correct one. The query returns results. They're plausible. They're wrong.

**Wrong fiscal calendar.** Your company's fiscal year starts in April. The model assumes January. "Q1 revenue" is now three months off.

**Wrong aggregation.** "Average order value" could mean total revenue divided by orders, or it could mean the mean of individual order values. They're different numbers. The model picks one.

**Missing NULL handling.** The model doesn't know that 0 and NULL mean different things in your data warehouse.

None of these produce error messages. They produce confident wrong answers. And confident wrong answers in a BI tool get pasted into board decks.

The fix isn't a better model. It's better schema context, explicit business rules, and a feedback mechanism that routes wrong answers back to you with the full trace.

We caught all four of these in production. The eval suite caught three before launch.

---

## Post 055 (2026-07-18) — Growth | Hot take

> Every AI vendor is selling you accuracy numbers.
> None of them are measuring what actually matters.

"95% accurate" sounds good until you ask: accurate at what?

Accurate on their test set. Built by them. On questions they chose. In conditions they controlled.

That's not a metric. That's a press release.

What actually matters in production:

- What does it do when a user asks something it wasn't designed for?
- What happens when the underlying data changes?
- Can a non-technical user tell when it's wrong?

I've never had a client who could answer all three before deployment. The ones who couldn't answer them at all — those are the systems that get quietly turned off six months later.

The question isn't "how accurate is it." The question is "how do we know when it's wrong, and what happens then."

---

## Post 054 (2026-07-17) — Authority | Build in public

> I'm building an open-source LangGraph agent evaluation suite.
> Here's why I'm starting with the tests, not the agent.

Most GitHub repos for AI agents look like this: agent code, a README with a demo, and a note at the bottom saying "tests coming soon."

Tests never come soon.

I'm building this backwards. The evaluation harness is the first commit. The agent comes after.

Here's what the harness includes before a single agent feature exists:

- 40 golden test cases: 20 happy path, 12 ambiguous (clarifying question required), 8 should-refuse
- DeepEval integration with correctness, faithfulness, and answer relevancy metrics
- A script that runs the full suite and returns a pass/fail with a score breakdown

The reason is simple: you can't improve what you can't measure. If I build the agent first, every change I make is based on vibes. With the eval suite first, every change is measured.

Repository link in the comments. If you've built eval suites for LLM agents, I genuinely want to know: how did you source your golden dataset?
"""


# ── Convert and seed ─────────────────────────────────────────────────────────

def make_blocks_sql(page_id, content_md):
    blocks = parse_markdown(content_md.strip())
    rows = []
    for i, block in enumerate(blocks):
        content_json = json.dumps(block, ensure_ascii=False).replace("'", "''")
        rows.append(
            f"(gen_random_uuid(), '{page_id}', '{block['type']}', '{content_json}'::jsonb, {i})"
        )
    return rows


def run_sql(sql):
    result = subprocess.run(
        ['npx', 'supabase', 'db', 'query', '--local'],
        input=sql,
        capture_output=True,
        text=True,
        cwd='/Users/Apple/projects/graphbrain'
    )
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}", file=sys.stderr)
        return False
    return True


def seed_page(key, content_md):
    page_id = PAGE_IDS[key]
    print(f"Seeding {key} ({page_id})...")

    # Delete existing blocks
    del_sql = f"DELETE FROM blocks WHERE page_id = '{page_id}';"
    if not run_sql(del_sql):
        print(f"  Failed to delete existing blocks for {key}")
        return

    # Insert new blocks
    rows = make_blocks_sql(page_id, content_md)
    if not rows:
        print(f"  No blocks generated for {key}")
        return

    # Insert in batches of 50
    for batch_start in range(0, len(rows), 50):
        batch = rows[batch_start:batch_start + 50]
        insert_sql = f"""
INSERT INTO blocks (id, page_id, type, content, position)
VALUES
{','.join(batch)};
"""
        if not run_sql(insert_sql):
            print(f"  Failed to insert batch {batch_start//50 + 1} for {key}")
            return

    print(f"  Done — {len(rows)} blocks inserted.")


if __name__ == '__main__':
    seed_page("linkedin_growth", LINKEDIN_GROWTH)
    seed_page("content_calendar", CONTENT_CALENDAR)
    seed_page("voice_guide", VOICE_GUIDE)
    seed_page("linkedin_profile", LINKEDIN_PROFILE)
    seed_page("daily_posts", DAILY_POSTS_INTRO)
    print("\nAll pages seeded successfully.")
