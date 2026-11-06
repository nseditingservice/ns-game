import type { Data } from "./types";

/** Download a full JSON backup of everything. */
export function downloadBackup(data: Data, name?: string) {
  const blob = new Blob([JSON.stringify({ app: "ns-game", version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name ?? `ns-game-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
