/**
 * Offer-chat text normalization + render-plan scenarios (no Jest — node --test).
 * Run: node --test scripts/test-offer-chat-text.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeOfferMessageText,
  normalizeOfferMessageTextNullable,
  planOfferChatBubbleRender,
} from '../lib/offerChatMessageText.ts';

const identityFormat = (s) => s;

describe('safeOfferMessageText', () => {
  it('null/undefined → empty', () => {
    assert.equal(safeOfferMessageText(null), '');
    assert.equal(safeOfferMessageText(undefined), '');
  });

  it('whitespace-only → empty', () => {
    assert.equal(safeOfferMessageText('   '), '');
    assert.equal(safeOfferMessageText('\n\t'), '');
  });

  it('preserves emoji and multilingual', () => {
    assert.equal(safeOfferMessageText('  مرحبا 🦷  '), 'مرحبا 🦷');
    assert.equal(safeOfferMessageText('Merhaba\nDünya'), 'Merhaba\nDünya');
  });

  it('malformed non-string → empty', () => {
    assert.equal(safeOfferMessageText({}), '');
    assert.equal(safeOfferMessageText(['x']), '');
  });
});

describe('normalizeOfferMessageTextNullable', () => {
  it('empty → null (optimistic/socket parity)', () => {
    assert.equal(normalizeOfferMessageTextNullable('  '), null);
    assert.equal(normalizeOfferMessageTextNullable('hi'), 'hi');
  });
});

describe('planOfferChatBubbleRender — regression matrix', () => {
  const doctorPatient = {
    myRole: 'doctor',
    senderRole: 'patient',
    patientSenderLabel: 'Ali',
    formatDescription: identityFormat,
  };

  it('1. normal text → bubble, doctor inline label', () => {
    const p = planOfferChatBubbleRender({
      ...doctorPatient,
      text: 'Hello',
      hasImage: false,
      hasDoc: false,
    });
    assert.equal(p.showBubbleText, true);
    assert.equal(p.useDoctorPatientInlineLabel, true);
    assert.equal(p.showAttachmentOnlyLabel, false);
  });

  it('3. attachment-only → no bubble, attachment label', () => {
    const p = planOfferChatBubbleRender({
      ...doctorPatient,
      text: null,
      hasImage: true,
      hasDoc: false,
    });
    assert.equal(p.showBubbleText, false);
    assert.equal(p.useDoctorPatientInlineLabel, false);
    assert.equal(p.showAttachmentOnlyLabel, true);
  });

  it('4. whitespace text → no bubble', () => {
    const p = planOfferChatBubbleRender({
      ...doctorPatient,
      text: '   ',
      hasImage: false,
      hasDoc: false,
    });
    assert.equal(p.showBubbleText, false);
    assert.equal(p.useDoctorPatientInlineLabel, false);
  });

  it('5. emoji / Arabic / newline', () => {
    const p = planOfferChatBubbleRender({
      ...doctorPatient,
      text: 'مرحبا 🦷\nline2',
      hasImage: false,
      hasDoc: false,
    });
    assert.equal(p.showBubbleText, true);
    assert.equal(p.useDoctorPatientInlineLabel, true);
  });

  it('doctor own message — no inline patient label branch', () => {
    const p = planOfferChatBubbleRender({
      myRole: 'doctor',
      senderRole: 'doctor',
      text: 'Reply',
      hasImage: false,
      hasDoc: false,
      patientSenderLabel: '',
      formatDescription: identityFormat,
    });
    assert.equal(p.showBubbleText, true);
    assert.equal(p.useDoctorPatientInlineLabel, false);
  });

  it('patient view doctor message', () => {
    const p = planOfferChatBubbleRender({
      myRole: 'patient',
      senderRole: 'doctor',
      text: 'Teklif',
      hasImage: false,
      hasDoc: false,
      patientSenderLabel: '',
      formatDescription: identityFormat,
    });
    assert.equal(p.showBubbleText, true);
    assert.equal(p.useDoctorPatientInlineLabel, false);
  });
});
