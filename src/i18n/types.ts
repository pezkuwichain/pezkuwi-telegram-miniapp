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
    referralInstruction: string;
    copyAlert: string;
    referralCount: string;
    noReferrals: string;
    shareYourLink: string;
    trustScore: string;
    rank: string;
    citizen: string;
    staking: string;
    stakingNotStarted: string;
    stakingWaitingData: string;
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
    citizenshipStatus: string;
    pendingApproval: string;
    approved: string;
    waitingReferrer: string;
    confirmCitizenship: string;
    confirmingCitizenship: string;
    signingBlockchain: string;
    citizenshipConfirmed: string;
    citizenshipFailed: string;
    startTracking: string;
    startTrackingDesc: string;
    startingTracking: string;
    trackingStarted: string;
    trackingFailed: string;
    recordTrustScore: string;
    recordTrustDesc: string;
    recordingTrustScore: string;
    trustScoreRecorded: string;
    trustScoreRecordFailed: string;
    citizenCountTitle: string;
    citizenCountDesc: string;
    beCitizen: string;
    pezRewardsTitle: string;
    epoch: string;
    claimPeriod: string;
    epochClosed: string;
    epochOpen: string;
    scoreRecorded: string;
    claimablePez: string;
    claim: string;
    claimAll: string;
    claimPez: string;
    claimingReward: string;
    claimSuccess: string;
    claimFailed: string;
    noPezRewards: string;
    unclaimedRewards: string;
    claimStakingReward: string;
    claimAllStaking: string;
    claimingStakingReward: string;
    stakingClaimSuccess: string;
    stakingClaimFailed: string;
    noUnclaimedRewards: string;
    rewardHistory: string;
    era: string;
    pendingApprovals: string;
    approveReferral: string;
    approvingReferral: string;
    referralApprovalSuccess: string;
    referralApprovalFailed: string;
    pendingReferralStatus: string;
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

  // P2P Section
  p2p: {
    title: string;
    subtitle: string;
    firstTime: string;
    steps: string[];
    note: string;
    button: string;
    // Tabs
    buy: string;
    sell: string;
    myAds: string;
    myTrades: string;
    // Balance
    internalBalance: string;
    available: string;
    locked: string;
    totalBalance: string;
    noBalance: string;
    // Offers
    createOffer: string;
    acceptOffer: string;
    confirmAccept: string;
    noOffers: string;
    filters: string;
    allTokens: string;
    allCurrencies: string;
    prev: string;
    next: string;
    min: string;
    max: string;
    trades: string;
    // Offer form
    token: string;
    fiatCurrency: string;
    pricePerUnit: string;
    amount: string;
    fiatTotal: string;
    paymentMethod: string;
    selectPaymentMethod: string;
    paymentDetails: string;
    paymentDetailsPlaceholder: string;
    minOrder: string;
    maxOrder: string;
    timeLimit: string;
    minutes: string;
    insufficientBalance: string;
    timeLimitWarning: string;
    // Trade
    tradeDetails: string;
    tradeNotFound: string;
    role: string;
    buyer: string;
    seller: string;
    cryptoAmount: string;
    fiatAmount: string;
    timeline: string;
    tradeCreated: string;
    paymentSent: string;
    paymentConfirmed: string;
    tradeCompleted: string;
    timeRemaining: string;
    expired: string;
    // Trade actions
    markPaid: string;
    confirmReceived: string;
    cancelTrade: string;
    // Status
    status: {
      open: string;
      paused: string;
      locked: string;
      completed: string;
      cancelled: string;
      pending: string;
      payment_sent: string;
      disputed: string;
      refunded: string;
    };
    // Chat
    chat: string;
    noMessages: string;
    messagePlaceholder: string;
    // Dispute
    openDispute: string;
    disputeWarning: string;
    disputeCategory: string;
    selectCategory: string;
    disputeReason: string;
    disputeReasonPlaceholder: string;
    minChars: string;
    submitDispute: string;
    dispute: {
      payment_not_received: string;
      wrong_amount: string;
      fake_payment_proof: string;
      other: string;
    };
    // Deposit / Withdraw
    deposit: string;
    withdraw: string;
    platformWallet: string;
    txHash: string;
    txHashPlaceholder: string;
    blockNumber: string;
    optional: string;
    verifyDeposit: string;
    verifying: string;
    verifyingDesc: string;
    depositSuccess: string;
    depositFailed: string;
    depositInstructions: string;
    depositInvalidAmount: string;
    depositSending: string;
    depositSendingDesc: string;
    walletNotConnected: string;
    connectWalletFirst: string;
    selectToken: string;
    withdrawAmount: string;
    networkFee: string;
    netAmount: string;
    withdrawSuccess: string;
    withdrawProcessing: string;
    withdrawing: string;
    minWithdraw: string;
    maxAvailable: string;
    walletAddress: string;
    // No data
    noTrades: string;
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

  // Dashboard (WalletDashboard main view)
  dashboard: {
    connected: string;
    send: string;
    receive: string;
    presaleMessage: string;
    depositUsdt: string;
    depositUsdtDesc: string;
    recentActivity: string;
    history: string;
    refreshTx: string;
    loadingTx: string;
    noRecentTx: string;
    historyAppears: string;
    sent: string;
    received: string;
    selectStaking: string;
    validatorNominate: string;
    trustScorePlus: string;
    lpStakeDesc: string;
    pezRewardPlus: string;
    goBack: string;
    stakedNote: string;
  };

  // Send Tab
  send: {
    back: string;
    selectToken: string;
    whichToken: string;
    someChainNotConnected: string;
    transferSuccess: string;
    wasSent: string;
    done: string;
    sendToken: string;
    changeToken: string;
    recipientAddress: string;
    scanQr: string;
    scanQrText: string;
    qrNotAvailable: string;
    invalidAddress: string;
    amount: string;
    balanceLabel: string;
    sending: string;
    sendButton: string;
    walletNotReady: string;
    selectTokenFirst: string;
    fillAddressAndAmount: string;
    insufficientBalance: string;
    mainnetApiNotReady: string;
    assetHubApiNotReady: string;
    transferFailed: string;
  };

  // Receive Tab
  receive: {
    title: string;
    back: string;
    qrFailed: string;
    shareAddress: string;
    addressCopied: string;
    copyAddress: string;
  };

  // History Tab
  history: {
    title: string;
    back: string;
    loadingTx: string;
    noTransactions: string;
    historyAppears: string;
    sent: string;
    received: string;
    to: string;
    from: string;
  };

  // Swap Modal
  swap: {
    title: string;
    fromLabel: string;
    toLabel: string;
    exchangeRate: string;
    noPool: string;
    swapping: string;
    noPoolButton: string;
    swapButton: string;
    swapFailed: string;
    swapSuccess: string;
    balanceLabel: string;
    insufficientBalance: string;
  };

  // Pools Modal
  pools: {
    title: string;
    connectionError: string;
    loadingPools: string;
    noPools: string;
    back: string;
    addLiquidity: string;
    removeLiquidity: string;
    yourPosition: string;
    addButton: string;
    removeButton: string;
    reserve: string;
    lpBalance: string;
    lpTokenAmount: string;
    amountAuto: string;
    adding: string;
    removing: string;
    addFailed: string;
    removeFailed: string;
    invalidLpAmount: string;
    estimatedReturn: string;
    success: string;
    addedLiquidity: string;
    removedLiquidity: string;
  };

  // HEZ Staking Modal
  staking: {
    palletNotFound: string;
    fetchError: string;
    statusTab: string;
    bondTab: string;
    nominateTab: string;
    unbondTab: string;
    activeStake: string;
    totalBonded: string;
    nominations: string;
    rewardDestination: string;
    unbondingChunks: string;
    nominatedValidators: string;
    stakingTip: string;
    notStakedYet: string;
    stakeForTrustScore: string;
    startStaking: string;
    yourBalance: string;
    currentlyStaked: string;
    amountHez: string;
    bondWarning: string;
    bonding: string;
    bondExtra: string;
    bondButton: string;
    bondFirst: string;
    selectValidators: string;
    commission: string;
    nominating: string;
    nominateButton: string;
    notStakedUnbond: string;
    unbondWarning: string;
    unbondProcessing: string;
    unbondButton: string;
    bondSuccess: string;
    nominateSuccess: string;
    unbondSuccess: string;
    bondFailed: string;
    nominateFailed: string;
    unbondFailed: string;
  };

  // LP Staking Modal
  lpStaking: {
    palletNotReady: string;
    poolsNotLoaded: string;
    noPoolsYet: string;
    selectPool: string;
    totalStaked: string;
    youStaked: string;
    lpBalance: string;
    reward: string;
    stakeTab: string;
    unstakeTab: string;
    rewardTab: string;
    amount: string;
    balanceLabel: string;
    stakedLabel: string;
    staking: string;
    stakeButton: string;
    unstaking: string;
    unstakeButton: string;
    pendingRewards: string;
    claiming: string;
    claimButton: string;
    stakeFailed: string;
    stakeSuccess: string;
    unstakeFailed: string;
    unstakeSuccess: string;
    claimFailed: string;
    claimSuccess: string;
  };

  // Fund Fees Modal
  fees: {
    title: string;
    subtitle: string;
    success: string;
    sentTo: string;
    failed: string;
    tryAgain: string;
    targetChain: string;
    forTransfers: string;
    forIdentity: string;
    minRecommended: string;
    amountHez: string;
    signing: string;
    xcmTeleportPending: string;
    signingButton: string;
    processing: string;
    sendTo: string;
    walletNotConnected: string;
    apiNotConnected: string;
    enterValidAmount: string;
    chainNotConnected: string;
    insufficientBalance: string;
    xcmPalletNotFound: string;
    teleportFailed: string;
    errorOccurred: string;
  };

  // Tokens Card
  tokens: {
    searchPlaceholder: string;
    addToken: string;
    assetIdPlaceholder: string;
    cancel: string;
    add: string;
    blockchainConnected: string;
    connectingBlockchain: string;
    connectingRpc: string;
    tokenNotFound: string;
    total: string;
    loadingBalance: string;
  };

  // Error messages (error-tracking.ts)
  errors: {
    networkError: string;
    timeout: string;
    walletNotFound: string;
    wrongPassword: string;
    default: string;
  };

  // Password validation (crypto.ts)
  validation: {
    minLength: string;
    needLowercase: string;
    needUppercase: string;
    needNumber: string;
    needSpecialChar: string;
    weakPassword: string;
  };

  // Time formatting (utils.ts)
  time: {
    now: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
  };

  // Context messages (WalletContext, ReferralContext, wallet-storage)
  context: {
    walletInitFailed: string;
    rpcDisconnected: string;
    pleaseLoginFirst: string;
    invalidSeedPhrase: string;
    connectionFailed: string;
    referralStatsError: string;
    referralApproved: string;
    wrongPasswordError: string;
    walletSyncFailed: string;
  };

  // Explorer page
  explorer: {
    title: string;
    subtitle: string;
    search: string;
    chainStats: string;
    latestBlocks: string;
    recentTransfers: string;
    block: string;
    validators: string;
    era: string;
    blockTime: string;
    extrinsics: string;
    noResults: string;
    connecting: string;
    hash: string;
    from: string;
    to: string;
    amount: string;
    time: string;
    balance: string;
    seconds: string;
    finalized: string;
    searchResult: string;
  };

  // Citizen page
  citizen: {
    pageTitle: string;
    // Form labels
    fullName: string;
    fullNamePlaceholder: string;
    fatherName: string;
    fatherNamePlaceholder: string;
    grandfatherName: string;
    grandfatherNamePlaceholder: string;
    motherName: string;
    motherNamePlaceholder: string;
    tribe: string;
    tribePlaceholder: string;
    maritalStatus: string;
    married: string;
    single: string;
    childrenCount: string;
    childName: string;
    childNamePlaceholder: string;
    childBirthYear: string;
    addChild: string;
    removeChild: string;
    region: string;
    regionPlaceholder: string;
    regionBakur: string;
    regionBasur: string;
    regionRojava: string;
    regionRojhelat: string;
    regionKurdistanASor: string;
    regionDiaspora: string;
    email: string;
    emailPlaceholder: string;
    profession: string;
    professionPlaceholder: string;
    referrerAddress: string;
    referrerPlaceholder: string;
    // Consent
    consentCheckbox: string;
    // Buttons
    submit: string;
    sign: string;
    openApp: string;
    // Processing
    preparingData: string;
    readyToSign: string;
    signingTx: string;
    // Application submitted
    applicationSubmitted: string;
    pendingReferral: string;
    identityHash: string;
    walletAddress: string;
    applicationInfo: string;
    depositRequired: string;
    // Privacy & Seed phrase
    privacyNotice: string;
    seedPhrase: string;
    seedPhrasePlaceholder: string;
    invalidSeedPhrase: string;
    // Processing
    connectingChain: string;
    // Success - next steps
    stepApplicationSent: string;
    stepReferrerApproval: string;
    stepConfirm: string;
    nextStepsInfo: string;
    // Errors
    fillAllFields: string;
    acceptConsent: string;
    walletNotConnected: string;
    peopleChainNotConnected: string;
    submissionFailed: string;
    alreadyPending: string;
    alreadyApproved: string;
    insufficientBalance: string;
    // In-app modal
    applyingCitizenship: string;
    applicationSuccess: string;
    // Language selector
    selectLanguage: string;
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
