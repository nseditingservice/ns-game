import { z } from "zod";
import type { Goal, Plan, Season, Task } from "./types";
import { addDays, fmtTime, todayStr, weeksIn } from "./dates";

const MODEL = "claude-opus-5-5";

const COACH_SYSTEM = `You are a warm, direct personal productivity coach inside a planning app.
You draw on well-known ideas about goal setting, deep work, time blocking, energy management and habit formation.
Be concrete and practical. Prefer a few high-leverage suggestions over long lists. Never moralise.`;

async function ask<T>(apiKey: string, prompt: string, schema: z.ZodType<T>, effort: "low" | "medium" | "high" = "medium"): Promise<T> {
  if (!apiKey) throw new Error("AI is optional and needs a Claude API key (paid by usage). Add one in Settings, or plan manually.");
  // Loaded on demand so the app stays light for people who never use AI.
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([import("@anthropic-ai/sdk"), import("@anthropic-ai/sdk/helpers/beta/zod")]);
  // This is a personal app running only on your own device, so the key lives in your browser.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: COACH_SYSTEM,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") throw new Error("Claude declined this request. Try rephrasing.");
    if (res.stop_reason === "max_tokens") throw new Error("The response was cut off. Try a smaller request.");
    if (!res.parsed_output) throw new Error("Couldn't read Claude's response. Please try again.");
    return res.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("Your API key was rejected. Check it in Settings.");
    if (err instanceof Anthropic.RateLimitError) throw new Error("Rate limited by the API. Wait a moment and retry.");
    if (err instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach the Claude API. Check your connection.");
    throw err;
  }
}

// ---------- Goal breakdown ----------

const BreakdownSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      week: z.number().int().describe("1-based week number within the season"),
      estimateMins: z.number().int(),
    }),
  ),
  advice: z.string().describe("One or two sentences on how to approach this goal"),
});

export async function breakdownGoal(apiKey: string, goal: Goal, season: Season, existing: Task[]) {
  const weeks = weeksIn(season.start, season.end);
  const today = todayStr();
  const prompt = `Break this goal into concrete weekly tasks for the season.

Season: ${season.name} (${season.start} to ${season.end}, ${weeks.length} weeks). Today is ${today}.
Week numbers: ${weeks.map((w, i) => `${i + 1}=${w}`).join(", ")}

Goal: ${goal.title}
Why it matters: ${goal.why || "(not given)"}
${existing.length ? `Tasks already planned (don't duplicate):\n${existing.map((t) => `- ${t.title} (week of ${t.week})`).join("\n")}` : ""}

Rules:
- Only use weeks from today onward.
- 1-4 tasks per week, each a clear next action finishable in one or a few focus sessions (estimateMins 25-240).
- Front-load the riskiest or most important work. Leave the last week for review/buffer.`;
  const out = await ask(apiKey, prompt, BreakdownSchema, "high");
  const currentWeek = weeks.findIndex((w) => addDays(w, 6) >= today);
  return {
    advice: out.advice,
    tasks: out.tasks
      .filter((t) => t.title.trim())
      .map((t) => ({
        title: t.title.trim(),
        week: weeks[Math.min(Math.max(t.week - 1, Math.max(currentWeek, 0)), weeks.length - 1)],
        estimateMins: Math.min(Math.max(t.estimateMins, 15), 480),
      })),
  };
}

// ---------- Week planning ----------

const PlanSchema = z.object({
  blocks: z.array(
    z.object({
      taskId: z.string(),
      date: z.string().describe("YYYY-MM-DD"),
      start: z.string().describe("HH:MM 24h"),
      end: z.string().describe("HH:MM 24h"),
    }),
  ),
  summary: z.string().describe("One or two sentences explaining the plan"),
});

export async function planWeek(opts: {
  apiKey: string;
  week: string;
  tasks: Task[];
  goals: Goal[];
  blocks: Plan[];
  dayStart: number;
  dayEnd: number;
  preferences: string;
}) {
  const { week, tasks, goals, blocks, dayStart, dayEnd } = opts;
  const today = todayStr();
  const goalName = new Map(goals.map((g) => [g.id, g.title]));
  const scheduled = new Set(blocks.map((b) => b.taskId));
  const todo = tasks.filter((t) => !t.done && !scheduled.has(t.id));
  if (!todo.length) throw new Error("No unscheduled tasks this week. Add tasks first.");
  const prompt = `Time-block my week. Week starts ${week} (Monday). Today is ${today}; don't schedule anything before today.
Working hours: ${dayStart}:00 to ${dayEnd}:00.
${opts.preferences ? `My preferences: ${opts.preferences}` : "Default preferences: deep work in the morning, max ~4h of deep work per day, keep weekends light, 15 minute gaps between blocks."}

Already on the calendar (don't overlap):
${blocks.length ? blocks.map((b) => `- ${b.date} ${fmtTime(b.start)}-${fmtTime(b.end)} ${b.title}`).join("\n") : "(nothing)"}

Tasks to schedule (use the exact taskId):
${todo.map((t) => `- taskId=${t.id} | ${t.title} | ~${t.estimateMins} min | goal: ${t.goalId ? goalName.get(t.goalId) : "none"}`).join("\n")}

Schedule every task if it fits; split big tasks across several blocks with the same taskId if useful. Use 15-minute boundaries.`;
  const out = await ask(opts.apiKey, prompt, PlanSchema, "medium");
  const byId = new Map(todo.map((t) => [t.id, t]));
  const weekEnd = addDays(week, 6);
  const toMins = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const valid = out.blocks
    .map((b) => ({ ...b, s: toMins(b.start), e: toMins(b.end), task: byId.get(b.taskId) }))
    .filter((b) => b.task && b.date >= week && b.date <= weekEnd && b.e > b.s && b.s >= dayStart * 60 && b.e <= dayEnd * 60);
  return {
    summary: out.summary,
    blocks: valid.map((b) => ({ taskId: b.taskId, goalId: b.task!.goalId, title: b.task!.title, date: b.date, start: b.s, end: b.e })),
  };
}


// ---------- Weekly review coaching ----------

const CoachSchema = z.object({
  feedback: z.string().describe("3-6 sentences of honest, encouraging reflection on the week"),
  suggestions: z.array(z.string()).describe("2-4 specific actions for next week"),
});

export async function coachReview(apiKey: string, context: string) {
  return ask(
    apiKey,
    `Here is my week. Coach me: what went well, what pattern do you notice, and what should I do differently next week?\n\n${context}`,
    CoachSchema,
    "medium",
  );
}
