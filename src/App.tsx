import { useState, lazy, Suspense } from 'react';
import { Megaphone, MessageCircle, Gift, Wallet, Loader2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UpdateNotification } from '@/components/UpdateNotification';
import { useTranslation } from '@/i18n';

// Lazy load sections for code splitting
const AnnouncementsSection = lazy(() =>
  import('@/sections/Announcements').then((m) => ({ default: m.AnnouncementsSection }))
);
const ForumSection = lazy(() =>
  import('@/sections/Forum').then((m) => ({ default: m.ForumSection }))
);
const RewardsSection = lazy(() =>
  import('@/sections/Rewards').then((m) => ({ default: m.RewardsSection }))
);
const WalletSection = lazy(() =>
  import('@/sections/Wallet').then((m) => ({ default: m.WalletSection }))
);
const P2PSection = lazy(() =>
  import('@/sections/P2P').then((m) => ({ default: m.P2PSection }))
);
const CitizenPage = lazy(() =>
  import('@/pages/CitizenPage').then((m) => ({ default: m.CitizenPage }))
);
const ExplorerPage = lazy(() =>
  import('@/pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage }))
);

// Loading fallback component
function SectionLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}

type Section = 'announcements' | 'forum' | 'rewards' | 'p2p' | 'wallet';

interface NavItem {
  id: Section;
  icon: typeof Megaphone;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'announcements', icon: Megaphone, labelKey: 'nav.announcements' },
  { id: 'forum', icon: MessageCircle, labelKey: 'nav.forum' },
  { id: 'rewards', icon: Gift, labelKey: 'nav.rewards' },
  { id: 'p2p', icon: ArrowLeftRight, labelKey: 'nav.p2p' },
  { id: 'wallet', icon: Wallet, labelKey: 'nav.wallet' },
];

// Check for standalone pages via URL query params or path (evaluated once at module level)
const PAGE_PARAM = new URLSearchParams(window.location.search).get('page');
const IS_CITIZEN_PAGE = PAGE_PARAM === 'citizen' || window.location.pathname === '/citizens';
const IS_EXPLORER_PAGE = window.location.pathname.replace(/\/$/, '') === '/explorer';

export default function App() {
  if (IS_CITIZEN_PAGE) {
    return (
      <Suspense fallback={<SectionLoader />}>
        <CitizenPage />
      </Suspense>
    );
  }

  if (IS_EXPLORER_PAGE) {
    return (
      <Suspense fallback={<SectionLoader />}>
        <ExplorerPage />
      </Suspense>
    );
  }

  return <MainApp />;
}

function MainApp() {
  const [activeSection, setActiveSection] = useState<Section>('announcements');
  const { t } = useTranslation();

  const handleNavClick = (item: NavItem) => {
    window.Telegram?.WebApp.HapticFeedback.selectionChanged();
    setActiveSection(item.id);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Content Area */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full animate-in">
          <Suspense fallback={<SectionLoader />}>
            {activeSection === 'announcements' && <AnnouncementsSection />}
            {activeSection === 'forum' && <ForumSection />}
            {activeSection === 'rewards' && <RewardsSection />}
            {activeSection === 'p2p' && <P2PSection />}
            {activeSection === 'wallet' && <WalletSection />}
          </Suspense>
        </div>
      </main>

      {/* Update Notification */}
      <UpdateNotification />

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 bg-secondary/50 backdrop-blur-lg border-t border-border safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={cn(
                  'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  item.id === 'p2p' && !isActive && 'text-cyan-400 hover:text-cyan-300'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'scale-110')} />
                <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
