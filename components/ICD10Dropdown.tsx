import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { API_BASE } from '../lib/api';

interface ICD10Code {
  code: string;
  description: string;
}

interface ICD10DropdownProps {
  selectedCode: string;
  onCodeSelect: (code: ICD10Code) => void;
  placeholder?: string;
}

export default function ICD10Dropdown({ selectedCode, onCodeSelect, placeholder = "ICD-10 kodu ara..." }: ICD10DropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ICD10Code[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Update searchQuery when selectedCode changes
  useEffect(() => {
    if (selectedCode) {
      setSearchQuery(selectedCode);
    }
  }, [selectedCode]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (searchQuery.length < 2) {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/icd10/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        
        // Normalize response format to work with any backend structure
        const codesArray = Array.isArray(data) 
          ? data 
          : data?.codes || data?.data || [];
        
        setSuggestions(codesArray);
        setShowDropdown(codesArray.length > 0);
      } catch (error) {
        console.error('ICD-10 search error:', error);
        setSuggestions([]);
        setShowDropdown(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleCodeSelect = (code: ICD10Code) => {
    onCodeSelect(code);
    setSearchQuery(code.description); // Show description in input
    setShowDropdown(false);
    setSuggestions([]);
  };

  const renderSuggestion = ({ item }: { item: ICD10Code }) => (
    <TouchableOpacity 
      style={styles.suggestionItem} 
      onPress={() => handleCodeSelect(item)}
    >
      <Text style={styles.suggestionCode}>{item.code}</Text>
      <Text style={styles.suggestionDescription}>{item.description}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={searchQuery}
        onChangeText={setSearchQuery}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
      />
      
      {loading && (
        <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />
      )}
      
      {showDropdown && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            renderItem={renderSuggestion}
            keyExtractor={(item) => item.code}
            style={styles.list}
            keyboardShouldPersistTaps={false}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderTopWidth: 0,
    borderRadius: 8,
    maxHeight: 200,
    zIndex: 1001,
  },
  list: {
    maxHeight: 180,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 8,
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  loader: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
});
