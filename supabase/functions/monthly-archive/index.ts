import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const BUCKET = "jarbou3-private";
const SERVICE_OFFSET_MS = 3 * 60 * 60 * 1000;

function monthWindow(reportMonth: string) {
  const start = new Date(`${reportMonth}T00:00:00+03:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function previousServiceMonth() {
  const now = new Date(Date.now() + SERVICE_OFFSET_MS);
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return date.toISOString().slice(0, 10);
}

function serviceDayIsFirst() {
  return new Date(Date.now() + SERVICE_OFFSET_MS).getUTCDate() === 1;
}

function safeText(value: string | null | undefined) {
  return (value ?? "-").replace(/[^\x20-\x7E]/g, "?").slice(0, 88);
}

function financialSnapshot(order: any) {
  const grossAmount = Number(order.final_price ?? order.estimated_price ?? 0);
  if (order.commission_calculated_at) {
    return {
      grossAmount,
      companyCommissionAmount: Number(order.company_commission_amount ?? 0),
      driverNetAmount: Number(order.driver_net_amount ?? 0),
    };
  }
  const companyCommissionAmount = Math.floor((grossAmount * 3) / 100);
  return { grossAmount, companyCommissionAmount, driverNetAmount: grossAmount - companyCommissionAmount };
}

async function buildReportPdf(reportMonth: string, orders: any[], shifts: any[]) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`Jarbou3 monthly report ${reportMonth}`);

  const completed = orders.filter((order) => order.status === "delivered");
  const cancelled = orders.filter((order) => order.status === "cancelled");
  const financialSummary = completed.reduce((summary, order) => {
    const snapshot = financialSnapshot(order);
    summary.grossRevenue += snapshot.grossAmount;
    summary.companyCommission += snapshot.companyCommissionAmount;
    summary.driverNetAmount += snapshot.driverNetAmount;
    return summary;
  }, { grossRevenue: 0, companyCommission: 0, driverNetAmount: 0 });
  const elapsed = completed.reduce((sum, order) => sum + Number(order.actual_time_seconds ?? 0), 0);
  const averageMinutes = completed.length ? Math.round(elapsed / completed.length / 60) : 0;

  let page = document.addPage([595, 842]);
  let y = 790;
  const write = (text: string, size = 10, emphasis = false) => {
    page.drawText(text, { x: 48, y, size, font: emphasis ? bold : regular, color: rgb(0.14, 0.14, 0.14) });
    y -= size + 8;
  };
  const addPage = () => {
    page = document.addPage([595, 842]);
    y = 790;
    write(`Jarbou3 Delivery | Monthly report ${reportMonth}`, 11, true);
    y -= 8;
  };

  write("Jarbou3 Delivery", 20, true);
  write(`Monthly operating report | ${reportMonth}`, 13, true);
  y -= 8;
  write(`Total orders: ${orders.length}`);
  write(`Completed trips: ${completed.length}`);
  write(`Cancelled orders: ${cancelled.length}`);
  write(`Gross collected trips (new SYP): ${financialSummary.grossRevenue}`);
  write(`Company commission 3% (new SYP): ${financialSummary.companyCommission}`);
  write(`Driver net payable (new SYP): ${financialSummary.driverNetAmount}`);
  write(`Average actual trip time: ${averageMinutes} minutes`);
  write(`Driver shifts: ${shifts.length}`);
  y -= 10;
  write("Detailed orders", 14, true);

  for (const order of orders) {
    if (y < 84) addPage();
    const snapshot = financialSnapshot(order);
    write(`#${order.id.slice(0, 8)} | ${order.status} | ${snapshot.grossAmount} new SYP | ${Number(order.distance_m ?? 0)} m`, 9, true);
    write(`From: ${safeText(order.source_address)}`, 8);
    write(`To: ${safeText(order.destination_address)} | payment: ${order.payment_method} | created: ${order.created_at}`, 8);
    if (order.status === "delivered") write(`Company 3%: ${snapshot.companyCommissionAmount} | Driver net: ${snapshot.driverNetAmount}`, 8);
    y -= 3;
  }

  if (y < 110) addPage();
  write("Driver shift summary", 14, true);
  for (const shift of shifts) {
    if (y < 60) addPage();
    write(`Driver: ${shift.driver_id.slice(0, 8)} | date: ${shift.shift_date} | amount: ${shift.total_amount} | closed: ${shift.is_closed}`, 9);
  }

  return document.save();
}

Deno.serve(async (request) => {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const serviceKey = secretKeys.default ?? legacyServiceKey;
  const projectUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !projectUrl) return Response.json({ error: "Archive service is not configured" }, { status: 500 });
  const acceptedKeys = [secretKeys.default, legacyServiceKey].filter(Boolean);
  if (!acceptedKeys.includes(request.headers.get("apikey"))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "purge" ? "purge" : "generate";
  const reportMonth = typeof body.reportMonth === "string" ? body.reportMonth : previousServiceMonth();
  const admin = createClient(projectUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (mode === "generate") {
    if (!serviceDayIsFirst() && !body.reportMonth) return Response.json({ skipped: "The report is generated only on the first local day of a month." });
    const { start, end } = monthWindow(reportMonth);
    const { data: existing } = await admin.from("monthly_reports").select("id,status").eq("report_month", reportMonth).maybeSingle();
    if (existing?.status === "ready" || existing?.status === "download_confirmed" || existing?.status === "purged") return Response.json({ skipped: "Report already exists", reportMonth });

    const { error: reportError } = await admin.from("monthly_reports").upsert({ report_month: reportMonth, status: "generating", error_message: null }, { onConflict: "report_month" });
    if (reportError) throw reportError;
    const [{ data: orders, error: ordersError }, { data: shifts, error: shiftsError }] = await Promise.all([
      admin.from("orders").select("id,source_address,destination_address,estimated_price,final_price,company_commission_amount,driver_net_amount,commission_calculated_at,payment_method,status,distance_m,actual_time_seconds,created_at").gte("created_at", start).lt("created_at", end).order("created_at"),
      admin.from("driver_shifts").select("driver_id,shift_date,total_amount,is_closed").gte("shift_date", reportMonth).lt("shift_date", end.slice(0, 10)).order("shift_date"),
    ]);
    if (ordersError) throw ordersError;
    if (shiftsError) throw shiftsError;
    const bytes = await buildReportPdf(reportMonth, orders ?? [], shifts ?? []);
    const storagePath = `monthly-reports/jarbou3-${reportMonth}.pdf`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const { error: readyError } = await admin.from("monthly_reports").update({ status: "ready", storage_path: storagePath, generated_at: new Date().toISOString() }).eq("report_month", reportMonth);
    if (readyError) throw readyError;
    return Response.json({ generated: true, reportMonth, storagePath, orders: orders?.length ?? 0 });
  }

  const { data: reports, error: reportsError } = await admin.from("monthly_reports").select("id,report_month").eq("status", "download_confirmed").is("purged_at", null);
  if (reportsError) throw reportsError;
  const outcome: string[] = [];
  for (const report of reports ?? []) {
    const { start, end } = monthWindow(report.report_month);
    const { error: shiftDeleteError } = await admin.from("driver_shifts").delete().gte("shift_date", report.report_month).lt("shift_date", end.slice(0, 10));
    if (shiftDeleteError) throw shiftDeleteError;
    const { error: orderDeleteError } = await admin.from("orders").delete().gte("created_at", start).lt("created_at", end);
    if (orderDeleteError) throw orderDeleteError;
    const { error: statusError } = await admin.from("monthly_reports").update({ status: "purged", purge_started_at: new Date().toISOString(), purged_at: new Date().toISOString() }).eq("id", report.id);
    if (statusError) throw statusError;
    outcome.push(report.report_month);
  }
  return Response.json({ purgedMonths: outcome });
});
