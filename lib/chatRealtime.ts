/**
 * Patient ↔ clinic realtime — Socket.IO with polling → websocket upgrade when available.
 * Room `chat:{threadId}`. `join_chat` is emitted only from `socket.on("connect")` (reconnect reuses same handler).
 */
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./api";

export const THREAD_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalized HTTPS (or HTTP) origin — same host as REST, no trailing slash */
function socketConnectionUrl(): string {
  try {
    const trimmed = String(API_BASE ?? "").trim().replace(/\/+$/, "");
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return "";
    return trimmed;
  } catch {
    return "";
  }
}

function socketConnectErrorDescription(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const o = err as Record<string, unknown>;
  if (typeof o.description === "string") return o.description;
  const ctx = o.context;
  if (ctx && typeof ctx === "object" && typeof (ctx as Record<string, unknown>).description === "string") {
    return String((ctx as { description?: string }).description);
  }
  return "";
}

/**
 * Resolve when the Socket.IO transport is connected (TCP + Engine open).
 * Use before firing HTTP sends so `new_message` can arrive on this tab without racing reconnect.
 */
export function waitOnceSocketConnected(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once("connect", () => resolve());
  });
}

/** Resolves when Engine.IO handshake done (`socket.connected === true`), with timeout. */
export function waitUntilSocketConnected(socket: Socket, timeoutMs = 25000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off("connect", ok);
      socket.off("connect_error", bad);
      socket.off("error", bad);
      reject(new Error("[chat-realtime] waitUntilSocketConnected timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(t);
      socket.off("connect", ok);
      socket.off("connect_error", bad);
      socket.off("error", bad);
    };
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = (e: unknown) => {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    socket.once("connect", ok);
    socket.once("connect_error", bad);
    socket.once("error", bad);
  });
}

export type ChatRealtimeOptions = {
  token: string;
  threadId: string;
  onNewMessage: (legacy: Record<string, unknown>) => void;
  /** After server `join_chat` ack — socket is in-room */
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export type ChatRealtimeSubscription = {
  unsubscribe: () => void;
  socket: Socket | null;
};

/**
 * Single subscription: connect → join only here; `new_message` logs RECEIVE TIME for latency vs server EMIT TIME.
 * Returns live `socket` so callers can `waitOnceSocketConnected(socket)` before sending.
 */
export function subscribePrimaryChatRealtime(opts: ChatRealtimeOptions): ChatRealtimeSubscription {
  const noop = (): void => {};

  const token = String(opts.token || "").trim();
  const threadIdFixed = String(opts.threadId || "").trim();

  console.log("REALTIME INIT:", {
    threadId: threadIdFixed,
    token: !!token,
  });

  const socketOrigin = socketConnectionUrl();

  console.log("SOCKET TARGET:", API_BASE);

  if (!THREAD_ID_UUID_RE.test(threadIdFixed)) {
    console.log("NO THREAD ID — SKIPPING SOCKET");
    return { unsubscribe: noop, socket: null };
  }

  if (!socketOrigin || !token) {
    console.log(
      "[chat-realtime] SKIP SOCKET — missing:",
      [!socketOrigin && "socketOrigin", !token && "token"].filter(Boolean).join(", ") || "unknown",
    );
    return { unsubscribe: noop, socket: null };
  }

  console.log("[chat-realtime] io()", {
    url: socketOrigin,
    path: "/socket.io/",
    transports: ["polling", "websocket"],
    forceNew: true,
  });

  const socket = io(socketOrigin, {
    path: "/socket.io/",
    transports: ["polling", "websocket"],
    forceNew: true,
    auth: { token },
    timeout: 15_000,
    reconnection: true,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 1000,
  });

  socket.on("disconnect", (reason: string) => {
    console.log("[chat-realtime] SOCKET DISCONNECTED", Date.now(), reason);
    opts.onDisconnect?.();
  });

    socket.on("connect", () => {
    const threadId = threadIdFixed;
    console.log("SOCKET CONNECTED");
    console.log("SOCKET CONNECTED", socket.id);
    console.log("JOIN_CHAT SENT", threadId);
    console.log(
      "[DOCTOR_CHAT_JOIN]",
      JSON.stringify({
        phase: "client_emit",
        thread_id: threadId.slice(0, 8),
        room_id: `chat:${threadId}`,
        socket_id: socket.id,
      }),
    );
    const connectAt = Date.now();
    socket.emit("join_chat", { threadId }, (resp: unknown) => {
      const ackAt = Date.now();
      const ackObj =
        resp && typeof resp === "object" ? (resp as Record<string, unknown>) : {};
      const joined = ackObj.ok === true || ackObj.joined === true;
      console.log(
        "[DOCTOR_CHAT_JOIN]",
        JSON.stringify({
          phase: "client_ack",
          thread_id: threadId.slice(0, 8),
          room_id: `chat:${threadId}`,
          join_success: joined,
          ms_since_connect: ackAt - connectAt,
          ack: resp,
        }),
      );
      console.log(
        "[chat-realtime] JOIN_CHAT ack",
        ackAt,
        "ms_since_connect",
        ackAt - connectAt,
        "resp=",
        resp,
      );
      console.log("[chat-realtime] UI_READY_JOINED_MS", Date.now() - connectAt);
      opts.onConnect?.();
    });
  });

  socket.on("connect_error", (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    const description = socketConnectErrorDescription(err);
    console.log("SOCKET ERROR:", msg, description);
    console.log("[chat-realtime] SOCKET ERROR", msg, description);
  });

  socket.on("new_message", (payload: Record<string, unknown>) => {
    const now = Date.now();
    console.log(
      "[DOCTOR_CHAT_SOCKET]",
      JSON.stringify({
        phase: "receive",
        thread_id: threadIdFixed,
        room_id: `chat:${threadIdFixed}`,
        connected: socket.connected === true,
        message_id: payload?.id ?? null,
      }),
    );
    console.log("[chat-realtime] RECEIVED MESSAGE", now, "id=", payload?.id);
    console.log("[chat-realtime] RECEIVE TIME", now);
    opts.onNewMessage(payload);
  });

  socket.on("chat_join_error", (err: unknown) => {
    console.warn("[chat-realtime] JOIN ERROR from server", err);
  });

  return {
    unsubscribe: () => {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch {
        /* ignore */
      }
    },
    socket,
  };
}
