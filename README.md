# Rethink with AI

Hand a thought to AI and see it differently. Paste (or arrive from [My Thoughts](https://github.com/SyAhmedU/my-thoughts)) and pick a lens:

- **🪶 Reframe it** — spot unhelpful thinking patterns and find a kinder, more balanced view (cognitive-reframing style).
- **⚖️ Challenge it** — fair devil's advocate: the strongest counter-case, hidden assumptions, blind spots, a steelman of the other side.
- **🔭 Other perspectives** — the same thought through a mentor, a skeptic, a pragmatist, and future-you.
- **✦ Sharpen & act** — distill what you really mean, find the core, and get concrete next steps.

Switch lenses with no re-typing; **run all four** at once. Results are cached per lens for the current text.

## Stack

- Static `index.html` front-end (vanilla JS, no build), Syed-fire theme, light/dark, installable PWA.
- `api/rethink.js` — Vercel Node function. **Groq** `llama-3.3-70b-versatile` → `llama-3.1-8b-instant` fallback. Override with `RETHINK_MODEL`. Needs `GROQ_API_KEY` (returns a 503 with a friendly message if unset).
- `api/_guard.js` — fail-open size + per-IP/global rate limit (in-memory) so the open endpoint can't be trivially abused.

## Guardrails

The system prompt makes the model a **thinking partner, not a therapist or doctor** — it never diagnoses, works only with what you wrote, invents no facts/quotes/numbers about you, and responds with care (pointing toward real-world support) if writing suggests crisis. Every result carries a visible disclaimer: a reflection to think with, not advice, therapy, or fact.

## Privacy

No accounts, no server-side storage. Your thought is sent to the AI engine **only** when you press Rethink. The companion app, My Thoughts, keeps everything on-device and only sends a thought here when you choose to.

## Env

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Groq API key (required for the AI to work) |
| `RETHINK_MODEL` | Override the primary Groq model (optional) |
| `RETHINK_RL_PER_MIN` / `RETHINK_RL_GLOBAL_PER_MIN` / `RETHINK_MAX_BYTES` | Guard tunables (optional) |

Deploy → Vercel.
