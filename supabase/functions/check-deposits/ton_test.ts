import { assert, assertFalse } from 'jsr:@std/assert@1';
import { isIncomingTonTransfer } from './ton.ts';

const DEPOSIT = '0:c35f028ad76a7003bcb164decaec61230a77ad05c724856409e9445014b0b7be';

Deno.test('a transfer to the deposit address is a deposit', () => {
  assert(isIncomingTonTransfer({ recipient: { address: DEPOSIT } }, DEPOSIT));
});

Deno.test('a sweep out of the deposit address is not a deposit', () => {
  // 2026-02-13: 41.9 USDT sent from the deposit address, no memo.
  const sweep = {
    recipient: { address: '0:ef28248f185d0000000000000000000000000000000000000000000000000000' },
  };
  assertFalse(isIncomingTonTransfer(sweep, DEPOSIT));
});

Deno.test('a transfer with no recipient is not a deposit', () => {
  assertFalse(isIncomingTonTransfer({}, DEPOSIT));
  assertFalse(isIncomingTonTransfer(undefined, DEPOSIT));
});
