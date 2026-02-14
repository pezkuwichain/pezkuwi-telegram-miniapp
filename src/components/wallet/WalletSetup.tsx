/**
 * Wallet Setup Component
 * Initial screen for wallet creation or import
 */

import { Wallet, Plus, Download } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface Props {
  onCreate: () => void;
  onImport: () => void;
}

export function WalletSetup({ onCreate, onImport }: Props) {
  const { t } = useTranslation();

  return (
    <div className="p-4 space-y-8">
      <div className="text-center pt-8">
        <div className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-6">
          <Wallet className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pezkuwi Wallet</h1>
        <p className="text-muted-foreground">{t('walletSetup.officialWallet')}</p>
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
            <p className="font-semibold">{t('walletSetup.createNew')}</p>
            <p className="text-sm opacity-80">{t('walletSetup.createNewDesc')}</p>
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
            <p className="font-semibold">{t('walletSetup.importWallet')}</p>
            <p className="text-sm text-muted-foreground">{t('walletSetup.importWalletDesc')}</p>
          </div>
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground px-4">
        {t('walletSetup.securityNote')}
      </p>
    </div>
  );
}
