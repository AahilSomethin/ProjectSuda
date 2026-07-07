import { config } from "../config";
import type { LinearTask } from "../types";

const MOCK_TASKS: LinearTask[] = [
  {
    id: "task-1",
    title: "Implement auth middleware",
    description: "Add JWT validation to API routes",
    status: "In Progress",
    priority: "High",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "task-2",
    title: "Design onboarding flow",
    description: "Wireframes for new user experience",
    status: "Todo",
    priority: "Medium",
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: "task-3",
    title: "Fix pagination bug",
    description: "List endpoint returns duplicate pages",
    status: "In Progress",
    priority: "Urgent",
    updatedAt: new Date(Date.now() - 7200_000).toISOString(),
  },
  {
    id: "task-4",
    title: "Update API documentation",
    description: "Sync OpenAPI spec with latest endpoints",
    status: "Backlog",
    priority: "Low",
    updatedAt: new Date(Date.now() - 86400_000).toISOString(),
  },
];

function isIncomplete(status: string): boolean {
  const done = ["done", "completed", "cancelled", "canceled"];
  return !done.includes(status.toLowerCase());
}

async function fetchFromLinearApi(): Promise<LinearTask[]> {
  // TODO: Replace with real Linear GraphQL API call
  // const response = await fetch("https://api.linear.app/graphql", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: config.linearApiKey,
  //   },
  //   body: JSON.stringify({
  //     query: `query { team(id: "${config.linearTeamId}") { issues(filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id title description state { name } priority updatedAt } } } }`,
  //   }),
  // });
  // const data = await response.json();
  // return data.data.team.issues.nodes.map(...);
  throw new Error("Linear API not yet implemented");
}

export async function fetchIncompleteLinearTasks(): Promise<LinearTask[]> {
  if (!config.linearApiKey) {
    return MOCK_TASKS.filter((t) => isIncomplete(t.status));
  }

  try {
    return await fetchFromLinearApi();
  } catch {
    return MOCK_TASKS.filter((t) => isIncomplete(t.status));
  }
}

export async function fetchNewLinearUpdates(
  seenIds: Set<string>,
): Promise<LinearTask[]> {
  const tasks = await fetchIncompleteLinearTasks();
  return tasks.filter((t) => !seenIds.has(t.id));
}

export { MOCK_TASKS };
