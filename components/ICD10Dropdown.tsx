import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { API_BASE } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { useAuth } from '../lib/auth';

interface ICD10Code {
  code: string;
  description: string;
}

interface ICD10DropdownProps {
  selectedCode: string;
  onCodeSelect: (code: ICD10Code) => void;
  /** Visible label above the search field (required). */
  label: string;
}

export default function ICD10Dropdown({
  selectedCode,
  onCodeSelect,
  label,
}: ICD10DropdownProps) {
  const { currentLanguage: language } = useLanguage();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ICD10Code[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect external selectedCode into input (e.g. on reset)
  useEffect(() => {
    if (!selectedCode) setQuery('');
  }, [selectedCode]);

  // Debounced search whenever query or language changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const token = user?.token?.trim();
        if (!token) {
          setResults([]);
          setOpen(false);
          return;
        }
        const res = await fetch(
          `${API_BASE}/api/icd/search?q=${encodeURIComponent(query.trim())}&lang=${encodeURIComponent(language || 'tr')}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          },
        );
        const json = await res.json();
        const raw = Array.isArray(json)
          ? json
          : json?.results || json?.codes || json?.data || [];
        const list: ICD10Code[] = (raw as any[]).map((row) => ({
          code: String(row?.code ?? '').trim(),
          description: String(
            row?.description ??
              row?.description_tr ??
              row?.description_en ??
              row?.title_tr ??
              row?.title_en ??
              ''
          ).trim(),
        })).filter((r) => r.code);
        setResults(list);
        setOpen(list.length > 0);
      } catch (e) {
        console.error('[ICD10Dropdown] search error:', e);
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, language, user?.token]);

  const handleSelect = (item: ICD10Code) => {
    onCodeSelect(item);
    setQuery(`${item.code} – ${item.description}`);
    setOpen(false);
    setResults([]);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => { setQuery(t); }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color="#2563EB"
            style={styles.spinner}
          />
        )}
      </View>

      {/* Inline suggestion list — rendered below input, no absolute position */}
      {open && results.length > 0 && (
        <View style={styles.list}>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
            style={{ maxHeight: 220 }}
          >
            {results.map((item, idx) => (
              <TouchableOpacity
                key={`${item.code}-${idx}`}
                style={styles.item}
                activeOpacity={0.7}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.desc}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 0,
  },
  fieldLabel: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#111827',
  },
  spinner: {
    marginLeft: 8,
  },
  list: {
    marginTop: 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  code: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 1,
  },
  desc: {
    fontSize: 13,
    color: '#374151',
  },
});
