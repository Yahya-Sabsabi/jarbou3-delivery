import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMonthlyTextPdfFromRows } from "../server/jarbou3-manual-archive";

const deliveredOrder = {
  id: "order-pdf-10-percent",
  status: "delivered",
  estimated_price: 10_000,
  final_price: 10_000,
  discount_amount: 0,
  company_commission_amount: 1_000,
  driver_net_amount: 9_000,
  commission_calculated_at: "2026-08-31T10:00:00.000Z",
  source_address: "حماة",
  destination_address: "حيّ آخر",
  created_at: "2026-08-31T10:00:00.000Z",
};

describe("monthly operational PDF", () => {
  it("contains the persisted 10% commission snapshot", async () => {
    const generated = await buildMonthlyTextPdfFromRows("2026-08-01", "2026-08-31", [deliveredOrder], []);
    const folder = mkdtempSync(join(tmpdir(), "jarbou3-pdf-"));
    const pdfPath = join(folder, "monthly.pdf");
    const textPath = join(folder, "monthly.txt");
    try {
      writeFileSync(pdfPath, generated.buffer);
      execFileSync("pdftotext", [pdfPath, textPath]);
      const text = readFileSync(textPath, "utf8");
      expect(text).toContain("Company 10%: 1000");
      expect(text).toContain("Driver net: 9000");
      expect(generated.counts).toEqual({ orders: 1, shifts: 0 });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
