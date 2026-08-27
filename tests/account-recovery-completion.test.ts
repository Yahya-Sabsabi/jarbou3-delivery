import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const request = {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: "44444444-4444-4444-8444-444444444444",
    status: "verified",
    reset_token_hash: "reset-token-hash",
    reset_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const updateUserById = vi.fn();
  const signInWithPassword = vi.fn();
  const updateRequest = vi.fn();
  const updateOnboardingRequest = vi.fn();
  const getUserProfile = vi.fn();

  const service = {
    from: (table: string) => {
      if (table === "account_recovery_requests") {
        const selected = {
          eq: () => selected,
          maybeSingle: async () => ({ data: request, error: null }),
        };
        return {
          select: () => selected,
          update: (value: unknown) => {
            updateRequest(value);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "account_verification_requests") {
        return {
          update: (value: unknown) => {
            updateOnboardingRequest(value);
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    auth: { admin: { updateUserById } },
  };

  return { getUserProfile, request, service, signInWithPassword, updateOnboardingRequest, updateRequest, updateUserById };
});

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(async () => true), hash: vi.fn() },
}));

vi.mock("../server/jarbou3-supabase", () => ({
  asPublic: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
  asService: () => mocks.service,
  asUser: vi.fn(),
  assertHamaPoint: vi.fn(),
  createOtpHash: vi.fn(),
  decodeDataUrl: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getUserProfile: mocks.getUserProfile,
}));

import { appRouter } from "../server/routers";

describe("إكمال استرجاع كلمة المرور", () => {
  beforeEach(() => {
    mocks.request.reset_token_expires_at = new Date(Date.now() + 60_000).toISOString();
    mocks.updateUserById.mockReset().mockResolvedValue({ error: null });
    mocks.signInWithPassword.mockReset().mockResolvedValue({
      data: {
        session: { access_token: "a".repeat(24), refresh_token: "r".repeat(24) },
        user: { id: mocks.request.user_id },
      },
      error: null,
    });
    mocks.updateRequest.mockReset();
    mocks.updateOnboardingRequest.mockReset();
    mocks.getUserProfile.mockReset().mockResolvedValue({ name: "مستخدم اختبار", role: "customer" });
  });

  it("يحدّث كلمة المرور، ثم ينشئ جلسة دخول، ثم يغلق طلب الاسترجاع", async () => {
    const caller = appRouter.createCaller({ req: {}, res: {} } as any);
    const result = await caller.jarbou3.completeAccountRecovery({
      requestId: mocks.request.id,
      phone: "+963900000000",
      resetToken: "t".repeat(24),
      password: "safe-password",
    });

    expect(mocks.updateUserById).toHaveBeenCalledWith(
      mocks.request.user_id,
      expect.objectContaining({ email: expect.stringMatching(/^u-[a-f0-9]{64}@jarbou3\.local$/), email_confirm: true, password: "safe-password" }),
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledWith(expect.objectContaining({ email: expect.stringMatching(/^u-[a-f0-9]{64}@jarbou3\.local$/), password: "safe-password" }));
    expect(mocks.updateRequest).toHaveBeenCalledWith({ status: "completed", reset_token_hash: null, reset_token_expires_at: null });
    expect(mocks.updateOnboardingRequest).toHaveBeenCalledWith({ status: "verified" });
    expect(mocks.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateRequest.mock.invocationCallOrder[0]);
    expect(result.user).toEqual({ id: mocks.request.user_id, name: "مستخدم اختبار", role: "customer" });
  });
});
