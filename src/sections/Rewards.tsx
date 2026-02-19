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
  Shield,
  Target,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { cn, formatAddress } from '@/lib/utils';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuth } from '@/contexts/AuthContext';
import { useReferral } from '@/contexts/ReferralContext';
import { useWallet } from '@/contexts/WalletContext';
import { SocialLinks } from '@/components/SocialLinks';
import { useTranslation } from '@/i18n';
import {
  getAllScores,
  getStakingScoreStatus,
  formatDuration,
  getScoreColor,
  getScoreRating,
  type UserScores,
  type StakingScoreStatus,
} from '@/lib/scores';
import {
  getStakingRewards,
  formatRewardAmount,
  formatRewardDate,
  type StakingRewardsResult,
} from '@/lib/subquery';
import {
  getCitizenshipStatus,
  confirmCitizenship,
  type CitizenshipStatus,
} from '@/lib/citizenship';
import { KurdistanSun } from '@/components/KurdistanSun';

// Activity tracking constants
const ACTIVITY_STORAGE_KEY = 'pezkuwi_last_active';
const ACTIVITY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function RewardsSection() {
  const { hapticImpact, hapticNotification, shareUrl, showAlert } = useTelegram();
  const { user: authUser } = useAuth();
  const { stats, myReferrals, loading, refreshStats } = useReferral();
  const { isConnected, address, peopleApi, keypair } = useWallet();
  const { t } = useTranslation();

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'referrals' | 'scores'>('overview');
  const [isActive, setIsActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [userScores, setUserScores] = useState<UserScores | null>(null);
  const [stakingStatus, setStakingStatus] = useState<StakingScoreStatus | null>(null);
  const [stakingRewards, setStakingRewards] = useState<StakingRewardsResult | null>(null);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [citizenshipStatus, setCitizenshipStatus] = useState<CitizenshipStatus>('NotStarted');
  const [showConfirmAnimation, setShowConfirmAnimation] = useState(false);

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
    const timeoutId = setTimeout(checkActivityStatus, 0);
    const interval = setInterval(checkActivityStatus, 60000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [checkActivityStatus]);

  // Fetch user scores when on scores tab
  const fetchUserScores = useCallback(async () => {
    if (!address) {
      setUserScores(null);
      setStakingStatus(null);
      setStakingRewards(null);
      return;
    }

    setScoresLoading(true);
    try {
      const [scores, staking, rewards] = await Promise.all([
        getAllScores(peopleApi, address),
        peopleApi ? getStakingScoreStatus(peopleApi, address) : Promise.resolve(null),
        getStakingRewards(address),
      ]);
      setUserScores(scores);
      setStakingStatus(staking);
      setStakingRewards(rewards);
    } catch (err) {
      console.error('Error fetching scores:', err);
    } finally {
      setScoresLoading(false);
    }
  }, [peopleApi, address]);

  // Fetch scores when tab changes to scores or on initial load
  useEffect(() => {
    if (activeTab === 'scores' && address) {
      fetchUserScores();
    }
  }, [activeTab, address, fetchUserScores]);

  // Fetch citizenship status
  useEffect(() => {
    if (!peopleApi || !address) return;
    getCitizenshipStatus(peopleApi, address).then(setCitizenshipStatus);
  }, [peopleApi, address]);

  const handleConfirmCitizenship = async () => {
    if (!peopleApi || !keypair) return;
    setShowConfirmAnimation(true);
    hapticImpact('medium');
    try {
      const result = await confirmCitizenship(peopleApi, keypair);
      if (result.success) {
        hapticNotification('success');
        setCitizenshipStatus('Approved');
        showAlert(t('rewards.citizenshipConfirmed'));
      } else {
        hapticNotification('error');
        showAlert(result.error || t('rewards.citizenshipFailed'));
      }
    } catch (err) {
      hapticNotification('error');
      showAlert(err instanceof Error ? err.message : t('rewards.citizenshipFailed'));
    } finally {
      setShowConfirmAnimation(false);
    }
  };

  const handleActivate = () => {
    hapticNotification('success');
    localStorage.setItem(ACTIVITY_STORAGE_KEY, Date.now().toString());
    setIsActive(true);
    setTimeRemaining('24s 0d');
    showAlert(t('rewards.activatedAlert'));
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
      showAlert(t('rewards.copyAlert'));
    }
  };

  const handleShare = () => {
    hapticImpact('medium');
    shareUrl(referralLink, t('rewards.shareText'));
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
        <h2 className="text-xl font-semibold mb-2">{t('rewards.subtitle')}</h2>
        <p className="text-muted-foreground mb-4">{t('rewards.connectWalletFirst')}</p>
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
            <h1 className="text-lg font-semibold">{t('rewards.title')}</h1>
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
            { id: 'overview' as const, label: t('rewards.overview') },
            { id: 'referrals' as const, label: t('rewards.referral') },
            { id: 'scores' as const, label: t('rewards.scores') },
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
                      <p className="text-purple-100 text-sm">{t('rewards.referralScore')}</p>
                      <p className="text-4xl font-bold">{stats?.referralScore ?? 0}</p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                      <Trophy className="w-8 h-8" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-purple-100">
                    <TrendingUp className="w-4 h-4" />
                    <span>{t('rewards.maxScore')}</span>
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
                        {t('rewards.referMoreTitle')}
                      </h4>
                      <p className="text-sm text-amber-200/80">
                        {t('rewards.referMoreDescription')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-muted-foreground">{t('rewards.referral')}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {stats?.referralCount ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('rewards.kycApproved')}</p>
                  </div>

                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-muted-foreground">{t('rewards.referrer')}</span>
                    </div>
                    {stats?.whoInvitedMe ? (
                      <p className="text-sm font-mono text-foreground truncate">
                        {formatAddress(stats.whoInvitedMe, 6)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('rewards.none')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{t('rewards.invitedMe')}</p>
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
                        <div className="text-white font-semibold">
                          {t('rewards.pendingReferral')}
                        </div>
                        <div className="text-sm text-blue-300">
                          {t('rewards.completeKyc')}{' '}
                          <span className="font-mono">
                            {formatAddress(stats.pendingReferral, 6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Citizenship Status Card */}
                {(citizenshipStatus === 'PendingReferral' ||
                  citizenshipStatus === 'ReferrerApproved') && (
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-medium text-foreground">
                        {t('rewards.citizenshipStatus')}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                          citizenshipStatus === 'PendingReferral'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            citizenshipStatus === 'PendingReferral'
                              ? 'bg-green-400'
                              : 'bg-muted-foreground'
                          )}
                        />
                        {t('rewards.pendingApproval')}
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                          citizenshipStatus === 'ReferrerApproved'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {citizenshipStatus === 'ReferrerApproved' ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                        )}
                        {t('rewards.approved')}
                      </div>
                    </div>
                    {citizenshipStatus === 'PendingReferral' && (
                      <p className="text-sm text-muted-foreground">
                        {t('rewards.waitingReferrer')}
                      </p>
                    )}
                    {citizenshipStatus === 'ReferrerApproved' && (
                      <button
                        onClick={handleConfirmCitizenship}
                        disabled={!keypair}
                        className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90 transition-all"
                      >
                        <Check className="w-5 h-5" />
                        {t('rewards.confirmCitizenship')}
                      </button>
                    )}
                  </div>
                )}

                {/* Invite Card */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-primary" />
                    {t('rewards.inviteFriends')}
                  </h3>

                  <div className="bg-background rounded-lg p-3 mb-3">
                    <p className="text-xs text-muted-foreground mb-1">{t('rewards.yourLink')}</p>
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
                      {copied ? t('rewards.copySuccess') : t('rewards.copyLink')}
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary rounded-lg text-primary-foreground text-sm font-medium"
                    >
                      <Share2 className="w-4 h-4" />
                      {t('rewards.shareLink')}
                    </button>
                  </div>
                </div>

                {/* Score System */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    {t('rewards.scoreSystem')}
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
                        <h3 className="font-medium text-foreground">{t('rewards.activeStatus')}</h3>
                        {isActive && timeRemaining && (
                          <p className="text-xs text-green-400">
                            {t('rewards.timeRemaining', { time: timeRemaining })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      )}
                    >
                      {isActive ? t('rewards.active') : t('rewards.inactive')}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('rewards.activeDescription')}
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
                    {isActive ? t('rewards.youAreActive') : t('rewards.iAmActive')}
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
                    {t('rewards.referMoreTitle')}
                  </h4>
                  <p className="text-sm text-amber-200/80">{t('rewards.referMoreDescription')}</p>
                </div>
              </div>
            </div>

            {/* I am Active Button */}
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className={cn('w-5 h-5', isActive ? 'text-green-400' : 'text-gray-400')} />
                  <div>
                    <h3 className="font-medium text-foreground">{t('rewards.activeStatus')}</h3>
                    {isActive && timeRemaining && (
                      <p className="text-xs text-green-400">
                        {t('rewards.timeRemaining', { time: timeRemaining })}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  )}
                >
                  {isActive ? t('rewards.active') : t('rewards.inactive')}
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
                {isActive ? t('rewards.youAreActive') : t('rewards.iAmActive')}
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
                  {t('rewards.referralCount', { count: myReferrals.length })}
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
                      <p className="text-xs text-green-400">{t('rewards.kycApproved')}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-green-400 text-sm font-medium">
                        +{getPointsForPosition(index + 1)} {t('rewards.points')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t('rewards.noReferrals')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('rewards.shareYourLink')}</p>
                <button
                  onClick={handleShare}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary rounded-lg text-primary-foreground text-sm font-medium"
                >
                  <Share2 className="w-4 h-4" />
                  {t('rewards.shareLink')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scores Tab */}
        {activeTab === 'scores' && (
          <div className="p-4 space-y-4">
            {scoresLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-secondary/50 rounded-xl p-4 animate-pulse">
                    <div className="h-6 bg-secondary rounded w-1/2 mb-2" />
                    <div className="h-8 bg-secondary rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Trust Score - Main Card */}
                <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-5 text-white">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-purple-100 text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        {t('rewards.trustScore')}
                      </p>
                      <p
                        className={cn(
                          'text-5xl font-bold mt-1',
                          getScoreColor(userScores?.trustScore || 0)
                        )}
                      >
                        {userScores?.trustScore ?? 0}
                      </p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                      <Trophy className="w-8 h-8" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-100">
                      {t('rewards.rank', { rating: getScoreRating(userScores?.trustScore || 0) })}
                    </span>
                    {userScores?.isCitizen && (
                      <span className="bg-green-500/30 text-green-200 px-2 py-1 rounded-full text-xs">
                        {t('rewards.citizen')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score Components Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Staking Score */}
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-muted-foreground">{t('rewards.staking')}</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">
                      {userScores?.stakingScore ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stakingStatus?.isTracking
                        ? stakingStatus.hasCachedData
                          ? formatDuration(stakingStatus.durationBlocks)
                          : t('rewards.stakingWaitingData')
                        : t('rewards.stakingNotStarted')}
                    </p>
                  </div>

                  {/* Referral Score */}
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-muted-foreground">{t('rewards.referral')}</span>
                    </div>
                    <p className="text-2xl font-bold text-green-400">
                      {userScores?.referralScore ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('rewards.people', { count: stats?.referralCount ?? 0 })}
                    </p>
                  </div>

                  {/* Tiki Score */}
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <span className="text-xs text-muted-foreground">{t('rewards.tiki')}</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-400">
                      {userScores?.tikiScore ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t('rewards.nftRole')}</p>
                  </div>

                  {/* Perwerde Score */}
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="w-4 h-4 text-pink-400" />
                      <span className="text-xs text-muted-foreground">
                        {t('rewards.education')}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-pink-400">
                      {userScores?.perwerdeScore ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t('rewards.reading')}</p>
                  </div>
                </div>

                {/* Staking Rewards from SubQuery */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    {t('rewards.stakingRewards')}
                  </h3>

                  {/* Total Accumulated */}
                  <div className="bg-amber-500/10 rounded-lg p-3 mb-3 border border-amber-500/20">
                    <p className="text-xs text-amber-300 mb-1">{t('rewards.totalRewards')}</p>
                    <p className="text-2xl font-bold text-amber-400">
                      {stakingRewards && stakingRewards.totalAccumulatedHez > 0
                        ? `${stakingRewards.totalAccumulatedHez.toFixed(4)} HEZ`
                        : '0 HEZ'}
                    </p>
                  </div>

                  {/* Recent Rewards List */}
                  {stakingRewards && stakingRewards.rewards.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        {t('rewards.recentRewards')}
                      </p>
                      {stakingRewards.rewards.map((reward) => (
                        <div
                          key={reward.id}
                          className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'w-2 h-2 rounded-full',
                                reward.type === 'REWARD' ? 'bg-green-400' : 'bg-red-400'
                              )}
                            />
                            <div>
                              <p className="text-sm text-foreground">
                                {reward.type === 'REWARD' ? '+' : '-'}
                                {formatRewardAmount(reward.amount)} HEZ
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Block #{reward.blockNumber}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRewardDate(reward.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      {t('rewards.noRewardsYet')}
                    </p>
                  )}
                </div>

                {/* Score Formula Info */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    {t('rewards.scoreFormula')}
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>Trust = (Staking × Weighted Sum) / 100</p>
                    <p className="text-xs">
                      Weighted Sum = Staking×100 + Referral×300 + Perwerde×300 + Tiki×300
                    </p>
                    <div className="mt-3 p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      <p className="text-yellow-300 text-xs">{t('rewards.stakingZeroWarning')}</p>
                    </div>
                  </div>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={fetchUserScores}
                  disabled={scoresLoading}
                  className="w-full py-3 bg-primary rounded-lg text-primary-foreground font-medium flex items-center justify-center gap-2"
                >
                  <RefreshCw className={cn('w-4 h-4', scoresLoading && 'animate-spin')} />
                  {t('rewards.refreshScores')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Confirm Citizenship Overlay */}
      {showConfirmAnimation && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
          <KurdistanSun size={120} />
          <p className="text-white mt-6 text-lg">{t('rewards.confirmingCitizenship')}</p>
          <p className="text-white/60 text-sm mt-2">{t('rewards.signingBlockchain')}</p>
        </div>
      )}
    </div>
  );
}
