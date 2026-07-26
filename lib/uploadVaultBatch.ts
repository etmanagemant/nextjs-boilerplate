// Shared by Upload Vault (chatter/admin) and the model role's own upload
// flow - both send local files to a model's "Vault-Fan" the same way, so
// the batching logic lives here once instead of twice.
//
// OnlyFans has no direct bulk-upload-to-vault feature in use here - the
// workaround is sending files as one priced message to a dedicated
// "Vault-Fan", which OnlyFans then archives into the real Vault. Per the
// user's explicit ask: more than one file always goes out as ONE shared
// message (batched in groups of up to BATCH_SIZE), never one message per
// file - a batch of exactly 1 file collapses to the same single-message
// behavior on its own, no special case needed.
export const BATCH_SIZE = 20;

export type UploadItemStatus = "pending" | "uploading" | "staged" | "success" | "error";

export interface UploadTarget {
  modelId: string;
  vaultFanId?: string;
  vaultFanLabel?: string;
  price: number;
}

export interface BatchFile {
  id: string;
  file: File;
}

/**
 * Sends one batch (<=BATCH_SIZE files) as a single OnlyFans message.
 * Every file in the batch is staged (uploaded to the VPS, no OnlyFans
 * interaction yet) except the last, which also triggers the actual
 * attach+price+send automation for the whole batch - see the VPS route's
 * own comment for why the protocol is shaped this way.
 *
 * CRITICAL: onItemUpdate only ever reports "success" for files once the
 * VPS has verified the send actually completed, never just because a
 * request returned without a network error - the user was explicit that
 * nobody should see "done" and close the tab before it's actually
 * confirmed sent.
 */
async function sendOneBatch(
  batch: BatchFile[],
  target: UploadTarget,
  onItemUpdate: (id: string, status: UploadItemStatus, error?: string) => void
): Promise<boolean> {
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let allStaged = true;

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const isLast = i === batch.length - 1;
    onItemUpdate(item.id, "uploading");

    try {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("modelId", target.modelId);
      if (target.vaultFanId) formData.append("vaultFanId", target.vaultFanId);
      if (target.vaultFanLabel) formData.append("vaultFanLabel", target.vaultFanLabel);
      formData.append("price", String(target.price));
      formData.append("batchId", batchId);
      formData.append("isLastInBatch", isLast ? "true" : "false");

      const res = await fetch("/api/crm/upload-to-vault-fan", { method: "POST", body: formData });
      const data = await res.json();

      if (!isLast) {
        if (data.status === "staged") {
          onItemUpdate(item.id, "staged");
        } else {
          allStaged = false;
          onItemUpdate(item.id, "error", data.message || data.error || "Fehler beim Hochladen");
        }
        continue;
      }

      // Last file in the batch: its response reflects the WHOLE batch's
      // send, not just this one file's upload - only mark every
      // successfully-staged file in the batch as sent once this confirms.
      if (data.status === "success" && allStaged) {
        batch.forEach((b) => onItemUpdate(b.id, "success"));
        return true;
      } else {
        const message = data.message || data.error || "Senden konnte nicht bestätigt werden";
        batch.forEach((b) => onItemUpdate(b.id, "error", message));
        return false;
      }
    } catch (err) {
      allStaged = false;
      onItemUpdate(item.id, "error", "Netzwerkfehler");
      if (isLast) {
        batch.forEach((b) => onItemUpdate(b.id, "error", "Netzwerkfehler"));
        return false;
      }
    }
  }
  return false;
}

/**
 * Splits the full queue into batches of BATCH_SIZE and sends them one
 * after another (not in parallel - keeps this predictable and easy to
 * reason about, and there's only ever one live OnlyFans session per model
 * to run it against anyway). Returns true only if every single file
 * across every batch was confirmed sent.
 */
export async function sendFilesInBatches(
  files: BatchFile[],
  target: UploadTarget,
  onItemUpdate: (id: string, status: UploadItemStatus, error?: string) => void
): Promise<boolean> {
  let allOk = true;
  for (let start = 0; start < files.length; start += BATCH_SIZE) {
    const batch = files.slice(start, start + BATCH_SIZE);
    const ok = await sendOneBatch(batch, target, onItemUpdate);
    if (!ok) allOk = false;
  }
  return allOk;
}
