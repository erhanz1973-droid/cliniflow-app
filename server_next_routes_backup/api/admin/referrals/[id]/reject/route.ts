import { NextResponse } from "next/server";

type ReferralStatus = "PENDING" | "APPROVED" | "REJECTED";

type Referral = {
  id: string;
  status: ReferralStatus;
  discountPercent?: number | null;
  approvedAt?: number | null;
};

export async function PATCH(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const db: Referral[] = (globalThis as any).__REFERRALS__ ?? [];
  const idx = db.findIndex((x) => x.id === id);
  if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (db[idx].status !== "PENDING") {
    return NextResponse.json({ error: "only PENDING can be rejected" }, { status: 409 });
  }

  db[idx] = {
    ...db[idx],
    status: "REJECTED",
    discountPercent: null,
    approvedAt: null,
  };

  (globalThis as any).__REFERRALS__ = db;

  return NextResponse.json({ ok: true, item: db[idx] });
}
