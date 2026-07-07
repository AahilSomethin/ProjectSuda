import type {
  CalendarMeeting,
  LinearTask,
  PersonalityMode,
} from "../types";

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

export async function summarizeTasks(
  tasks: LinearTask[],
  personality: PersonalityMode = "gentle",
): Promise<string> {
  // TODO: Integrate OpenAI or Gemini API for real summarization
  // const response = await fetch("https://api.openai.com/v1/chat/completions", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }] }),
  // });

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

export async function summarizeMeeting(
  meeting: CalendarMeeting,
  personality: PersonalityMode = "gentle",
): Promise<string> {
  // TODO: Integrate OpenAI or Gemini API for real meeting summaries

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
