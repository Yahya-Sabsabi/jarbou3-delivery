import PDFDocument from "pdfkit";

import { calculateTripFinance } from "./jarbou3-finance";
import { asService } from "./jarbou3-supabase";

type ArchiveKind = "weekly_documents" | "monthly_text";
type PdfDocument = InstanceType<typeof PDFDocument>;

type ArchiveRow = {
  id: string;
  archive_kind: ArchiveKind;
  period_start: string;
  period_end: string;
  storage_path: string;
  status: "ready" | "downloaded" | "purged" | "failed";
  downloaded_at: string | null;
  purged_at: string | null;
  created_at: string;
};

function isoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_ARCHIVE_PERIOD");
  return date.toISOString();
}

function endOfPeriod(value: string) {
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_ARCHIVE_PERIOD");
  return date.toISOString();
}

function asBuffer(document: PdfDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
}

function writeTitle(document: PdfDocument, title: string, periodStart: string, periodEnd: string) {
  document.fontSize(20).fillColor("#202020").text(title);
  document.moveDown(0.4);
  document.fontSize(10).fillColor("#555555").text(`Period: ${periodStart} to ${periodEnd}`);
  document.text(`Generated: ${new Date().toISOString()}`);
  document.moveDown();
}

async function downloadPrivateImage(path: string) {
  const { data, error } = await asService().storage.from("jarbou3-private").download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

function appendImage(document: PdfDocument, image: Buffer, caption: string) {
  const maxWidth = 430;
  const maxHeight = 430;
  if (document.y > 270) document.addPage();
  document.fontSize(10).fillColor("#303030").text(caption);
  document.moveDown(0.4);
  try {
    document.image(image, { fit: [maxWidth, maxHeight], align: "center" });
  } catch {
    document.fillColor("#B42318").text("Image could not be embedded.");
  }
  document.moveDown();
}

async function buildWeeklyDocumentsPdf(periodStart: string, periodEnd: string) {
  const service = asService();
  const start = isoDate(periodStart);
  const end = endOfPeriod(periodEnd);
  const [verificationsResult, orderPhotosResult] = await Promise.all([
    service.from("account_verification_requests").select("id,full_name,phone,requested_role,personal_photo_path,identity_photo_path,created_at").eq("requested_role", "driver").gte("created_at", start).lte("created_at", end).limit(250),
    service.from("order_photos").select("id,order_id,photo_path,created_at").gte("created_at", start).lte("created_at", end).limit(500),
  ]);
  if (verificationsResult.error) throw new Error(verificationsResult.error.message);
  if (orderPhotosResult.error) throw new Error(orderPhotosResult.error.message);
  const document = new PDFDocument({ autoFirstPage: true, margin: 48 });
  const result = asBuffer(document);
  writeTitle(document, "Jarbou3 Weekly Private Documents", periodStart, periodEnd);
  document.fontSize(11).fillColor("#303030").text(`Driver verification requests: ${(verificationsResult.data ?? []).length}`);
  document.text(`Delivery proof images: ${(orderPhotosResult.data ?? []).length}`);
  document.moveDown();
  for (const verification of verificationsResult.data ?? []) {
    document.fontSize(13).fillColor("#202020").text(`Driver: ${verification.full_name} | Phone: ${verification.phone}`);
    document.fontSize(9).fillColor("#555555").text(`Request: ${verification.id} | Created: ${verification.created_at}`);
    for (const [label, path] of [["Personal portrait", verification.personal_photo_path], ["Identity document", verification.identity_photo_path]] as const) {
      if (!path) continue;
      const image = await downloadPrivateImage(path);
      if (image) appendImage(document, image, label);
      else document.fontSize(10).fillColor("#B42318").text(`${label}: unavailable at generation time.`);
    }
    document.moveDown();
  }
  for (const photo of orderPhotosResult.data ?? []) {
    const image = await downloadPrivateImage(photo.photo_path);
    if (image) appendImage(document, image, `Delivery proof · order ${photo.order_id} · ${photo.created_at}`);
  }
  document.end();
  return { buffer: await result, counts: { driverDocuments: (verificationsResult.data ?? []).length, deliveryProofs: (orderPhotosResult.data ?? []).length } };
}

async function buildMonthlyTextPdf(periodStart: string, periodEnd: string) {
  const service = asService();
  const start = isoDate(periodStart);
  const end = endOfPeriod(periodEnd);
  const [ordersResult, shiftsResult] = await Promise.all([
    service.from("orders").select("id,status,estimated_price,final_price,discount_amount,company_commission_amount,driver_net_amount,commission_calculated_at,source_address,destination_address,created_at,updated_at").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: true }).limit(1_000),
    service.from("driver_shifts").select("id,driver_id,shift_date,total_amount,settlement_method,is_closed,closed_at,created_at").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: true }).limit(1_000),
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (shiftsResult.error) throw new Error(shiftsResult.error.message);
  const document = new PDFDocument({ autoFirstPage: true, margin: 48 });
  const result = asBuffer(document);
  writeTitle(document, "Jarbou3 Monthly Operational Archive", periodStart, periodEnd);
  document.fontSize(11).fillColor("#303030").text(`Orders: ${(ordersResult.data ?? []).length}`);
  document.text(`Driver shifts: ${(shiftsResult.data ?? []).length}`);
  document.moveDown();
  for (const order of ordersResult.data ?? []) {
    if (document.y > 700) document.addPage();
    document.fontSize(10).fillColor("#202020").text(`Order ${order.id} | ${order.status} | ${order.created_at}`);
    document.fontSize(9).fillColor("#555555").text(`${order.source_address} -> ${order.destination_address}`);
    const grossAmount = Number(order.final_price ?? order.estimated_price ?? 0);
    const snapshot = order.commission_calculated_at
      ? { companyCommissionAmount: Number(order.company_commission_amount ?? 0), driverNetAmount: Number(order.driver_net_amount ?? 0) }
      : calculateTripFinance(grossAmount);
    document.text(`Estimated: ${order.estimated_price ?? 0} | Final: ${grossAmount} | Discount: ${order.discount_amount ?? 0}`);
    if (order.status === "delivered") document.text(`Company 3%: ${snapshot.companyCommissionAmount} | Driver net: ${snapshot.driverNetAmount}`);
    document.moveDown(0.45);
  }
  document.addPage();
  document.fontSize(15).fillColor("#202020").text("Driver shifts");
  document.moveDown();
  for (const shift of shiftsResult.data ?? []) {
    if (document.y > 720) document.addPage();
    document.fontSize(10).fillColor("#202020").text(`Shift ${shift.id} | Driver: ${shift.driver_id} | ${shift.is_closed ? "closed" : "open"}`);
    document.fontSize(9).fillColor("#555555").text(`Date: ${shift.shift_date} | Amount: ${shift.total_amount} | Closed: ${shift.closed_at ?? "—"}`);
    document.moveDown(0.45);
  }
  document.end();
  return { buffer: await result, counts: { orders: (ordersResult.data ?? []).length, shifts: (shiftsResult.data ?? []).length } };
}

export async function listManualArchives() {
  const { data, error } = await asService().from("manual_archives").select("id,archive_kind,period_start,period_end,storage_path,status,downloaded_at,purged_at,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchiveRow[];
}

export async function generateManualArchive(kind: ArchiveKind, periodStart: string, periodEnd: string) {
  const service = asService();
  const existing = await service.from("manual_archives").select("id,archive_kind,period_start,period_end,storage_path,status,downloaded_at,purged_at,created_at").eq("archive_kind", kind).eq("period_start", periodStart).eq("period_end", periodEnd).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { archive: existing.data as ArchiveRow, alreadyExists: true };
  const generated = kind === "weekly_documents" ? await buildWeeklyDocumentsPdf(periodStart, periodEnd) : await buildMonthlyTextPdf(periodStart, periodEnd);
  const storagePath = `manual-archives/${kind}/${periodStart}_${periodEnd}_${Date.now()}.pdf`;
  const { error: uploadError } = await service.storage.from("jarbou3-private").upload(storagePath, generated.buffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data: archive, error: archiveError } = await service.from("manual_archives").insert({ archive_kind: kind, period_start: periodStart, period_end: periodEnd, storage_path: storagePath, status: "ready" }).select("id,archive_kind,period_start,period_end,storage_path,status,downloaded_at,purged_at,created_at").single();
  if (archiveError || !archive) throw new Error(archiveError?.message ?? "MANUAL_ARCHIVE_CREATE_FAILED");
  await service.from("manual_archive_events").insert({ archive_id: archive.id, action: "generated", details: generated.counts });
  return { archive: archive as ArchiveRow, alreadyExists: false };
}

export async function prepareManualArchiveDownload(archiveId: string) {
  const service = asService();
  const { data: archive, error } = await service.from("manual_archives").select("id,archive_kind,period_start,period_end,storage_path,status,downloaded_at,purged_at,created_at").eq("id", archiveId).single();
  if (error || !archive || archive.status === "purged") throw new Error("ARCHIVE_NOT_DOWNLOADABLE");
  if (!archive.downloaded_at) {
    const downloadedAt = new Date().toISOString();
    const { error: updateError } = await service.from("manual_archives").update({ status: "downloaded", downloaded_at: downloadedAt }).eq("id", archive.id);
    if (updateError) throw new Error(updateError.message);
    await service.from("manual_archive_events").insert({ archive_id: archive.id, action: "downloaded", details: {} });
  }
  const { data: signed, error: signedError } = await service.storage.from("jarbou3-private").createSignedUrl(archive.storage_path, 90);
  if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? "ARCHIVE_URL_UNAVAILABLE");
  return { url: signed.signedUrl };
}

export async function purgeManualArchive(archiveId: string, confirmation: string) {
  if (confirmation !== "DELETE") throw new Error("ARCHIVE_PURGE_CONFIRMATION_REQUIRED");
  const service = asService();
  const { data: archive, error } = await service.from("manual_archives").select("id,archive_kind,period_start,period_end,status,downloaded_at").eq("id", archiveId).single();
  if (error || !archive || archive.status === "purged" || !archive.downloaded_at) throw new Error("ARCHIVE_PURGE_NOT_AVAILABLE");
  const start = isoDate(archive.period_start);
  const end = endOfPeriod(archive.period_end);
  await service.from("manual_archive_events").insert({ archive_id: archive.id, action: "purge_started", details: { periodStart: archive.period_start, periodEnd: archive.period_end } });
  let deleted = { driverDocuments: 0, deliveryProofs: 0, orders: 0, shifts: 0 };
  if (archive.archive_kind === "weekly_documents") {
    const [documentsResult, proofsResult] = await Promise.all([
      service.from("account_verification_requests").select("id,personal_photo_path,identity_photo_path").eq("requested_role", "driver").gte("created_at", start).lte("created_at", end).limit(250),
      service.from("order_photos").select("id,photo_path").gte("created_at", start).lte("created_at", end).limit(500),
    ]);
    if (documentsResult.error || proofsResult.error) throw new Error(documentsResult.error?.message ?? proofsResult.error?.message ?? "ARCHIVE_DATA_UNAVAILABLE");
    const paths = [...(documentsResult.data ?? []).flatMap((row) => [row.personal_photo_path, row.identity_photo_path]), ...(proofsResult.data ?? []).map((row) => row.photo_path)].filter((path): path is string => Boolean(path));
    if (paths.length) await service.storage.from("jarbou3-private").remove(paths);
    const documentIds = (documentsResult.data ?? []).map((row) => row.id);
    const proofIds = (proofsResult.data ?? []).map((row) => row.id);
    if (documentIds.length) await service.from("account_verification_requests").update({ personal_photo_path: null, identity_photo_path: null }).in("id", documentIds);
    if (proofIds.length) await service.from("order_photos").delete().in("id", proofIds);
    deleted.driverDocuments = documentIds.length;
    deleted.deliveryProofs = proofIds.length;
  } else {
    const [ordersResult, shiftsResult] = await Promise.all([
      service.from("orders").select("id").gte("created_at", start).lte("created_at", end).limit(1_000),
      service.from("driver_shifts").select("id").gte("created_at", start).lte("created_at", end).limit(1_000),
    ]);
    if (ordersResult.error || shiftsResult.error) throw new Error(ordersResult.error?.message ?? shiftsResult.error?.message ?? "ARCHIVE_DATA_UNAVAILABLE");
    const orderIds = (ordersResult.data ?? []).map((row) => row.id);
    const shiftIds = (shiftsResult.data ?? []).map((row) => row.id);
    if (orderIds.length) {
      await service.from("order_live_locations").delete().in("order_id", orderIds);
      await service.from("driver_order_declines").delete().in("order_id", orderIds);
      await service.from("order_photos").delete().in("order_id", orderIds);
      await service.from("orders").delete().in("id", orderIds);
    }
    if (shiftIds.length) await service.from("driver_shifts").delete().in("id", shiftIds);
    deleted.orders = orderIds.length;
    deleted.shifts = shiftIds.length;
  }
  const { error: updateError } = await service.from("manual_archives").update({ status: "purged", purged_at: new Date().toISOString() }).eq("id", archive.id);
  if (updateError) throw new Error(updateError.message);
  await service.from("manual_archive_events").insert({ archive_id: archive.id, action: "purged", details: deleted });
  return { deleted };
}
