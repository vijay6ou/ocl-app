import {
  clearDiscordThread,
  getDiscordThread,
  getLocationDiscordThread,
  getNotifySettings,
  saveDiscordThread,
  saveLocationDiscordThread,
} from "@/lib/store";
import { promises as fs } from "fs";
import path from "path";
import type { PdfPhoto } from "@/lib/report-pdf";
import { buildRecordPdf, loadRecordPhotos, pdfFilename } from "@/lib/submission-pdf";
import {
  destOn,
  shouldNotifySubmission,
  type NotifySettings,
} from "@/lib/notify-settings";
import {
  discordThreadName,
  formatDayNotes,
  formatFaultsOnly,
  formatFullRound,
  roundHeader,
} from "@/lib/round-text";
import { sanitizePublicText } from "@/lib/public-text";
import type { Submission } from "@/lib/types";
import { sendTelegramDocument, sendTelegramText, type TelegramChannelStatus } from "@/lib/telegram";

export type NotifyChannelStatus = "ok" | "skipped" | "failed";

export type NotifyResult = {
  discord: NotifyChannelStatus;
  telegram: TelegramChannelStatus;
  warning?: string;
};

const DISCORD_FILE_LIMIT = 8 * 1024 * 1024;
const DISCORD_MAX_FILES = 10;
const DISCORD_TEXT_LIMIT = 1900;
const APP_UA = "OCLMaintenance/1.17.0";

type NotifyFile = { name: string; mime: string; bytes: Buffer };

function discordWebhook() {
  return (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function locationWebhook() {
  return (process.env.LOCATION_DISCORD_WEBHOOK_URL ?? "").trim();
}

function buildDiscordPosts(
  record: Submission,
  pdf: Buffer | null,
  photos: PdfPhoto[],
  settings: NotifySettings,
  includeDayNotes: boolean
): { kind: string; post: DiscordPost }[] {
  const full = formatFullRound(record, { includeDayNotes });
  const header = roundHeader(record);
  const items: { kind: string; post: DiscordPost }[] = [];

  if (settings.payload.fullForm) {
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
    items.push({ kind: "full-form", post: fullPost });
  }

  if (settings.payload.faultsOnly) {
    items.push({ kind: "faults", post: { content: formatFaultsOnly(record).slice(0, DISCORD_TEXT_LIMIT) } });
  }

  if (settings.payload.photos) {
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
    items.push({
      kind: "photos",
      post: {
        content:
          photoFiles.length > 0
            ? `Photos (${photoFiles.length}${photos.length > photoFiles.length ? ` of ${photos.length}` : ""})`
            : "Photos\nNo photos attached.",
        files: photoFiles,
      },
    });
  }

  if (settings.payload.pdf && pdf) {
    items.push({
      kind: "pdf",
      post: {
        content: "PDF report",
        files: [{ name: pdfFilename(record), mime: "application/pdf", bytes: pdf }],
      },
    });
  }

  return items;
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
  items: { kind: string; post: DiscordPost }[],
  threadName: string,
  threadId: string | null
): Promise<{
  status: "ok" | "failed" | "skipped";
  threadId?: string;
  parts?: { kind: string; content: string; files: string[]; messageId?: string }[];
}> {
  if (items.length === 0) return { status: "skipped" };
  let tid = threadId;
  const parts: { kind: string; content: string; files: string[]; messageId?: string }[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const create = i === 0 && !tid;
    const result = await postDiscord(items[i].post, tid, create, threadName);
    if (result.status !== "ok") return result;
    if (result.threadId) tid = result.threadId;
    parts.push({
      kind: items[i].kind,
      content: items[i].post.content.slice(0, 500),
      files: (items[i].post.files ?? []).map((f) => f.name),
      messageId: result.messageId,
    });
    if (i < items.length - 1) await sleep(400);
  }
  return { status: "ok", threadId: tid ?? undefined, parts };
}

async function sendDiscord(
  record: Submission,
  pdf: Buffer | null,
  photos: PdfPhoto[],
  settings: NotifySettings,
  failCount: number
): Promise<{ status: NotifyChannelStatus; parts?: { kind: string; content: string; files: string[]; messageId?: string }[] }> {
  const sendRound = destOn(settings, "roundSubmit", "discordReports", failCount);
  const sendNotes = destOn(settings, "dayNotes", "discordReports", failCount);
  if (!sendRound && !sendNotes) return { status: "skipped" };
  const hook = discordWebhook();
  if (!hook) return { status: "skipped" };
  const date = record.meta.date;
  const items = sendRound
    ? buildDiscordPosts(record, pdf, photos, settings, sendNotes)
    : [{ kind: "day-notes", post: { content: formatDayNotes(record).slice(0, DISCORD_TEXT_LIMIT) } }];
  if (items.length === 0) return { status: "skipped" };
  const name = discordThreadName(record);
  const existing = await getDiscordThread(date);
  const first = await sendDiscordSequence(items, name, existing?.threadId ?? null);
  if (first.status === "ok") {
    if (first.threadId) await saveDiscordThread(date, first.threadId);
    return { status: "ok", parts: first.parts };
  }
  if (first.status === "skipped") return { status: "skipped" };
  if (existing) {
    await clearDiscordThread(date);
    const retry = await sendDiscordSequence(items, name, null);
    if (retry.status === "ok") {
      if (retry.threadId) await saveDiscordThread(date, retry.threadId);
      return { status: "ok", parts: retry.parts };
    }
  }
  return { status: "failed" };
}

function warningFor(result: NotifyResult) {
  const failed = [result.discord === "failed" ? "Discord" : "", result.telegram === "failed" ? "Telegram" : ""].filter(
    Boolean
  );
  if (failed.length) {
    return sanitizePublicText(`Record saved on the plant server. ${failed.join(" and ")} delivery failed.`);
  }
  return undefined;
}

async function sendTelegram(
  record: Submission,
  settings: NotifySettings,
  failCount: number,
  pdf: Buffer | null
): Promise<TelegramChannelStatus> {
  const sendRound = destOn(settings, "roundSubmit", "telegram", failCount);
  const sendNotes = destOn(settings, "dayNotes", "telegram", failCount);
  if (!sendRound && !sendNotes) return "skipped";
  try {
    if (!sendRound) return await sendTelegramText(formatDayNotes(record).slice(0, 3900));
    const full = formatFullRound(record, { includeDayNotes: sendNotes });
    const header = sendNotes ? formatDayNotes(record) : roundHeader(record);
    let textStatus: TelegramChannelStatus = "skipped";
    if (settings.payload.fullForm) {
      textStatus =
        full.length <= 3900
          ? await sendTelegramText(full)
          : await sendTelegramText(header.slice(0, 3900), {
              name: fullFormFilename(record),
              bytes: Buffer.from(full, "utf8"),
            });
    } else if (sendNotes) {
      textStatus = await sendTelegramText(header.slice(0, 3900));
    } else {
      textStatus = await sendTelegramText(
        `${roundHeader(record)}\n\nRound saved on the plant server.`.slice(0, 3900)
      );
    }
    if (textStatus === "failed") return "failed";
    const pdfBytes = pdf ?? (await buildRecordPdf(record)).bytes;
    const doc = await sendTelegramDocument({
      name: pdfFilename(record),
      bytes: pdfBytes,
      mime: "application/pdf",
      caption: `${roundHeader(record)}\n\nFull round PDF (same file as Discord / Share).`.slice(0, 1024),
    });
    if (doc.status === "failed") return "failed";
    if (doc.status === "skipped" && textStatus === "skipped") return "skipped";
    return doc.status === "ok" || textStatus === "ok" ? "ok" : doc.status;
  } catch {
    return "failed";
  }
}

async function sendSubmitToLocationChannel(
  record: Submission,
  settings: NotifySettings,
  failCount: number
): Promise<NotifyChannelStatus> {
  const sendRound = destOn(settings, "roundSubmit", "discordLocation", failCount);
  const sendNotes = destOn(settings, "dayNotes", "discordLocation", failCount);
  if (!sendRound && !sendNotes) return "skipped";
  const hook = locationWebhook();
  if (!hook) return "skipped";
  const content = (
    sendRound
      ? `${roundHeader(record)}\n\nRound saved on the plant server.${
          sendNotes ? `\n\nDay notes\n${record.dayNotes?.trim() || "(none)"}` : ""
        }`
      : formatDayNotes(record)
  ).slice(0, DISCORD_TEXT_LIMIT);
  const date = record.meta.date;
  const existing = await getLocationDiscordThread(date);
  const form = new FormData();
  const payload: Record<string, unknown> = {
    username: "Adani Cements location",
    content,
  };
  if (!existing?.threadId) payload.thread_name = `Location · ${date}`;
  form.append("payload_json", JSON.stringify(payload));
  const url = new URL(hook);
  url.searchParams.set("wait", "true");
  if (existing?.threadId) url.searchParams.set("thread_id", existing.threadId);
  const res = await fetch(url.toString(), {
    method: "POST",
    body: form,
    headers: { "User-Agent": APP_UA },
  });
  if (!res.ok) return "failed";
  try {
    const msg = JSON.parse(await res.text()) as { channel_id?: string };
    if (msg.channel_id) await saveLocationDiscordThread(date, String(msg.channel_id));
  } catch {
    /* thread id optional */
  }
  return "ok";
}

export async function notifySubmission(record: Submission): Promise<NotifyResult> {
  const settings = await getNotifySettings();
  const result: NotifyResult = { discord: "skipped", telegram: "skipped" };
  let discordParts: { kind: string; content: string; files: string[]; messageId?: string }[] | undefined;
  const failCount = record.fails.length;
  if (!shouldNotifySubmission(settings, failCount)) {
    result.warning = warningFor(result);
    return result;
  }
  const wantReports =
    destOn(settings, "roundSubmit", "discordReports", failCount) ||
    destOn(settings, "dayNotes", "discordReports", failCount);
  const wantTelegram =
    destOn(settings, "roundSubmit", "telegram", failCount) ||
    destOn(settings, "dayNotes", "telegram", failCount);
  try {
    const sendRoundReports = destOn(settings, "roundSubmit", "discordReports", failCount);
    const sendRoundTelegram = destOn(settings, "roundSubmit", "telegram", failCount);
    const photos =
      sendRoundReports && settings.payload.photos ? await loadRecordPhotos(record) : [];
    const pdf =
      (settings.payload.pdf && sendRoundReports) || sendRoundTelegram
        ? (await buildRecordPdf(record)).bytes
        : null;
    try {
      const disc = await sendDiscord(record, pdf, photos, settings, failCount);
      result.discord = disc.status;
      discordParts = disc.parts;
    } catch {
      result.discord = wantReports && discordWebhook() ? "failed" : "skipped";
    }
    try {
      await sendSubmitToLocationChannel(record, settings, failCount);
    } catch {
      /* location-channel submit is extra; reports/Telegram status stay authoritative */
    }
    try {
      result.telegram = await sendTelegram(record, settings, failCount, pdf);
    } catch {
      result.telegram = wantTelegram ? "failed" : "skipped";
    }
  } catch {
    result.discord = wantReports && discordWebhook() ? "failed" : "skipped";
    result.telegram = wantTelegram ? "failed" : "skipped";
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
          telegram: result.telegram,
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

export async function sendAdminNotifyTest(
  dest: "discord" | "telegram" | "location"
): Promise<{ status: NotifyChannelStatus; detail: string }> {
  if (dest === "telegram") {
    const result = await sendTelegramText(
      "Plant log test: Notifications control. Real events follow the routing matrix on this page."
    );
    const detail =
      result === "ok"
        ? "Test sent to the linked Telegram chat."
        : result === "skipped"
          ? "Telegram is not linked yet. Add @Office3331bot to the group (or send it a DM), then Check for a DM."
          : "Telegram test failed.";
    return { status: result, detail };
  }
  if (dest === "location") {
    const hook = (process.env.LOCATION_DISCORD_WEBHOOK_URL ?? "").trim();
    if (!hook) return { status: "skipped", detail: "Location channel is not configured on the plant server." };
    const today = new Date().toISOString().slice(0, 10);
    const existing = await getLocationDiscordThread(today);
    const form = new FormData();
    const payload: Record<string, unknown> = {
      username: "Adani Cements location",
      content: "Notifications control: location-channel test. No coordinates attached.",
    };
    if (!existing?.threadId) payload.thread_name = `Location · ${today}`;
    form.append("payload_json", JSON.stringify(payload));
    const url = new URL(hook);
    url.searchParams.set("wait", "true");
    if (existing?.threadId) url.searchParams.set("thread_id", existing.threadId);
    const res = await fetch(url.toString(), {
      method: "POST",
      body: form,
      headers: { "User-Agent": APP_UA },
    });
    if (!res.ok) return { status: "failed", detail: "Location channel test failed." };
    try {
      const msg = JSON.parse(await res.text()) as { channel_id?: string };
      if (msg.channel_id) await saveLocationDiscordThread(today, String(msg.channel_id));
    } catch {
      /* thread id optional */
    }
    return { status: "ok", detail: "Test sent to the location channel." };
  }
  const hook = discordWebhook();
  if (!hook) return { status: "skipped", detail: "Reports channel is not configured on the plant server." };
  const today = new Date().toISOString().slice(0, 10);
  const existing = await getDiscordThread(today);
  const form = new FormData();
  const payload: Record<string, unknown> = {
    username: "Adani Cements PM",
    content: "Notifications control: reports-channel test. A real submit still uses the ticks on this page.",
  };
  if (!existing?.threadId) payload.thread_name = `${today} · Adani Cements electrical PM`;
  form.append("payload_json", JSON.stringify(payload));
  const url = new URL(hook);
  url.searchParams.set("wait", "true");
  if (existing?.threadId) url.searchParams.set("thread_id", existing.threadId);
  const res = await fetch(url.toString(), {
    method: "POST",
    body: form,
    headers: { "User-Agent": APP_UA },
  });
  if (!res.ok) return { status: "failed", detail: "Reports channel test failed." };
  try {
    const msg = JSON.parse(await res.text()) as { channel_id?: string };
    if (msg.channel_id) await saveDiscordThread(today, String(msg.channel_id));
  } catch {
    /* thread id optional */
  }
  return { status: "ok", detail: "Test sent to the reports channel." };
}
