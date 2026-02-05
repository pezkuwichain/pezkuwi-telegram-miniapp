import { useState } from 'react';
import { X, ExternalLink, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface P2PModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenP2P: () => void;
}

type Language = 'en' | 'ckb' | 'ku' | 'tr';

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ckb', label: 'سۆرانی' },
  { code: 'ku', label: 'Kurmancî' },
  { code: 'tr', label: 'TR' },
];

const CONTENT: Record<
  Language,
  {
    title: string;
    subtitle: string;
    firstTime: string;
    steps: string[];
    note: string;
    button: string;
  }
> = {
  en: {
    title: 'P2P Exchange',
    subtitle: 'Trade crypto peer-to-peer',
    firstTime: 'First time using P2P?',
    steps: [
      'Click the button below to open the web app',
      'Create an account or log in',
      'Complete the P2P setup process',
      'After setup, you can access P2P directly',
    ],
    note: 'The web app will open in a new window. Complete the registration process there.',
    button: 'Open P2P Platform',
  },
  ckb: {
    title: 'P2P ئاڵۆگۆڕ',
    subtitle: 'ئاڵۆگۆڕی کریپتۆ لە نێوان کەسەکاندا',
    firstTime: 'یەکەم جار P2P بەکاردەهێنیت؟',
    steps: [
      'کلیک لە دوگمەی خوارەوە بکە بۆ کردنەوەی ماڵپەڕ',
      'هەژمارێک دروست بکە یان بچۆ ژوورەوە',
      'پرۆسەی دامەزراندنی P2P تەواو بکە',
      'دوای دامەزراندن، دەتوانیت ڕاستەوخۆ بچیتە P2P',
    ],
    note: 'ماڵپەڕ لە پەنجەرەیەکی نوێ دەکرێتەوە. پرۆسەی تۆمارکردن لەوێ تەواو بکە.',
    button: 'کردنەوەی P2P',
  },
  ku: {
    title: 'P2P Danûstandin',
    subtitle: 'Danûstandina krîpto di navbera kesan de',
    firstTime: 'Cara yekem P2P bikar tînin?',
    steps: [
      'Li bişkoja jêrîn bikirtînin da ku malpera webê vebike',
      'Hesabek çêbikin an têkevin',
      'Pêvajoya sazkirina P2P temam bikin',
      'Piştî sazkirinê, hûn dikarin rasterast bigihîjin P2P',
    ],
    note: 'Malpera webê di pencereyek nû de vedibe. Pêvajoya qeydkirinê li wir temam bikin.',
    button: 'P2P Veke',
  },
  tr: {
    title: 'P2P Borsa',
    subtitle: 'Kullanıcılar arası kripto alım satım',
    firstTime: "P2P'yi ilk kez mi kullanıyorsunuz?",
    steps: [
      'Web uygulamasını açmak için aşağıdaki butona tıklayın',
      'Hesap oluşturun veya giriş yapın',
      'P2P kurulum sürecini tamamlayın',
      "Kurulumdan sonra P2P'ye doğrudan erişebilirsiniz",
    ],
    note: 'Web uygulaması yeni bir pencerede açılacak. Kayıt işlemini orada tamamlayın.',
    button: 'P2P Platformunu Aç',
  },
};

export function P2PModal({ isOpen, onClose, onOpenP2P }: P2PModalProps) {
  const [lang, setLang] = useState<Language>('en');
  const content = CONTENT[lang];
  const isRTL = lang === 'ckb';

  if (!isOpen) return null;

  const handleOpenP2P = () => {
    onOpenP2P();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={cn(
          'relative w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{content.title}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Language Selector */}
        <div className="flex gap-2 p-4 pb-0">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                lang === l.code
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{content.subtitle}</p>

          {/* First Time Info */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-400">{content.firstTime}</p>
                <ol className="space-y-1.5">
                  {content.steps.map((step, i) => (
                    <li key={i} className="text-xs text-amber-200/80 flex gap-2">
                      <span className="font-semibold text-amber-400">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Note */}
          <p className="text-xs text-muted-foreground">{content.note}</p>
        </div>

        {/* Action Button */}
        <div className="p-4 pt-0">
          <button
            onClick={handleOpenP2P}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-xl transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            {content.button}
          </button>
        </div>
      </div>
    </div>
  );
}
