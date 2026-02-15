#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the i18n file
const i18nPath = path.join(__dirname, '../lib/i18n.ts');
const content = fs.readFileSync(i18nPath, 'utf8');

// Extract the ka translations section
const kaSectionMatch = content.match(/ka:\s*\{([\s\S]*?)\s*\},/s);
if (!kaSectionMatch) {
  console.error('Georgian section not found');
  process.exit(1);
}

const kaContent = kaSectionMatch[1];

// Key mappings to normalize Georgian keys to match TR/EN
const keyMappings = {
  // Navigation - Georgian uses different keys
  'nav.messages': 'chat.title',
  'nav.appointments': 'appointments.title', 
  'nav.health': 'health.title',
  'nav.travel': 'travel.title',
  'nav.treatment': 'treatment.title',
  'nav.referrals': 'referrals.title',
  'nav.home': 'home.title',
  
  // Common variations
  'messages.title': 'chat.title',
  'appointments.title': 'appointments.title',
  'referrals.title': 'referrals.title',
};

// Apply key mappings
let normalizedKaContent = kaContent;
Object.entries(keyMappings).forEach(([oldKey, newKey]) => {
  const regex = new RegExp(`"${oldKey}"\\s*:\\s*"([^"]+)"`, 'g');
  normalizedKaContent = normalizedKaContent.replace(regex, `"${newKey}": "$1"`);
  console.log(`Mapped: ${oldKey} -> ${newKey}`);
});

// Replace the ka section with normalized content
const newKaSection = `ka: {\n${normalizedKaContent}\n  },`;
const newContent = content.replace(/ka:\s*\{[\s\S]*?\s*\},/s, newKaSection);

// Write back to file
fs.writeFileSync(i18nPath, newContent, 'utf8');
console.log('✅ Georgian keys normalized to match TR/EN keys');
console.log('🔧 Key mappings applied:', Object.keys(keyMappings).length);
