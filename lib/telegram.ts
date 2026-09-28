import { promises as fs } from "fs";
import path from "path";
import { sanitizePublicText } from "@/lib/public-text";

export type TelegramChannelStatus = "ok" | "skipped" | "failed";

export type TelegramPublicStatus = {
  configured: boolean;
  linked: boolean;
  botUsername: string;
  lastError?: string;
  lastDiscoverAt?: string;
  lastSentAt?: string;
};

type TelegramState = {
  chatId: string;
  botUsername: string;
  savedAt: string;
  lastError: string;
  lastDiscoverAt: string;
  lastUpdatesCount: number;
  lastSentAt?: string;
};

const STATE_FILE = path.join(process.cwd(), "data", "telegram.json");
const BOT_USERNAME = "Office3331bot";
const APP_UA = "OCLMaintenance/1.16.0";

function botToken() {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

function envChatId() {
  return (process.env.TELEGRAM_CHAT_ID ?? "").trim();
}

async function readState(): Promise<TelegramState> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const data = JSON.parse(raw) as Partial<TelegramState>;
    return {
      chatId: String(data.chatId ?? "").trim(),
      botUsername: String(data.botUsername ?? BOT_USERNAME).trim() || BOT_USERNAME,
      savedAt: String(data.savedAt ?? ""),
      lastError: String(data.lastError ?? ""),
      lastDiscoverAt: String(data.lastDiscoverAt ?? ""),
      lastUpdatesCount: Number(data.lastUpdatesCount ?? 0) || 0,
      lastSentAt: data.lastSentAt ? String(data.lastSentAt) : undefined,
    };
  } catch {
    return {
      chatId: "",
      botUsername: BOT_USERNAME,
      savedAt: "",
      lastError: "",
      lastDiscoverAt: "",
      lastUpdatesCount: 0,
    };
  }
}

async function writeState(state: TelegramState) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, STATE_FILE);
}

async function telegramApi(method: string, payload?: Record<string, unknown>) {
  const token = botToken();
  if (!token) {
    return { ok: false as const, status: 0, body: { ok: false, description: "Bot token is not configured." } };
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": APP_UA,
    },
    body: payload ? JSON.stringify(payload) : "{}",
  });
  let body: { ok?: boolean; description?: string; result?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = { ok: false, description: `Telegram HTTP ${res.status}` };
  }
  return { ok: Boolean(body.ok), status: res.status, body };
}

function publicError(detail: string) {
  return sanitizePublicText(detail, "Telegram delivery failed.");
}

export async function telegramPublicStatus(): Promise<TelegramPublicStatus> {
  const state = await readState();
  const me = botToken() ? await telegramApi("getMe") : null;
  const username =
    me?.ok && me.body.result && typeof me.body.result === "object"
      ? String((me.body.result as { username?: string }).username ?? state.botUsername)
      : state.botUsername || BOT_USERNAME;
  const linked = Boolean(envChatId() || state.chatId);
  let lastError = state.lastError;
  if (botToken() && me && !me.ok) {
    lastError = publicError(String(me.body.description || "getMe failed"));
  }
  return {
    configured: Boolean(botToken()),
    linked,
    botUsername: username || BOT_USERNAME,
    lastError: lastError || undefined,
    lastDiscoverAt: state.lastDiscoverAt || undefined,
    lastSentAt: state.lastSentAt || undefined,
  };
}

export async function discoverTelegramChat(): Promise<{ chatId: string; username: string } | null> {
  const state = await readState();
  const existing = envChatId() || state.chatId;
  const now = new Date().toISOString();
  if (!botToken()) {
    await writeState({
      ...state,
      lastError: "Bot token is not configured on the plant server.",
      lastDiscoverAt: now,
    });
    return null;
  }
  const me = await telegramApi("getMe");
  const username =
    me.ok && me.body.result && typeof me.body.result === "object"
      ? String((me.body.result as { username?: string }).username ?? BOT_USERNAME)
      : BOT_USERNAME;
  if (existing) {
    await writeState({
      ...state,
      chatId: existing,
      botUsername: username,
      savedAt: state.savedAt || now,
      lastError: "",
      lastDiscoverAt: now,
    });
    return { chatId: existing, username };
  }

  const updates = await telegramApi("getUpdates", {
    timeout: 0,
    limit: 100,
    allowed_updates: ["message"],
  });
  const rows = updates.ok && Array.isArray(updates.body.result) ? (updates.body.result as Array<{
    message?: { chat?: { id?: number; type?: string }; text?: string };
  }>) : [];
  let chatId = "";
  for (const row of rows) {
    const chat = row.message?.chat;
    if (chat?.type === "private" && chat.id != null) {
      chatId = String(chat.id);
      break;
    }
  }
  if (!chatId) {
    for (const row of rows) {
      const chat = row.message?.chat;
      if (chat?.id != null) {
        chatId = String(chat.id);
        break;
      }
    }
  }
  if (!chatId) {
    await writeState({
      ...state,
      botUsername: username,
      lastDiscoverAt: now,
      lastUpdatesCount: rows.length,
      lastError: updates.ok
        ? "Waiting for a private message to @Office3331bot."
        : publicError(String(updates.body.description || "getUpdates failed")),
    });
    return null;
  }
  await writeState({
    ...state,
    chatId,
    botUsername: username,
    savedAt: now,
    lastDiscoverAt: now,
    lastUpdatesCount: rows.length,
    lastError: "",
  });
  return { chatId, username };
}

export async function sendTelegramText(text: string, file?: { name: string; bytes: Buffer }): Promise<TelegramChannelStatus> {
  if (!botToken()) return "skipped";
  const found = await discoverTelegramChat();
  if (!found) return botToken() ? "failed" : "skipped";
  const chunks = splitTelegram(text);
  for (const chunk of chunks) {
    const sent = await telegramApi("sendMessage", {
      chat_id: found.chatId,
      text: chunk,
    });
    if (!sent.ok) {
      const state = await readState();
      await writeState({
        ...state,
        lastError: publicError(String(sent.body.description || "sendMessage failed")),
      });
      return "failed";
    }
  }
  if (file) {
    const token = botToken();
    const form = new FormData();
    form.append("chat_id", found.chatId);
    form.append(
      "document",
      new Blob([new Uint8Array(file.bytes)], { type: "text/plain; charset=utf-8" }),
      file.name
    );
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      headers: { "User-Agent": APP_UA },
    });
    if (!res.ok) {
      const state = await readState();
      await writeState({
        ...state,
        lastError: publicError(`Telegram file HTTP ${res.status}`),
      });
      return "failed";
    }
  }
  const state = await readState();
  const now = new Date().toISOString();
  await writeState({
    ...state,
    lastError: "",
    lastSentAt: now,
  });
  return "ok";
}

function splitTelegram(text: string) {
  const limit = 3900;
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < 200) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}
