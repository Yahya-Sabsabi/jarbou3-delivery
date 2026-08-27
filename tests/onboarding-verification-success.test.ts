import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const request = {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "مستخدم اختبار",
    phone: "+963900000000",
    requested_role: "customer",
    status: "code_sent",
    verification_code_hash: "test-hash",
    code_expires_at: new Date(Date.now() + 60_000).toISOString(),
    code_attempts: 0,
    retry_after: null,
    auth_user_id: null,
  };
  const createdUserId = "22222222-2222-4222-8222-222222222222";
  const createUser = vi.fn();
  const signInWithPassword = vi.fn();

  const service = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === "account_verification_requests"
            ? { data: request, error: null }
            : { data: null, error: null },
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    auth: { admin: { createUser, updateUserById: vi.fn() } },
  };

  return { createUser, request, service, signInWithPassword, createdUserId };
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
  getUserProfile: vi.fn(),
}));

import { appRouter } from "../server/routers";

describe("التحقق المضبوط برمز تسجيل صحيح", () => {
  beforeEach(() => {
    mocks.request.code_expires_at = new Date(Date.now() + 60_000).toISOString();
    mocks.request.auth_user_id = null;
    mocks.createUser.mockReset().mockResolvedValue({ data: { user: { id: mocks.createdUserId } }, error: null });
    mocks.signInWithPassword.mockReset().mockResolvedValue({
      data: {
        session: { access_token: "a".repeat(24), refresh_token: "r".repeat(24) },
        user: { id: mocks.createdUserId },
      },
      error: null,
    });
  });

  it("يمر من مطابقة الرمز إلى إنشاء الحساب والجلسة من دون حد نقل عام", async () => {
    const caller = appRouter.createCaller({ req: { ip: "127.0.0.1" }, res: {} } as any);

    const result = await caller.jarbou3.verifyOnboardingCode({
      requestId: mocks.request.id,
      phone: mocks.request.phone,
      code: "123456",
    });

    expect(mocks.createUser).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(result.user).toEqual({ id: mocks.createdUserId, name: mocks.request.full_name, role: "customer" });
  });
});
