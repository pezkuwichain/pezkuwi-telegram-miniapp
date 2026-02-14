export interface Translations {
  // Navigation
  nav: {
    announcements: string;
    forum: string;
    rewards: string;
    p2p: string;
    wallet: string;
  };

  // Common
  common: {
    back: string;
    cancel: string;
    continue: string;
    close: string;
    copy: string;
    copied: string;
    share: string;
    refresh: string;
    retry: string;
    loading: string;
    error: string;
    anonymous: string;
    pinned: string;
    locked: string;
    trending: string;
  };

  // Announcements section
  announcements: {
    title: string;
    readMore: string;
    reactionAuthRequired: string;
  };

  // Forum section
  forum: {
    title: string;
    newTopic: string;
    submitting: string;
    publish: string;
    category: string;
    topicTitle: string;
    topicTitlePlaceholder: string;
    content: string;
    contentPlaceholder: string;
    tagsLabel: string;
    tagsPlaceholder: string;
    searchPlaceholder: string;
    sortRecent: string;
    sortPopular: string;
    sortReplies: string;
    sortViews: string;
    all: string;
    replies: string;
    noRepliesYet: string;
    beFirstToReply: string;
    replyPlaceholder: string;
    noTopicsFound: string;
    changeFilters: string;
    createNewTopic: string;
    loginToVote: string;
    voteError: string;
    writeReply: string;
    topicLocked: string;
    replyError: string;
    fillAllFields: string;
    topicCreated: string;
    topicCreateError: string;
  };

  // Rewards section
  rewards: {
    title: string;
    subtitle: string;
    connectWalletFirst: string;
    overview: string;
    referral: string;
    scores: string;
    referralScore: string;
    maxScore: string;
    referMoreTitle: string;
    referMoreDescription: string;
    kycApproved: string;
    referrer: string;
    none: string;
    invitedMe: string;
    pendingReferral: string;
    completeKyc: string;
    inviteFriends: string;
    yourLink: string;
    copySuccess: string;
    copyLink: string;
    shareLink: string;
    scoreSystem: string;
    activeStatus: string;
    timeRemaining: string;
    active: string;
    inactive: string;
    activeDescription: string;
    youAreActive: string;
    iAmActive: string;
    activatedAlert: string;
    shareText: string;
    copyAlert: string;
    referralCount: string;
    noReferrals: string;
    shareYourLink: string;
    trustScore: string;
    rank: string;
    citizen: string;
    staking: string;
    stakingNotStarted: string;
    stakingCountedInTrust: string;
    people: string;
    tiki: string;
    nftRole: string;
    education: string;
    reading: string;
    stakingRewards: string;
    totalRewards: string;
    recentRewards: string;
    noRewardsYet: string;
    scoreFormula: string;
    stakingZeroWarning: string;
    refreshScores: string;
    points: string;
  };

  // Wallet section
  wallet: {
    title: string;
    authFailed: string;
    authDescription: string;
    retry: string;
  };

  // Wallet Setup
  walletSetup: {
    officialWallet: string;
    createNew: string;
    createNewDesc: string;
    importWallet: string;
    importWalletDesc: string;
    securityNote: string;
  };

  // Wallet Create
  walletCreate: {
    setPassword: string;
    passwordDescription: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    passwordRequirements: string;
    ruleMinLength: string;
    ruleLowercase: string;
    ruleUppercase: string;
    ruleNumber: string;
    ruleSpecialChar: string;
    rulePasswordsMatch: string;
    walletServiceNotReady: string;
    passwordRequirementsNotMet: string;
    walletCreationFailed: string;
    preparing: string;
    creating: string;
    meetPasswordRequirements: string;
    backupTitle: string;
    backupDescription: string;
    backupWarning: string;
    copiedMnemonic: string;
    copyMnemonic: string;
    conditionWrittenDown: string;
    conditionNeverShare: string;
    conditionLossRisk: string;
    acceptAllConditions: string;
    verifyWords: string;
    reset: string;
    verifyDescription: string;
    dropWordsHere: string;
    wrongOrder: string;
    saving: string;
    verify: string;
    wordsCount: string;
    walletCreated: string;
    walletReady: string;
    yourAddress: string;
    getStarted: string;
  };

  // Wallet Import
  walletImport: {
    title: string;
    description: string;
    seedPhraseLabel: string;
    seedPhrasePlaceholder: string;
    wordsCount: string;
    newPassword: string;
    seedPhraseInvalid: string;
    passwordInvalid: string;
    passwordsMismatch: string;
    importFailed: string;
    importing: string;
    importButton: string;
  };

  // Wallet Connect
  walletConnect: {
    deleteTitle: string;
    deleteDescription: string;
    deleteButton: string;
    openWallet: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    enterPassword: string;
    wrongPassword: string;
    connecting: string;
    connect: string;
    deleteWalletLink: string;
  };

  // Deposit USDT Modal
  deposit: {
    title: string;
    subtitle: string;
    depositHistory: string;
    noDeposits: string;
    goBack: string;
    selectNetwork: string;
    recommended: string;
    warning: string;
    example: string;
    acceptTrc20: string;
    important: string;
    minimum: string;
    memoRequired: string;
    onlyUsdt: string;
    trc20Fee: string;
    depositAddress: string;
    notAvailable: string;
    memoLabel: string;
    memoWarning: string;
    uniqueAddress: string;
    howToDeposit: string;
    stepCopyAddress: string;
    stepCopyMemo: string;
    stepOpenTon: string;
    stepOpenPolkadot: string;
    stepOpenTrc20: string;
    stepSendUsdt: string;
    stepReceive: string;
    processingTime: string;
    copyFailed: string;
    statusPending: string;
    statusConfirming: string;
    statusCompleted: string;
    statusFailed: string;
    statusExpired: string;
    viewTx: string;
    trc20FeeWarning: string;
  };

  // P2P Modal
  p2p: {
    title: string;
    subtitle: string;
    firstTime: string;
    steps: string[];
    note: string;
    button: string;
  };

  // Update Notification
  update: {
    newVersion: string;
    description: string;
    later: string;
    updateNow: string;
  };

  // Social Links
  social: {
    followUs: string;
    stayConnected: string;
    instagram: string;
    tiktok: string;
    snapchat: string;
    telegram: string;
    twitter: string;
    youtube: string;
    facebook: string;
    discord: string;
  };

  // Error Boundary
  errorBoundary: {
    title: string;
    description: string;
    retry: string;
  };

  // Loading Screen
  loadingScreen: {
    loading: string;
  };
}

export type LanguageCode = 'krd' | 'en' | 'tr' | 'ckb' | 'fa' | 'ar';

export const VALID_LANGS: LanguageCode[] = ['krd', 'en', 'tr', 'ckb', 'fa', 'ar'];
export const DEFAULT_LANG: LanguageCode = 'krd';
export const RTL_LANGUAGES: LanguageCode[] = ['ckb', 'fa', 'ar'];

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  krd: 'Kurmancî',
  en: 'English',
  tr: 'Türkçe',
  ckb: 'سۆرانی',
  fa: 'فارسی',
  ar: 'العربية',
};
