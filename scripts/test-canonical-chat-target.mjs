import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCanonicalChatTarget,
  isEnrolledSharedCare,
  normalizeLeadThreadIsLead,
  pathFromCanonicalTarget,
} from "../lib/canonicalChatTarget.ts";

const PID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("resolveCanonicalChatTarget", () => {
  it("enrolled doctor with patient id → patient_chat", () => {
    const t = resolveCanonicalChatTarget({
      viewerRole: "doctor",
      patientId: PID,
      patientName: "Ali",
      offerId: OID,
      leadThreadIsLead: false,
    });
    assert.equal(t.kind, "patient_chat");
    assert.equal(t.channel, "patient");
    assert.match(pathFromCanonicalTarget(t), /patient-chat/);
  });

  it("lead doctor with offer → offer_chat", () => {
    const t = resolveCanonicalChatTarget({
      viewerRole: "doctor",
      patientId: PID,
      patientName: "Ali",
      offerId: OID,
      leadThreadIsLead: true,
      threadKind: "offer",
    });
    assert.equal(t.kind, "offer_chat");
    assert.equal(t.channel, "offer");
  });

  it("bootstrap route patient_chat overrides offer id", () => {
    const t = resolveCanonicalChatTarget({
      viewerRole: "doctor",
      offerId: OID,
      patientId: PID,
      bootstrapRoute: "patient_chat",
      enrolled: true,
    });
    assert.equal(t.kind, "patient_chat");
  });

  it("enrollment detection helpers", () => {
    assert.equal(
      isEnrolledSharedCare({
        enrolled: true,
        leadThreadIsLead: false,
        bootstrapRoute: "patient_chat",
      }),
      true,
    );
    assert.equal(normalizeLeadThreadIsLead("false"), false);
  });
});
