import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  verifyTransactionByRef: vi.fn(),
  settleVerifiedTransaction: vi.fn(),
  recordPaymentLog: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/env', () => ({
  env: { FLW_SECRET_HASH: 'test-secret-hash' },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api-response', () => ({
  fail: (status: number, code: string, message: string) =>
    Response.json({ ok: false, error: { code, message } }, { status }),
  ok: (data: unknown) => Response.json({ ok: true, data }),
}));

vi.mock('@/lib/flutterwave', () => ({
  FlutterwaveTransientError: class FlutterwaveTransientError extends Error {},
  verifyTransaction: mocks.verifyTransaction,
  verifyTransactionByRef: mocks.verifyTransactionByRef,
}));

vi.mock('@/lib/payments', () => ({
  settleVerifiedTransaction: mocks.settleVerifiedTransaction,
}));

vi.mock('@/lib/payment-log', () => ({
  recordPaymentLog: mocks.recordPaymentLog,
}));

import { POST } from '@/app/api/webhooks/flutterwave/route';

const verifiedTransaction = {
  id: 123,
  tx_ref: 'sellsnap_test_ref',
  status: 'successful',
  amount: 5000,
  currency: 'NGN',
};

function makeRequest(body: unknown, includeSignature = true) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (includeSignature) headers['verif-hash'] = 'test-secret-hash';

  return new Request('http://localhost/api/webhooks/flutterwave', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe('Flutterwave webhook POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyTransaction.mockResolvedValue(verifiedTransaction);
    mocks.verifyTransactionByRef.mockResolvedValue(verifiedTransaction);
    mocks.settleVerifiedTransaction.mockResolvedValue({ status: 'paid' });
    mocks.recordPaymentLog.mockResolvedValue(undefined);
    mocks.revalidatePath.mockReturnValue(undefined);
  });

  it('accepts nested charge payload and verifies by transaction id', async () => {
    const response = await POST(
      makeRequest({
        event: 'charge.completed',
        data: { id: 123, tx_ref: 'sellsnap_test_ref', status: 'successful' },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyTransaction).toHaveBeenCalledWith(123);
    expect(mocks.verifyTransactionByRef).not.toHaveBeenCalled();
    expect(mocks.settleVerifiedTransaction).toHaveBeenCalledWith(verifiedTransaction);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/orders');
  });

  it('accepts flat bank-transfer payload and verifies by tx_ref', async () => {
    const response = await POST(
      makeRequest({
        txRef: 'sellsnap_test_ref',
        flwRef: 'FLW-123',
        amount: 5000,
        status: 'successful',
        currency: 'NGN',
        'event.type': 'BANK_TRANSFER_TRANSACTION',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyTransaction).not.toHaveBeenCalled();
    expect(mocks.verifyTransactionByRef).toHaveBeenCalledWith('sellsnap_test_ref');
    expect(mocks.settleVerifiedTransaction).toHaveBeenCalledWith(verifiedTransaction);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/orders');
  });

  it('rejects invalid signature without verifying anything', async () => {
    const response = await POST(
      makeRequest(
        {
          txRef: 'sellsnap_test_ref',
          status: 'successful',
        },
        false
      )
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyTransaction).not.toHaveBeenCalled();
    expect(mocks.verifyTransactionByRef).not.toHaveBeenCalled();
    expect(mocks.settleVerifiedTransaction).not.toHaveBeenCalled();
  });

  it('rejects flat payload without tx_ref', async () => {
    const response = await POST(
      makeRequest({
        status: 'successful',
        currency: 'NGN',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.verifyTransaction).not.toHaveBeenCalled();
    expect(mocks.verifyTransactionByRef).not.toHaveBeenCalled();
    expect(mocks.settleVerifiedTransaction).not.toHaveBeenCalled();
  });
});
