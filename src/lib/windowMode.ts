import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";
import { devLog } from "./devLog";

export const COMPACT_SIZE = { width: 56, height: 56 } as const;
export const COMPACT_MENU_SIZE = { width: 160, height: 220 } as const;
export const COMPACT_SETTINGS_SIZE = { width: 240, height: 320 } as const;
export const EXPANDED_SIZE = { width: 380, height: 420 } as const;

export type WindowMode =
  | "compact"
  | "compact-menu"
  | "compact-settings"
  | "expanded";

interface LogicalWorkArea {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

function getSizeForMode(mode: WindowMode): { width: number; height: number } {
  switch (mode) {
    case "compact":
      return COMPACT_SIZE;
    case "compact-menu":
      return COMPACT_MENU_SIZE;
    case "compact-settings":
      return COMPACT_SETTINGS_SIZE;
    case "expanded":
      return EXPANDED_SIZE;
  }
}

async function getLogicalWorkArea(): Promise<LogicalWorkArea | null> {
  const monitor = await currentMonitor();
  if (!monitor) return null;

  const { workArea, scaleFactor } = monitor;
  return {
    originX: workArea.position.x / scaleFactor,
    originY: workArea.position.y / scaleFactor,
    width: workArea.size.width / scaleFactor,
    height: workArea.size.height / scaleFactor,
  };
}

async function positionWindow(mode: WindowMode): Promise<void> {
  const appWindow = getCurrentWindow();
  const area = await getLogicalWorkArea();
  if (!area) return;

  const size = getSizeForMode(mode);
  const x = area.originX + area.width - size.width;
  const y =
    mode === "expanded"
      ? area.originY + Math.floor((area.height - size.height) / 2)
      : area.originY + area.height - size.height;

  await appWindow.setPosition(new LogicalPosition(x, y));
}

export async function setWindowMode(mode: WindowMode): Promise<void> {
  try {
    const appWindow = getCurrentWindow();
    const size = getSizeForMode(mode);

    await appWindow.setSize(new LogicalSize(size.width, size.height));
    await positionWindow(mode);
  } catch (error) {
    devLog("[SUDA] setWindowMode failed (non-Tauri environment?)", error);
  }
}

export async function setCompactOverlay(menuOpen: boolean): Promise<void> {
  await setWindowMode(menuOpen ? "compact-menu" : "compact");
}

export async function setSettingsOverlay(open: boolean): Promise<void> {
  await setWindowMode(open ? "compact-settings" : "compact");
}
