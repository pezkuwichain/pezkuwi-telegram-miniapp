/**
 * Rewards Section - Referral System
 * Uses real blockchain data from ReferralContext
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Users,
  Trophy,
  Copy,
  Check,
  Share2,
  RefreshCw,
  Star,
  TrendingUp,
  Award,
  Zap,
  Coins,
} from 'lucide-react';
import { cn, formatAddress } from '@/lib/utils';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuth } from '@/contexts/AuthContext';
import { useReferral } from '@/contexts/ReferralContext';
import { useWallet } from '@/contexts/WalletContext';
import { SocialLinks } from '@/components/SocialLinks';

// Activity tracking constants
const ACTIVITY_STORAGE_KEY = 'pezkuwi_last_active';
const ACTIVITY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function RewardsSection() {
  const { hapticImpact, hapticNotification, shareUrl, showAlert } = useTelegram();
  const { user: authUser } = useAuth();
  const { stats, myReferrals, loading, refreshStats } = useReferral();
  const { isConnected } = useWallet();

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'referrals'>('overview');
  const [isActive, setIsActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  // Check activity status
  const checkActivityStatus = useCallback(() => {
    const lastActive = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (lastActive) {
      const lastActiveTime = parseInt(lastActive, 10);
      const now = Date.now();
      const elapsed = now - lastActiveTime;

      if (elapsed < ACTIVITY_DURATION_MS) {
        setIsActive(true);
        const remaining = ACTIVITY_DURATION_MS - elapsed;
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        setTimeRemaining(`${hours}s ${minutes}d`);
      } else {
        setIsActive(false);
        setTimeRemaining(null);
      }
    } else {
      setIsActive(false);
      setTimeRemaining(null);
    }
  }, []);

  // Check activity status on mount and every minute
  useEffect(() => {
    // Run check after a microtask to avoid synchronous setState in effect
    const timeoutId = setTimeout(checkActivityStatus, 0);
    const interval = setInterval(checkActivityStatus, 60000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [checkActivityStatus]);

  const handleActivate = () => {
    hapticNotification('success');
    localStorage.setItem(ACTIVITY_STORAGE_KEY, Date.now().toString());
    setIsActive(true);
    setTimeRemaining('24s 0d');
    showAlert('Tu niha aktîv î! 24 saet paşê dîsa bikirtîne.');
  };

  // Telegram referral link (for sharing) - use authenticated user ID
  const referralLink = authUser?.telegram_id
    ? `https://t.me/pezkuwichain_bot?start=ref_${authUser.telegram_id}`
    : 'https://t.me/pezkuwichain_bot';

  const handleCopy = async () => {
    try {
      await window.navigator.clipboard.writeText(referralLink);
      setCopied(true);
      hapticNotification('success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showAlert('Kopî bû');
    }
  };

  const handleShare = () => {
    hapticImpact('medium');
    shareUrl(
      referralLink,
      'Pezkuwichain - Dewleta Dîjîtal a Kurd! Bi lînka min ve tev li me bibe:'
    );
  };

  const handleRefresh = () => {
    hapticImpact('medium');
    refreshStats();
  };

  // Calculate points per referral based on position
  const getPointsForPosition = (position: number): number => {
    if (position <= 10) return 10;
    if (position <= 50) return 5;
    if (position <= 100) return 4;
    return 0;
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <Gift className="w-16 h-16 text-purple-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Xelat - Referral System</h2>
        <p className="text-muted-foreground mb-4">
          Ji bo dîtina referral û xelatên xwe, berî her tiştî cîzdanê xwe girêde.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm safe-area-top">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Gift className="w-4 h-4 text-purple-400" />
            </div>
            <h1 className="text-lg font-semibold">Xelat</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-secondary"
          >
            <RefreshCw
              className={`w-5 h-5 text-muted-foreground ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
          {[
            { id: 'overview' as const, label: 'Geşbîn' },
            { id: 'referrals' as const, label: 'Referral' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                hapticImpact('light');
                setActiveTab(id);
              }}
              className={cn(
                'flex-1 py-2 rounded-md text-sm transition-colors',
                activeTab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="p-4 space-y-4">
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-secondary/50 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-secondary rounded w-1/2 mb-2" />
                    <div className="h-6 bg-secondary rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Score Card */}
                <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-purple-100 text-sm">Pûana Referral</p>
                      <p className="text-4xl font-bold">{stats?.referralScore ?? 0}</p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                      <Trophy className="w-8 h-8" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-purple-100">
                    <TrendingUp className="w-4 h-4" />
                    <span>Max pûan: 500</span>
                  </div>
                </div>

                {/* Refer More Card */}
                <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/30 flex items-center justify-center flex-shrink-0">
                      <Coins className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-amber-100 mb-1">
                        زیاتر ڕیفەر بکە، زیاتر قازانج بکە!
                      </h4>
                      <p className="text-sm text-amber-200/80">
                        هەر کەسێک بهێنیت، HEZ و PEZ وەک خەڵات وەردەگریت. زیاتر ڕیفەر = زیاتر خەڵات!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-muted-foreground">Referral</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {stats?.referralCount ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">KYC pejirandî</p>
                  </div>

                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-muted-foreground">Referrer</span>
                    </div>
                    {stats?.whoInvitedMe ? (
                      <p className="text-sm font-mono text-foreground truncate">
                        {formatAddress(stats.whoInvitedMe, 6)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Tune</p>
                    )}
                    <p className="text-xs text-muted-foreground">Min vexwand</p>
                  </div>
                </div>

                {/* Pending Referral Notification */}
                {stats?.pendingReferral && (
                  <div className="bg-blue-900/20 border border-blue-600/30 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600/30 flex items-center justify-center">
                        <Award className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-semibold">Referral li bendê</div>
                        <div className="text-sm text-blue-300">
                          KYC temam bike ji bo pejirandina referral ji{' '}
                          <span className="font-mono">
                            {formatAddress(stats.pendingReferral, 6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invite Card */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-primary" />
                    Hevalên xwe vexwîne
                  </h3>

                  <div className="bg-background rounded-lg p-3 mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Lînka te</p>
                    <code className="text-sm text-foreground break-all">{referralLink}</code>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        copied
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-secondary hover:bg-secondary/80'
                      )}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Kopî bû!' : 'Kopî bike'}
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary rounded-lg text-primary-foreground text-sm font-medium"
                    >
                      <Share2 className="w-4 h-4" />
                      Parve bike
                    </button>
                  </div>
                </div>

                {/* Score System */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    Sîstema pûanan
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-border/30">
                      <span className="text-muted-foreground">1-10 referral</span>
                      <span className="text-green-400 font-medium">×10 pûan</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/30">
                      <span className="text-muted-foreground">11-50 referral</span>
                      <span className="text-green-400 font-medium">100 + ×5</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/30">
                      <span className="text-muted-foreground">51-100 referral</span>
                      <span className="text-green-400 font-medium">300 + ×4</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">101+ referral</span>
                      <span className="text-yellow-400 font-medium">500 (Max)</span>
                    </div>
                  </div>
                </div>

                {/* I am Active Button */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap
                        className={cn('w-5 h-5', isActive ? 'text-green-400' : 'text-gray-400')}
                      />
                      <div>
                        <h3 className="font-medium text-foreground">Rewşa Aktîvbûnê</h3>
                        {isActive && timeRemaining && (
                          <p className="text-xs text-green-400">Dem: {timeRemaining} maye</p>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      )}
                    >
                      {isActive ? 'Aktîv' : 'Ne Aktîv'}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Her 24 saet carekê bikirtîne da ku aktîv bimînî û xelatên zêdetir qezenc bikî!
                  </p>
                  <button
                    onClick={handleActivate}
                    disabled={isActive}
                    className={cn(
                      'w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
                      isActive
                        ? 'bg-green-500/20 text-green-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90'
                    )}
                  >
                    <Zap className="w-5 h-5" />
                    {isActive ? 'Tu Aktîv î!' : 'Ez Aktîv im!'}
                  </button>
                </div>

                {/* Social Links */}
                <SocialLinks />
              </>
            )}
          </div>
        )}

        {/* Referrals Tab */}
        {activeTab === 'referrals' && (
          <div className="p-4 space-y-4">
            {/* Refer More Card */}
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <Coins className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-amber-100 mb-1">
                    زیاتر ڕیفەر بکە، زیاتر قازانج بکە!
                  </h4>
                  <p className="text-sm text-amber-200/80">
                    هەر کەسێک بهێنیت، HEZ و PEZ وەک خەڵات وەردەگریت. زیاتر ڕیفەر = زیاتر خەڵات!
                  </p>
                </div>
              </div>
            </div>

            {/* I am Active Button */}
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className={cn('w-5 h-5', isActive ? 'text-green-400' : 'text-gray-400')} />
                  <div>
                    <h3 className="font-medium text-foreground">Rewşa Aktîvbûnê</h3>
                    {isActive && timeRemaining && (
                      <p className="text-xs text-green-400">Dem: {timeRemaining} maye</p>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  )}
                >
                  {isActive ? 'Aktîv' : 'Ne Aktîv'}
                </div>
              </div>
              <button
                onClick={handleActivate}
                disabled={isActive}
                className={cn(
                  'w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
                  isActive
                    ? 'bg-green-500/20 text-green-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90'
                )}
              >
                <Zap className="w-5 h-5" />
                {isActive ? 'Tu Aktîv î!' : 'Ez Aktîv im!'}
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-secondary/50 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-secondary rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : myReferrals.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground mb-2">
                  {myReferrals.length} referral (KYC pejirandî)
                </div>
                {myReferrals.map((referralAddress, index) => (
                  <div
                    key={referralAddress}
                    className="bg-secondary/30 rounded-xl p-4 border border-border/50 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-sm font-bold text-green-400">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <code className="text-sm text-foreground">
                        {formatAddress(referralAddress, 8)}
                      </code>
                      <p className="text-xs text-green-400">KYC Pejirandî</p>
                    </div>
                    <div className="text-right">
                      <span className="text-green-400 text-sm font-medium">
                        +{getPointsForPosition(index + 1)} pûan
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Hêj referralên te tune ne</p>
                <p className="text-sm text-muted-foreground mt-1">Lînka xwe parve bike!</p>
                <button
                  onClick={handleShare}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary rounded-lg text-primary-foreground text-sm font-medium"
                >
                  <Share2 className="w-4 h-4" />
                  Parve bike
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
