# ADR 003 — Three-Tier NLP Pipeline: VADER → DeBERTa → Claude

**Status:** Accepted
**Date:** 2025-11-01
**Authors:** KhushFus Engineering

---

## Context

KhushFus must perform sentiment analysis on every mention collected from 20+ social platforms. The requirements are:

1. **Cost efficiency** — processing millions of mentions/month via a paid API for every mention would be prohibitively expensive
2. **Latency** — the analysis step must not become a pipeline bottleneck; P99 latency should stay under 2 seconds per mention
3. **Accuracy** — enterprise customers expect accurate sentiment analysis, especially for high-engagement content
4. **No external dependency for basic functionality** — the core pipeline must work without a paid API key
5. **Advanced insights for premium tiers** — high-value mentions (viral content, crises) warrant deeper analysis

The team evaluated four approaches:

**Option A: VADER only (rule-based)**
- Free, fast (microseconds), no external API
- Poor accuracy on sarcasm, domain-specific language, non-English text
- Adequate for high-volume low-value content; insufficient for enterprise accuracy requirements

**Option B: Single transformer model (DeBERTa) for all mentions**
- Good accuracy across languages and contexts
- Slow for high-volume processing (1–3 seconds/mention without GPU)
- Free to run but requires GPU infrastructure at scale
- Does not provide the "escalation to LLM for complex cases" capability

**Option C: OpenAI/Claude API for all mentions**
- High accuracy, broad language support, context-aware
- Very expensive at scale (millions of mentions/month)
- External API dependency — pipeline fails if API is unavailable
- Latency dependent on API response time (500ms–3s)

**Option D: Three-tier auto-escalation**
- Tier 1 (VADER): free, instant — handles simple sentiment
- Tier 2 (DeBERTa): local transformer — handles nuanced cases
- Tier 3 (Claude API): for complex, high-engagement, or low-confidence cases
- Cost and latency are proportional to the need for accuracy

---

## Decision

We will implement a **three-tier sentiment analysis pipeline** with automatic escalation based on confidence score and engagement signals.

The escalation logic in `src/nlp/analyzer.py`:

```
1. Run VADER (lexicon-based, <1ms)
   ├─ If confidence >= 0.8 and engagement < threshold → DONE (Tier 1)
   └─ Else → escalate to Tier 2

2. Run DeBERTa (local transformer, 1–3s)
   ├─ If confidence >= 0.7 and not (viral or sarcasm detected) → DONE (Tier 2)
   └─ Else → escalate to Tier 3

3. Run Claude API (paid LLM, 0.5–3s)
   → Final result: highest-quality sentiment + crisis detection + narrative insights
```

**Escalation triggers (Tier 1 → Tier 2):**
- VADER compound score between -0.5 and +0.5 (low confidence)
- Author has >10,000 followers (high engagement)
- Text is in a non-English language

**Escalation triggers (Tier 2 → Tier 3):**
- DeBERTa confidence < 0.7
- Virality score > configured threshold
- Sarcasm detected (dedicated sarcasm classifier)
- Customer is on Enterprise plan (always use best tier)

**Additional NLP capabilities (all tiers):**
- spaCy NER: entity extraction (people, organizations, locations, products)
- BERTopic: topic modeling for cluster analysis
- Emotion detection: 7 emotions (joy, anger, fear, sadness, surprise, disgust, trust)
- Aspect-based sentiment: sentiment per identified aspect/entity

All model loading is **lazy** — models are loaded on first use and cached in memory. This keeps startup time fast and avoids loading unused models in development.

---

## Consequences

**Positive:**
- The majority of mentions (estimated 70–80%) are handled by VADER at near-zero cost
- 15–25% of mentions escalate to DeBERTa — significant accuracy improvement with no per-call cost
- Only 2–5% of mentions require the Claude API — cost is controlled and predictable
- The system degrades gracefully: if the Claude API is unavailable, Tier 2 results are used; if DeBERTa is unavailable (e.g., model not downloaded), VADER results are used
- Enterprise customers get higher-quality analysis proportional to their subscription price

**Negative:**
- Three code paths introduce complexity — bugs can affect only one tier
- DeBERTa model requires significant RAM (1–4 GB depending on model size); the analyzer service has a 4 GB memory limit in `docker-compose.yml`
- If DeBERTa is not pre-downloaded, the first escalation triggers a model download that can take several minutes
- Tier thresholds (confidence 0.8, follower count 10,000) are empirically set and will need tuning based on real data
- `CLAUDE_API_KEY` must be set for Tier 3 to work; without it, high-complexity mentions fall back to Tier 2

**Follow-up work:**
- Collect tier distribution metrics (what % of mentions hit each tier) and expose in Grafana
- A/B test threshold values against a labeled dataset to optimize the escalation cutoffs
- Consider caching DeBERTa results for identical text to reduce duplicate processing
- Evaluate whether a smaller fine-tuned model could replace some Tier 3 calls
- Add latency metrics per tier to identify bottlenecks
