// Rethink with AI — Groq-backed reflection endpoint.
// POST { text, mode }  ->  { headline, sections:[{label,body}], takeaway, disclaimer, model }
// Modes: reframe | challenge | perspectives | sharpen
import { guard } from "./_guard.js";

const PRIMARY = process.env.RETHINK_MODEL || "llama-3.3-70b-versatile";
const FALLBACK = "llama-3.1-8b-instant";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SAFETY =
  "You are a warm, grounded thinking partner — not a therapist, doctor, or coach, and you never diagnose. " +
  "Work ONLY with what the person actually wrote; never invent facts, events, quotes, names, or numbers about them or their life. " +
  "Be concrete, kind, and concise — short paragraphs, plain language, no clinical jargon, no empty reassurance. " +
  "If the writing suggests the person may be in crisis or thinking about harming themselves, respond with care and, in the takeaway, gently encourage them to reach out to someone they trust or a local helpline.";

const MODES = {
  reframe: {
    title: "Reframe",
    instruction:
      "Help the person see this thought in a more balanced, compassionate way (cognitive reframing). " +
      "Produce sections with these labels in order: " +
      "'What I'm hearing' (reflect the core feeling/thought back, briefly), " +
      "'Patterns at play' (name any unhelpful thinking patterns you notice — e.g. all-or-nothing, catastrophising, mind-reading, over-generalising — only if genuinely present, and explain gently), " +
      "'A more balanced view' (2–3 alternative, realistic ways to hold this — not toxic positivity), " +
      "'A kinder question' (one reflective question to sit with).",
  },
  challenge: {
    title: "Challenge",
    instruction:
      "Play a fair, rigorous devil's advocate against this thought or idea — to strengthen the person's thinking, not to win. " +
      "Produce sections with these labels in order: " +
      "'The strongest counter-case' (the best argument against their position, made in good faith), " +
      "'Hidden assumptions' (what this thought quietly takes for granted), " +
      "'Blind spots' (what it might be missing or not seeing), " +
      "'Steelman the other side' (the most charitable version of an opposing view).",
  },
  perspectives: {
    title: "Other perspectives",
    instruction:
      "Show this thought through several different lenses so the person can widen their angle. " +
      "Produce one section per lens with these labels: " +
      "'A trusted mentor', 'A clear-eyed skeptic', 'A calm pragmatist', and 'Future you (a year on)'. " +
      "Each gives a short, distinct take in that voice — genuinely different vantage points, not four paraphrases of the same point.",
  },
  sharpen: {
    title: "Sharpen & act",
    instruction:
      "Help the person clarify and act on this thought. " +
      "Produce sections with these labels in order: " +
      "'What you're really saying' (distill it to its clearest form), " +
      "'The core' (the one thing that actually matters here), " +
      "'Next steps' (2–4 concrete, doable actions), " +
      "'Questions to explore' (2–3 sharp questions that move it forward).",
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST" }); return; }
  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ error: "NO_KEY", message: "The AI engine isn't configured yet — set GROQ_API_KEY in the Vercel project." });
    return;
  }

  const blocked = guard(req, res);
  if (blocked) return;

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const text = String(body.text || "").trim();
  const modeKey = String(body.mode || "reframe").toLowerCase();
  const mode = MODES[modeKey] || MODES.reframe;
  const followup = String(body.followup || "").trim().slice(0, 500);
  const prior = String(body.prior || "").trim().slice(0, 4000);

  if (!text) { res.status(400).json({ error: "EMPTY", message: "Write a thought first." }); return; }
  if (text.length > 6000) { res.status(413).json({ error: "TOO_LONG", message: "That's a lot at once — try a shorter passage (under ~6000 characters)." }); return; }

  let system, user;
  if (followup) {
    // One guarded follow-up exchange: grounded ONLY in their text + the prior reflection.
    system =
      SAFETY + "\n\n" +
      "The person already received your '" + mode.title + "' reflection on their thought and now asks ONE follow-up question. " +
      "Answer it in under 150 words, grounded ONLY in their original text and your prior reflection — introduce no new facts about them or their life. " +
      "If the question needs information you don't have, say so plainly.\n\n" +
      "Respond with ONLY a JSON object of this exact shape:\n" +
      '{ "headline": "", "sections": [ { "label": "Follow-up", "body": "<your answer>" } ], "takeaway": "<one closing line>" }';
    user =
      "My original thought:\n\n" + text +
      (prior ? "\n\nYour prior reflection:\n" + prior : "") +
      "\n\nMy follow-up question: " + followup;
  } else {
    system =
      SAFETY + "\n\n" + mode.instruction + "\n\n" +
      "Respond with ONLY a JSON object of this exact shape:\n" +
      '{ "headline": "<one warm sentence naming what you did>", ' +
      '"sections": [ { "label": "<section label>", "body": "<a few sentences; use \\n line breaks for short lists>" } ], ' +
      '"takeaway": "<one closing line to leave them with>" }\n' +
      "Keep the whole response readable in under ~350 words. Use the exact section labels described above.";
    user = "Here is what I wrote:\n\n" + text;
  }

  try {
    const data = await callGroq(PRIMARY, system, user).catch(() => callGroq(FALLBACK, system, user));
    const parsed = parse(data.content);
    res.status(200).json({
      ...parsed,
      mode: modeKey,
      model: data.model,
      disclaimer: "A reflection from AI — a prompt for your own thinking, not advice, therapy, or fact. You know your situation best.",
    });
  } catch (err) {
    res.status(502).json({ error: "UPSTREAM", message: "The AI engine didn't respond. Please try again in a moment." });
  }
}

async function callGroq(model, system, user) {
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      max_tokens: 1100,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error("groq " + r.status);
  const j = await r.json();
  return { content: j.choices?.[0]?.message?.content || "", model };
}

// Brevity is enforced server-side too: ≤6 sections, each trimmed at a sentence
// boundary near 1,200 chars — a reflection should stay readable, not sprawl.
function trimBody(s) {
  if (s.length <= 1200) return s;
  const cut = s.slice(0, 1200);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return (end > 200 ? cut.slice(0, end + 1) : cut).trim() + " …";
}

function parse(raw) {
  let obj;
  try { obj = JSON.parse(raw); }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { obj = JSON.parse(m ? m[0] : "{}"); } catch { obj = {}; }
  }
  const sections = Array.isArray(obj.sections)
    ? obj.sections.filter(s => s && (s.label || s.body))
        .slice(0, 6)
        .map(s => ({ label: String(s.label || "").trim().slice(0, 60), body: trimBody(String(s.body || "").trim()) }))
    : [];
  return {
    headline: String(obj.headline || "").trim().slice(0, 220) || "Here's another way to look at it.",
    sections: sections.length ? sections : [{ label: "", body: trimBody(String(raw || "").trim().slice(0, 1500)) }],
    takeaway: String(obj.takeaway || "").trim().slice(0, 300),
  };
}
