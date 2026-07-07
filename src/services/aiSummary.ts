import { config } from "../config";
import type {
  CalendarMeeting,
  LinearTask,
  PersonalityMode,
} from "../types";

// TODO: VITE_OPENAI_API_KEY in the frontend is fine for local dev only.
// If SUDA is shared with users, move OpenAI calls to a backend so the key
// is never exposed in the client bundle.

const PERSONALITY_INSTRUCTIONS: Record<PersonalityMode, string> = {
  gentle: "Be warm, calm, and supportive.",
  focused: "Be direct and efficiency-minded.",
  strict: "Be firm, no-nonsense, and hold them accountable.",
  bitchy: "Be sarcastic and blunt, but still helpful.",
  stubborn: "Repeat key points like you mean it; don't budge.",
  cheerful: "Be upbeat and encouraging.",
  deadpan: "Be dry, minimal, and matter-of-fact.",
  motivational: "Be energizing and push them to act.",
  chaotic: "Be unpredictable and dramatic, but still coherent.",
};

function buildSystemPrompt(personality: PersonalityMode): string {
  return [
    "You are SUDA, a compact desktop AI companion delivering short transmissions.",
    PERSONALITY_INSTRUCTIONS[personality],
    "Respond with ONE clean message only.",
    "Write for speech: concise, natural, no markdown, no headers, no bullet lists.",
    "Keep it under 120 words.",
  ].join(" ");
}

async function callOpenAI(
  userPrompt: string,
  personality: PersonalityMode,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [
        { role: "system", content: buildSystemPrompt(personality) },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const message = data.choices?.[0]?.message?.content?.trim();

  if (!message) {
    throw new Error("OpenAI returned an empty summary");
  }

  return message;
}

function personalityPrefix(mode: PersonalityMode): string {
  const prefixes: Record<PersonalityMode, string> = {
    gentle: "Here's a gentle overview:",
    focused: "Focus points:",
    strict: "Priority items — no excuses:",
    bitchy: "Fine. Here's what you're ignoring:",
    stubborn: "I'm telling you again:",
    cheerful: "Great news — you've got stuff to do!",
    deadpan: "Tasks.",
    motivational: "Let's crush these:",
    chaotic: "CHAOS REPORT incoming:",
  };
  return prefixes[mode];
}

function mockSummarizeTasks(
  tasks: LinearTask[],
  personality: PersonalityMode,
): string {
  if (tasks.length === 0) {
    return "No active tasks found. You're all caught up.";
  }

  const prefix = personalityPrefix(personality);
  const lines = tasks.map(
    (t) =>
      `• ${t.title} [${t.status}${t.priority ? `, ${t.priority}` : ""}]`,
  );

  return `${prefix}\n\n${lines.join("\n")}\n\n${tasks.length} task${tasks.length === 1 ? "" : "s"} need attention.`;
}

function mockSummarizeMeeting(
  meeting: CalendarMeeting,
  personality: PersonalityMode,
): string {
  const start = new Date(meeting.startTime);
  const timeStr = start.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = start.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const prefix = personalityPrefix(personality);

  return `${prefix}\n\n"${meeting.title}" starts ${dateStr} at ${timeStr}.${meeting.description ? `\n\n${meeting.description}` : ""}`;
}

function formatTasksForPrompt(tasks: LinearTask[]): string {
  return tasks
    .map(
      (t) =>
        `- ${t.title} (status: ${t.status}${t.priority ? `, priority: ${t.priority}` : ""}${t.description ? `, notes: ${t.description}` : ""})`,
    )
    .join("\n");
}

export async function summarizeTasks(
  tasks: LinearTask[],
  personality: PersonalityMode = "gentle",
): Promise<string> {
  if (tasks.length === 0) {
    return "No active tasks found. You're all caught up.";
  }

  if (config.openaiApiKey) {
    try {
      const prompt = `Summarize these incomplete Linear tasks as a SUDA transmission:\n\n${formatTasksForPrompt(tasks)}`;
      return await callOpenAI(prompt, personality);
    } catch {
      // Fall through to mock summary
    }
  }

  return mockSummarizeTasks(tasks, personality);
}

export async function summarizeMeeting(
  meeting: CalendarMeeting,
  personality: PersonalityMode = "gentle",
): Promise<string> {
  // Google Calendar + meeting summaries disabled for now — kept for future use
  if (config.openaiApiKey) {
    try {
      const start = new Date(meeting.startTime);
      const prompt = [
        "Summarize this upcoming calendar meeting as a SUDA transmission:",
        `Title: ${meeting.title}`,
        `Start: ${start.toISOString()}`,
        `End: ${meeting.endTime}`,
        meeting.description ? `Description: ${meeting.description}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return await callOpenAI(prompt, personality);
    } catch {
      // Fall through to mock summary
    }
  }

  return mockSummarizeMeeting(meeting, personality);
}
