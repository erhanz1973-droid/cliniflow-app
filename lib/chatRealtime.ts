/**
 * Patient ↔ clinic realtime — Socket.IO with polling → websocket upgrade when available.
 * Room `chat:{threadId}`. `join_chat` is emitted only from `socket.on("connect")` (reconnect reuses same handler).
 */
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./api";

export const THREAD_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same origin Socket.IO connects to — must match `API_BASE`, not Metro. */
function socketConnectionUrl(): string {
  try {
    const trimmed = String(API_BASE ?? "").trim().replace(/\/+$/, "");
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return "";
    return trimmed;
  } catch {
    return "";
  }
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

function emitJoinChat(socket: Socket, threadId: string, afterAck?: () => void) {
  const t = String(threadId || "").trim();
  const payload = { threadId: t };
  const joinSentAt = Date.now();
  console.log("[chat-realtime] JOIN_CHAT emit", joinSentAt, payload);
  socket.emit("join_chat", payload, (resp: unknown) => {
    const ackAt = Date.now();
    console.log(
      "[chat-realtime] JOIN_CHAT ack",
      ackAt,
      "ms_since_emit",
      ackAt - joinSentAt,
      "resp=",
      resp,
    );
    afterAck?.();
  });
}

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

  const connUrl = socketConnectionUrl();
  const token = String(opts.token || "").trim();
  const threadIdFixed = String(opts.threadId || "").trim();

  if (!connUrl || !token || !THREAD_ID_UUID_RE.test(threadIdFixed)) {
    if (__DEV__ && THREAD_ID_UUID_RE.test(threadIdFixed)) {
      console.warn(
        "[chat-realtime] skip socket: invalid SOCKET connection URL — check API_BASE / EXPO_PUBLIC_API_* (must be Railway HTTPS, not Metro 172.x:8081)",
      );
    }
    return { unsubscribe: noop, socket: null };
  }

  console.log(
    "[chat-realtime] io connect target:",
    connUrl,
    "path=/socket.io/ (Socket.IO default transports: polling + websocket upgrade)",
  );

  const socket = io(connUrl, {
    path: "/socket.io/",
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
    console.log("SOCKET CONNECTED", socket.id);
    const t = Date.now();
    console.log("[chat-realtime] SOCKET CONNECTED", t, "sid=", socket.id);
    emitJoinChat(socket, threadIdFixed, () => {
      console.log("[chat-realtime] UI_READY_JOINED_MS", Date.now() - t);
      opts.onConnect?.();
    });
  });

  socket.on("connect_error", (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    console.log("SOCKET ERROR:", msg);
    console.log("[chat-realtime] SOCKET ERROR", msg);
  });

  socket.on("new_message", (payload: Record<string, unknown>) => {
    const now = Date.now();
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
