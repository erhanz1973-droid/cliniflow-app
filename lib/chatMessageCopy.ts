import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";

export type ChatCopyMenuButton = {
  text: string;
  onPress: () => void;
  style?: "default" | "cancel" | "destructive";
};

/** Text suitable for clipboard from a generic chat row. */
export function copyableChatText(text: unknown, fallback?: unknown): string {
  const primary = String(text ?? "").trim();
  if (primary) return primary;
  return String(fallback ?? "").trim();
}

/**
 * Tap/long-press menu — copy plus optional extra actions (e.g. translate).
 */
export function showChatMessageCopyMenu(
  rawText: string,
  t: (key: string) => string,
  extraButtons: ChatCopyMenuButton[] = [],
): void {
  const body = String(rawText || "").trim();
  if (!body) return;

  const copyLabel =
    t("chat.copyMessage") !== "chat.copyMessage" ? t("chat.copyMessage") : t("common.copy");
  const cancelLabel =
    t("common.cancel") !== "common.cancel" ? t("common.cancel") : "Cancel";

  Alert.alert("", undefined, [
    {
      text: copyLabel,
      onPress: () => {
        void Clipboard.setStringAsync(body);
      },
    },
    ...extraButtons.map((b) => ({
      text: b.text,
      onPress: b.onPress,
      style: b.style,
    })),
    { text: cancelLabel, style: "cancel" as const },
  ]);
}
