/** Brand-neutral presentational helpers shared by consumers. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export type DocumentStatusName = "active" | "archived";
export function documentStatusLabel(status: DocumentStatusName): string {
  return status === "archived" ? "Archived" : "Active";
}

export type UploadStageName =
  | "preparing"
  | "uploading"
  | "scanning"
  | "accepted"
  | "rejected"
  | "failed";
export function uploadStageLabel(stage: UploadStageName): string {
  const labels: Record<UploadStageName, string> = {
    preparing: "Preparing",
    uploading: "Uploading",
    scanning: "Scanning",
    accepted: "Accepted",
    rejected: "Rejected",
    failed: "Failed",
  };
  return labels[stage];
}
