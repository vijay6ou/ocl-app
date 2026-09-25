import {
  clearDiscordThread,
  getDiscordThread,
  getPhoto,
  saveDiscordThread,
} from "@/lib/store";
import { promises as fs } from "fs";
import path from "path";
import { buildSubmissionPdf, type PdfPhoto } from "@/lib/report-pdf";
import { workingSectionLabel } from "@/lib/working-section";
import {
  discordThreadName,
  formatFaultsOnly,
  formatFullRound,
  roundHeader,
} from "@/lib/round-text";
import { sanitizePublicText } from "@/lib/public-text";
import { bakeUprightImage } from "@/lib/image-orient";
import type { PhotoRef, Submission } from "@/lib/types";

export type NotifyChannelStatus = "ok" | "skipped" | "failed";

export type NotifyResult = {
  discord: NotifyChannelStatus;
  warning?: string;
};

const DISCORD_FILE_LIMIT = 8 * 1024 * 1024;
const DISCORD_MAX_FILES = 10;
const DISCORD_TEXT_LIMIT = 1900;
const APP_UA = "OCLMaintenance/1.10.0";

type NotifyFile = { name: string; mime: string; bytes: Buffer };

function discordWebhook() {
  return (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectPhotoRefs(record: Submission): PhotoRef[] {
  const refs: PhotoRef[] = [];
  if (record.selfie) refs.push(record.selfie);
  for (const st of Object.values(record.equip)) {
    for (const p of st.photos ?? []) refs.push(p);
  }
  for (const st of Object.values(record.common)) {
    for (const p of st.photos ?? []) refs.push(p);
  }
  const seen = new Set<string>();
  return refs.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

async function loadPhotos(record: Submission): Promise<PdfPhoto[]> {
  const loaded: PdfPhoto[] = [];
  for (const ref of collectPhotoRefs(record)) {
    try {
      const photo = await getPhoto(ref.id);
      if (photo) {
        const upright = bakeUprightImage(photo.bytes, photo.meta.mime);
        loaded.push({ meta: { ...photo.meta, mime: upright.mime, size: upright.bytes.length }, bytes: upright.bytes });
      }
    } catch {
      /* missing photo must not block notify */
    }
  }
  return loaded;
}

function pdfFilename(record: Submission) {
  const section = workingSectionLabel(record.meta)
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
  return `Adani-Cements-${record.meta.date}-${section || record.meta.day}.pdf`;
}

function fullFormFilename(record: Submission) {
  return `Adani-Cements-${record.meta.date}-full-form.txt`;
}

function appendFiles(form: FormData, files: NotifyFile[]) {
  files.forEach((file, i) => {
    form.append(
      `files[${i}]`,
      new Blob([new Uint8Array(file.bytes)], { type: file.mime }),
      file.name
    );
  });
}

type DiscordPost = {
  content: string;
  files?: NotifyFile[];
};

function buildDiscordPosts(record: Submission, pdf: Buffer, photos: PdfPhoto[]): DiscordPost[] {
  const full = formatFullRound(record);
  const header = roundHeader(record);
  const fullPost: DiscordPost =
    full.length <= DISCORD_TEXT_LIMIT
      ? { content: full }
      : {
          content: `${header}\n\nFull round attached (same layout as the in-app record).`.slice(
            0,
            DISCORD_TEXT_LIMIT
          ),
          files: [
            {
              name: fullFormFilename(record),
              mime: "text/plain; charset=utf-8",
              bytes: Buffer.from(full, "utf8"),
            },
          ],
        };

  const photoFiles: NotifyFile[] = [];
  for (const photo of photos) {
    if (photoFiles.length >= DISCORD_MAX_FILES) break;
    if (photo.bytes.length > DISCORD_FILE_LIMIT) continue;
    photoFiles.push({
      name: photo.meta.filename || `photo-${photo.meta.id}.jpg`,
      mime: photo.meta.mime || "image/jpeg",
      bytes: photo.bytes,
    });
  }

  return [
    fullPost,
    { content: formatFaultsOnly(record).slice(0, DISCORD_TEXT_LIMIT) },
    {
      content:
        photoFiles.length > 0
          ? `Photos (${photoFiles.length}${photos.length > photoFiles.length ? ` of ${photos.length}` : ""})`
          : "Photos\nNo photos attached.",
      files: photoFiles,
    },
    {
      content: "PDF report",
      files: [{ name: pdfFilename(record), mime: "application/pdf", bytes: pdf }],
    },
  ];
}

async function postDiscord(
  post: DiscordPost,
  threadId: string | null,
  createThread: boolean,
  threadName: string
): Promise<{
  status: "ok" | "failed" | "skipped";
  threadId?: string;
  messageId?: string;
  http?: number;
  detail?: string;
}> {
  const hook = discordWebhook();
  if (!hook) return { status: "skipped" };
  const form = new FormData();
  const payload: Record<string, unknown> = {
    username: "Adani Cements PM",
    content: post.content.slice(0, 2000),
  };
  if (createThread && !threadId) payload.thread_name = threadName;
  form.append("payload_json", JSON.stringify(payload));
  if (post.files?.length) appendFiles(form, post.files);
  const url = new URL(hook);
  url.searchParams.set("wait", "true");
  if (threadId) url.searchParams.set("thread_id", threadId);
  const res = await fetch(url.toString(), {
    method: "POST",
    body: form,
    headers: { "User-Agent": APP_UA },
  });
  const raw = await res.text();
  if (!res.ok) {
    let detail = `Discord HTTP ${res.status}`;
    try {
      const body = JSON.parse(raw) as { message?: string; code?: number };
      if (body.message) detail = `Discord HTTP ${res.status}: ${sanitizePublicText(body.message)}`;
    } catch {
      detail = `Discord HTTP ${res.status}`;
    }
    return { status: "failed", http: res.status, detail };
  }
  let msg: { channel_id?: string; id?: string } = {};
  try {
    msg = JSON.parse(raw) as { channel_id?: string; id?: string };
  } catch {
    msg = {};
  }
  return {
    status: "ok",
    threadId: String(msg.channel_id ?? threadId ?? ""),
    messageId: msg.id,
  };
}

async function sendDiscordSequence(
  posts: DiscordPost[],
  threadName: string,
  threadId: string | null
): Promise<{
  status: "ok" | "failed" | "skipped";
  threadId?: string;
  parts?: { kind: string; content: string; files: string[]; messageId?: string }[];
}> {
  let tid = threadId;
  const kinds = ["full-form", "faults", "photos", "pdf"];
  const parts: { kind: string; content: string; files: string[]; messageId?: string }[] = [];
  for (let i = 0; i < posts.length; i += 1) {
    const create = i === 0 && !tid;
    const result = await postDiscord(posts[i], tid, create, threadName);
    if (result.status !== "ok") return result;
    if (result.threadId) tid = result.threadId;
    parts.push({
      kind: kinds[i] ?? `part-${i + 1}`,
      content: posts[i].content.slice(0, 500),
      files: (posts[i].files ?? []).map((f) => f.name),
      messageId: result.messageId,
    });
    if (i < posts.length - 1) await sleep(400);
  }
  return { status: "ok", threadId: tid ?? undefined, parts };
}

async function sendDiscord(
  record: Submission,
  pdf: Buffer,
  photos: PdfPhoto[]
): Promise<{ status: NotifyChannelStatus; parts?: { kind: string; content: string; files: string[]; messageId?: string }[] }> {
  const hook = discordWebhook();
  if (!hook) return { status: "skipped" };
  const date = record.meta.date;
  const posts = buildDiscordPosts(record, pdf, photos);
  const name = discordThreadName(record);
  const existing = await getDiscordThread(date);
  const first = await sendDiscordSequence(posts, name, existing?.threadId ?? null);
  if (first.status === "ok") {
    if (first.threadId) await saveDiscordThread(date, first.threadId);
    return { status: "ok", parts: first.parts };
  }
  if (existing) {
    await clearDiscordThread(date);
    const retry = await sendDiscordSequence(posts, name, null);
    if (retry.status === "ok") {
      if (retry.threadId) await saveDiscordThread(date, retry.threadId);
      return { status: "ok", parts: retry.parts };
    }
  }
  return { status: first.status === "skipped" ? "skipped" : "failed" };
}

function warningFor(result: NotifyResult) {
  if (result.discord === "failed") {
    return sanitizePublicText("Record saved on the plant server. Discord delivery failed.");
  }
  return undefined;
}

export async function notifySubmission(record: Submission): Promise<NotifyResult> {
  const result: NotifyResult = { discord: "skipped" };
  let discordParts: { kind: string; content: string; files: string[]; messageId?: string }[] | undefined;
  try {
    const photos = await loadPhotos(record);
    const pdf = await buildSubmissionPdf(record, photos);
    try {
      const disc = await sendDiscord(record, pdf, photos);
      result.discord = disc.status;
      discordParts = disc.parts;
    } catch {
      result.discord = discordWebhook() ? "failed" : "skipped";
    }
  } catch {
    result.discord = discordWebhook() ? "failed" : "skipped";
  }
  result.warning = warningFor(result);
  try {
    await fs.writeFile(
      path.join(process.cwd(), "data", "notify-last.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          recordId: record.id,
          date: record.meta.date,
          discord: result.discord,
          warning: result.warning,
          discordParts: discordParts ?? [],
        },
        null,
        2
      )
    );
  } catch {
    /* receipt is diagnostics only */
  }
  return result;
}
