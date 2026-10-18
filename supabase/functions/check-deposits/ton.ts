// A deposit address's event feed also carries the transfers it sends, such as
// sweeps to the hot wallet. Only a transfer whose recipient is the deposit
// address itself is a deposit.
export interface TonJettonTransfer {
  recipient?: { address?: string };
}

export function isIncomingTonTransfer(
  transfer: TonJettonTransfer | undefined,
  depositRawAddress: string
): boolean {
  return transfer?.recipient?.address === depositRawAddress;
}
