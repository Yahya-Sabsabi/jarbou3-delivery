import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

import { HAMA_BOUNDS, isInsideHama } from "../shared/jarbou3";

function projectUrl() {
  const configured = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!configured) throw new Error("SUPABASE_URL is not configured");
  return configured.replace(/\/rest\/v1$/, "");
}

function publicKey() {
  const key = process.env.SUPABASE_KEY;
  if (!key) throw new Error("SUPABASE_KEY is not configured");
  return key;
}

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return key;
}

export function asUser(accessToken: string) {
  return createClient(projectUrl(), publicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function asService() {
  return createClient(projectUrl(), serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getAuthenticatedUser(accessToken: string) {
  const { data, error } = await asUser(accessToken).auth.getUser();
  if (error || !data.user) throw new Error("SUPABASE_UNAUTHORIZED");
  return data.user;
}

export async function getUserProfile(userId: string) {
  const { data, error } = await asService().from("users").select("id,name,role,is_active").eq("id", userId).single();
  if (error || !data) throw new Error("PROFILE_NOT_FOUND");
  return data;
}

export function assertHamaPoint(latitude: number, longitude: number) {
  if (!isInsideHama(latitude, longitude)) {
    throw new Error(`OUTSIDE_HAMA:${HAMA_BOUNDS.minLatitude},${HAMA_BOUNDS.maxLatitude},${HAMA_BOUNDS.minLongitude},${HAMA_BOUNDS.maxLongitude}`);
  }
}

export async function createOtpHash() {
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  return { otp, hash: await bcrypt.hash(otp, 10) };
}

export function decodeDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("INVALID_IMAGE_DATA");
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}
