import { NextResponse } from "next/server";

type ReferralStatus = "PENDING" | "APPROVED" | "REJECTED";

type Referral = {
  id: string;
  inviterPatientName?: string;
  invitedPatientName?: string;
  status: ReferralStatus;
  discountPercent?: number | null;
  createdAt: number;
  checkInAt?: number | null;
  approvedAt?: number | null;
};

// ✅ dev amaçlı in-memory DB
const g = globalThis as any;
if (!g.__REFERRALS__) {
  const now = Date.now();
  g.__REFERRALS__ = [
    {
      id: "ref-1",
      inviterPatientName: "Erhan Z.",
      invitedPatientName: "John D.",
      status: "PENDING",
      createdAt: now - 1000 * 60 * 60 * 5,
      checkInAt: now - 1000 * 60 * 20, // check-in var
      discountPercent: null,
      approvedAt: null,
    },
    {
      id: "ref-2",
      inviterPatientName: "Erhan Z.",
      invitedPatientName: "Mike P.",
      status: "APPROVED",
      createdAt: now - 1000 * 60 * 60 * 30,
      checkInAt: now - 1000 * 60 * 60 * 28,
      discountPercent: 7,
      approvedAt: now - 1000 * 60 * 60 * 26,
    },
    {
      id: "ref-3",
      inviterPatientName: "Sara K.",
      invitedPatientName: "Liam T.",
      status: "REJECTED",
      createdAt: now - 1000 * 60 * 60 * 40,
      checkInAt: null,
      discountPercent: null,
      approvedAt: null,
    },
  ] as Referral[];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ReferralStatus | null;

  const db: Referral[] = (globalThis as any).__REFERRALS__ ?? [];
  const items = status ? db.filter((x) => x.status === status) : db;

  return NextResponse.json({ items });
}
