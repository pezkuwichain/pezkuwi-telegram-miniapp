/**
 * Wallet Setup Component
 * Initial screen for wallet creation or import
 */

import { Wallet, Plus, Download } from 'lucide-react';

interface Props {
  onCreate: () => void;
  onImport: () => void;
}

export function WalletSetup({ onCreate, onImport }: Props) {
  return (
    <div className="p-4 space-y-8">
      <div className="text-center pt-8">
        <div className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-6">
          <Wallet className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pezkuwi Wallet</h1>
        <p className="text-muted-foreground">Berîka fermî ya Pezkuwichain</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={onCreate}
          className="w-full p-4 bg-primary text-primary-foreground rounded-xl flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <Plus className="w-6 h-6" />
          </div>
          <div className="text-left">
            <p className="font-semibold">Wallet Nû Çêbike</p>
            <p className="text-sm opacity-80">Wallet&apos;ekî nû bi seed phrase çêbike</p>
          </div>
        </button>

        <button
          onClick={onImport}
          className="w-full p-4 bg-muted rounded-xl flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
            <Download className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold">Wallet Import Bike</p>
            <p className="text-sm text-muted-foreground">
              Seed phrase&apos;ê xwe yê heyî bi kar bîne
            </p>
          </div>
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground px-4">
        Wallet&apos;ê te bi ewlehî li cîhaza te tê hilanîn. Em tu carî gihîştina mifteyên te tune.
      </p>
    </div>
  );
}
