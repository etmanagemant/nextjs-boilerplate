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
  // Only set by Upload Vault (a real logged-in chatter/admin) - never by
  // the model workspace's own upload, per the user's explicit ask that a
  // model's own uploads never get a "gesendet von" label. Its presence is
  // what the VPS route uses to decide whether to log attribution at all.
  chatterName?: string;
}

export interface BatchFile {
  id: string;
  file: File;
}

// Uploads go straight to the VPS now (see /public-upload-to-vault-fan),
// not through this app's own serverless function - Vercel's fixed 4.5MB
// request body cap (confirmed against Vercel's own docs, not configurable)
// no longer applies at all, so the chunking this used to need here is
// gone. Confirmed live that routing every file byte through Vercel twice
// (client->Vercel->VPS) was both slow and burning through Vercel's own
// bandwidth allowance for no benefit once a direct path exists.
async function getUploadToken(modelId: string): Promise<{ token: string; uploadUrl: string }> {
  const res = await fetch("/api/crm/upload-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
  });
  const data = await res.json();
  if (data.status !== "success" || !data.token || !data.uploadUrl) {
    throw new Error(data.error || "Konnte keinen Upload-Zugang bekommen");
  }
  return { token: data.token, uploadUrl: data.uploadUrl };
}

// fetch() has no reliable cross-browser way to observe upload progress
// (its ReadableStream body support covers downloads, not uploads) -
// XMLHttpRequest's upload.onprogress is the only thing that gives real,
// incremental bytes-sent numbers, which is what actually lets the queue
// show a genuine percentage instead of jumping straight from 0 to 100.
function postFileDirectXHR(
  uploadUrl: string,
  file: File,
  onUploadProgress?: (loaded: number, total: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    if (onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onUploadProgress(e.loaded, e.total);
      };
    }
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error("Ungültige Server-Antwort"));
      }
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler"));
    xhr.send(file);
  });
}

/**
 * Sends one file's raw bytes directly to the VPS, authorized by a fresh
 * short-lived token scoped to this exact modelId (see getUploadToken) -
 * the VPS never sees this app's own shared secret, only a token it can
 * verify and that expires on its own. onProgress reports a real 0-100 for
 * this file, driven by the browser's own upload progress event.
 */
async function postFile(file: File, fields: Record<string, string>, onProgress?: (percent: number) => void): Promise<any> {
  const { token, uploadUrl } = await getUploadToken(fields.modelId);
  const params = new URLSearchParams({ ...fields, fileName: file.name, token });
  return postFileDirectXHR(`${uploadUrl}?${params.toString()}`, file, (loaded, total) =>
    onProgress?.(Math.round((loaded / total) * 100))
  );
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
  onItemUpdate: (id: string, status: UploadItemStatus, error?: string) => void,
  onItemProgress?: (id: string, percent: number) => void
): Promise<boolean> {
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Files that the VPS actually confirmed it received a path for - the
  // final commit's "success" only ever covers THESE, never the full
  // original batch. Confirmed live: a single file failing to stage (a
  // real "Netzwerkfehler" on a phone) still let the last file's commit
  // go through and send the OTHER files fine (server log showed
  // status:success, sentCount matching the staged-ok count) - but this
  // used to be masked by a since-removed "allStaged" flag that marked
  // the WHOLE batch, including the genuinely-sent files, as failed just
  // because one earlier file didn't make it. Tracking staged-ok files
  // individually instead means a partial failure reports honestly (some
  // green, one red) instead of turning a real success into a false
  // "Senden konnte nicht bestätigt werden" for everything.
  const stagedOk: BatchFile[] = [];

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const isLast = i === batch.length - 1;
    onItemUpdate(item.id, "uploading");

    try {
      const fields: Record<string, string> = {
        modelId: target.modelId,
        price: String(target.price),
        batchId,
        isLastInBatch: isLast ? "true" : "false",
      };
      if (target.vaultFanId) fields.vaultFanId = target.vaultFanId;
      if (target.vaultFanLabel) fields.vaultFanLabel = target.vaultFanLabel;
      if (target.chatterName) fields.chatterName = target.chatterName;

      const data = await postFile(item.file, fields, (percent) => onItemProgress?.(item.id, percent));

      if (!isLast) {
        if (data.status === "staged") {
          stagedOk.push(item);
          onItemUpdate(item.id, "staged");
        } else {
          onItemUpdate(item.id, "error", data.message || data.error || "Fehler beim Hochladen");
        }
        continue;
      }

      // Last file's response reflects the send of every file the VPS
      // actually staged (stagedOk + this one) - a file that failed to
      // stage above was never part of what got sent and keeps its own
      // "Fehler beim Hochladen", it doesn't drag the rest down with it.
      if (data.status === "success") {
        stagedOk.push(item);
        stagedOk.forEach((b) => onItemUpdate(b.id, "success"));
        return stagedOk.length === batch.length;
      } else {
        const message = data.message || data.error || "Senden konnte nicht bestätigt werden";
        stagedOk.forEach((b) => onItemUpdate(b.id, "error", message));
        onItemUpdate(item.id, "error", message);
        return false;
      }
    } catch (err) {
      if (isLast) {
        stagedOk.forEach((b) => onItemUpdate(b.id, "error", "Netzwerkfehler"));
        onItemUpdate(item.id, "error", "Netzwerkfehler");
      } else {
        onItemUpdate(item.id, "error", "Netzwerkfehler");
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
  onItemUpdate: (id: string, status: UploadItemStatus, error?: string) => void,
  onItemProgress?: (id: string, percent: number) => void
): Promise<boolean> {
  let allOk = true;
  for (let start = 0; start < files.length; start += BATCH_SIZE) {
    const batch = files.slice(start, start + BATCH_SIZE);
    const ok = await sendOneBatch(batch, target, onItemUpdate, onItemProgress);
    if (!ok) allOk = false;
  }
  return allOk;
}
