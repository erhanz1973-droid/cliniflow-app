import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { API_BASE } from '../lib/api';
import { useLanguage } from '../lib/language-context';

interface ICD10Code {
  code: string;
  description: string;
}

interface ICD10DropdownProps {
  selectedCode: string;
  onCodeSelect: (code: ICD10Code) => void;
  placeholder?: string;
}

export default function ICD10Dropdown({
  selectedCode,
  onCodeSelect,
  placeholder = 'ICD-10 kodu ara…',
}: ICD10DropdownProps) {
  const { currentLanguage: language } = useLanguage();
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

    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE}/api/icd10/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(language || 'tr')}`,
        );
        const json = await res.json();
        const list: ICD10Code[] = Array.isArray(json)
          ? json
          : json?.results || json?.codes || json?.data || [];
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
  }, [query, language]);

  const handleSelect = (item: ICD10Code) => {
    onCodeSelect(item);
    setQuery(`${item.code} – ${item.description}`);
    setOpen(false);
    setResults([]);
  };

  return (
    <View style={styles.wrapper}>
      {/* Search input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
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
            {results.map((item) => (
              <TouchableOpacity
                key={item.code}
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
