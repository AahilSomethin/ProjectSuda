import { useCallback, useEffect, useRef, useState } from "react";
import { setCompactOverlay } from "../lib/windowMode";

interface SudaControlMenuProps {
  panelVisible: boolean;
  briefingLoading: boolean;
  settingsOpen: boolean;
  onSummon: () => void;
  onDismiss: () => void;
  onRefreshBriefing: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}

export default function SudaControlMenu({
  panelVisible,
  briefingLoading,
  settingsOpen,
  onSummon,
  onDismiss,
  onRefreshBriefing,
  onOpenSettings,
  onCloseSettings,
}: SudaControlMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (panelVisible || settingsOpen) return;
    void setCompactOverlay(menuOpen);
  }, [menuOpen, panelVisible, settingsOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        if (settingsOpen) {
          onCloseSettings();
        }
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen, onCloseSettings, settingsOpen]);

  const handleFabClick = () => {
    setMenuOpen((open) => !open);
  };

  const handleSummon = () => {
    closeMenu();
    onSummon();
  };

  const handleDismiss = () => {
    closeMenu();
    onDismiss();
  };

  const handleRefresh = () => {
    closeMenu();
    onRefreshBriefing();
  };

  const handleSettings = () => {
    closeMenu();
    if (settingsOpen) {
      onCloseSettings();
    } else {
      onOpenSettings();
    }
  };

  return (
    <div className="suda-control" ref={rootRef}>
      {menuOpen && (
        <div className="suda-control__menu" role="menu" aria-label="SUDA controls">
          {!panelVisible && (
            <button
              type="button"
              className="suda-control__item"
              role="menuitem"
              onClick={handleSummon}
            >
              Summon SUDA
            </button>
          )}
          {panelVisible && (
            <button
              type="button"
              className="suda-control__item"
              role="menuitem"
              onClick={handleDismiss}
            >
              Hide SUDA
            </button>
          )}
          <button
            type="button"
            className="suda-control__item"
            role="menuitem"
            disabled={briefingLoading}
            onClick={handleRefresh}
          >
            {briefingLoading ? "Checking Linear…" : "Refresh Briefing"}
          </button>
          <button
            type="button"
            className="suda-control__item"
            role="menuitem"
            onClick={handleSettings}
            aria-pressed={settingsOpen}
          >
            Settings
          </button>
        </div>
      )}

      <button
        type="button"
        className={`suda-control__fab${menuOpen ? " suda-control__fab--open" : ""}`}
        onClick={handleFabClick}
        aria-label="SUDA controls"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="suda-control__fab-icon" aria-hidden="true">
          ◈
        </span>
      </button>
    </div>
  );
}
