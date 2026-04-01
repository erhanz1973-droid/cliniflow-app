/**
 * ScreenFeedback — shared loading / error / empty-state primitives.
 *
 * Usage:
 *   <LoadingScreen />
 *   <ErrorScreen kind="timeout" onRetry={load} />
 *   <EmptyState icon="👥" titleKey="common.noPatients" subKey="common.noPatientsSub" />
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLanguage } from '../lib/language-context';
import type { ApiErrorKind } from '../lib/api';

// ── LoadingScreen ────────────────────────────────────────────────────────────

interface LoadingScreenProps {
  /** Max ms before we switch from spinner to "Loading timed out" error UI */
  timeoutMs?: number;
  onTimeout?: () => void;
  message?: string;
}

export function LoadingScreen({ timeoutMs = 12_000, onTimeout, message }: LoadingScreenProps) {
  const { t } = useLanguage();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setTimedOut(true);
      onTimeout?.();
    }, timeoutMs);
    return () => clearTimeout(id);
  }, [timeoutMs, onTimeout]);

  if (timedOut) {
    return (
      <SafeAreaView style={ss.center}>
        <Text style={ss.icon}>⏳</Text>
        <Text style={ss.title}>{t('common.loadTimeout')}</Text>
        <Text style={ss.sub}>{t('common.loadTimeoutSub')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ss.center}>
      <ActivityIndicator size="large" color="#2563EB" />
      {message ? <Text style={ss.loadingMsg}>{message}</Text> : null}
    </SafeAreaView>
  );
}

// ── ErrorScreen ──────────────────────────────────────────────────────────────

interface ErrorScreenProps {
  kind?: ApiErrorKind | string | null;
  message?: string | null;
  onRetry?: () => void;
  /** If true, the component renders inside a View instead of SafeAreaView (e.g. inside a card) */
  inline?: boolean;
}

function errorContent(kind: string | null | undefined): { icon: string; titleKey: string; subKey: string } {
  switch (kind) {
    case 'timeout':
      return { icon: '⏳', titleKey: 'common.loadTimeout', subKey: 'common.loadTimeoutSub' };
    case 'warmingUp':
      return { icon: '⏳', titleKey: 'common.loadTimeout', subKey: 'common.serverNotRespondingSub' };
    case 'network':
      return { icon: '📡', titleKey: 'common.serverNotResponding', subKey: 'common.serverNotRespondingSub' };
    case 'server':
      return { icon: '⚠️', titleKey: 'common.serverError', subKey: 'common.serverErrorSub' };
    default:
      return { icon: '⚠️', titleKey: 'common.error', subKey: 'common.pleaseRetry' };
  }
}

export function ErrorScreen({ kind, message, onRetry, inline }: ErrorScreenProps) {
  const { t } = useLanguage();
  const { icon, titleKey, subKey } = errorContent(kind);
  const Wrapper = inline ? View : SafeAreaView;

  return (
    <Wrapper style={ss.center}>
      <Text style={ss.icon}>{icon}</Text>
      <Text style={ss.title}>{t(titleKey)}</Text>
      <Text style={ss.sub}>{message || t(subKey)}</Text>
      {onRetry ? (
        <Pressable style={ss.retryBtn} onPress={onRetry}>
          <Text style={ss.retryBtnText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
    </Wrapper>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  titleKey?: string;
  subKey?: string;
  title?: string;
  sub?: string;
}

export function EmptyState({ icon = '📭', titleKey, subKey, title, sub }: EmptyStateProps) {
  const { t } = useLanguage();
  return (
    <View style={ss.emptyBox}>
      <Text style={ss.icon}>{icon}</Text>
      <Text style={ss.title}>{title ?? (titleKey ? t(titleKey) : t('common.noDataAvailable'))}</Text>
      {(sub ?? (subKey ? t(subKey) : t('common.noDataAvailableSub'))) ? (
        <Text style={ss.sub}>{sub ?? (subKey ? t(subKey) : t('common.noDataAvailableSub'))}</Text>
      ) : null}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 24,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  icon: { fontSize: 44, marginBottom: 12 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  loadingMsg: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  retryBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
