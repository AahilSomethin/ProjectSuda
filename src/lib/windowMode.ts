import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

export const COMPACT_SIZE = { width: 56, height: 56 } as const;
export const EXPANDED_SIZE = { width: 380, height: 420 } as const;

export type WindowMode = "compact" | "expanded";

async function positionWindowCompact(): Promise<void> {
  const appWindow = getCurrentWindow();
  const monitor = await currentMonitor();
  if (!monitor) return;

  const { workArea } = monitor;
  const x = workArea.position.x + workArea.size.width - COMPACT_SIZE.width;
  const y = workArea.position.y + workArea.size.height - COMPACT_SIZE.height;

  await appWindow.setPosition(new PhysicalPosition(x, y));
}

async function positionWindowExpanded(): Promise<void> {
  const appWindow = getCurrentWindow();
  const monitor = await currentMonitor();
  if (!monitor) return;

  const { workArea } = monitor;
  const x = workArea.position.x + workArea.size.width - EXPANDED_SIZE.width;
  const y =
    workArea.position.y +
    Math.floor((workArea.size.height - EXPANDED_SIZE.height) / 2);

  await appWindow.setPosition(new PhysicalPosition(x, y));
}

export async function setWindowMode(mode: WindowMode): Promise<void> {
  try {
    const appWindow = getCurrentWindow();
    const size = mode === "compact" ? COMPACT_SIZE : EXPANDED_SIZE;

    await appWindow.setSize(new LogicalSize(size.width, size.height));

    if (mode === "compact") {
      await positionWindowCompact();
    } else {
      await positionWindowExpanded();
    }
  } catch {
    // Not running in Tauri (e.g. browser preview) — skip
  }
}
