import { ExternalLink } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

interface SocialLink {
  name: string;
  url: string;
  icon: string;
  color: string;
  description: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/pezkuwichain',
    icon: '📸',
    color: 'from-pink-500 to-purple-600',
    description: 'Wêne û Story',
  },
  {
    name: 'TikTok',
    url: 'https://www.tiktok.com/@pezkuwi.chain',
    icon: '🎵',
    color: 'from-gray-800 to-gray-900',
    description: 'Vîdyoyên kurt',
  },
  {
    name: 'Snapchat',
    url: 'https://www.snapchat.com/add/pezkuwichain',
    icon: '👻',
    color: 'from-yellow-400 to-yellow-500',
    description: 'Snap bike!',
  },
  {
    name: 'Telegram',
    url: 'https://t.me/pezkuwichain',
    icon: '📢',
    color: 'from-blue-400 to-blue-600',
    description: 'Kanala fermî',
  },
  {
    name: 'X (Twitter)',
    url: 'https://x.com/pezkuwichain',
    icon: '𝕏',
    color: 'from-gray-700 to-gray-900',
    description: 'Nûçeyên rojane',
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/@SatoshiQazi',
    icon: '▶️',
    color: 'from-red-500 to-red-700',
    description: 'Vîdyoyên me',
  },
  {
    name: 'Facebook',
    url: 'https://www.facebook.com/people/Pezkuwi-Chain/61587122224932/',
    icon: '📘',
    color: 'from-blue-600 to-blue-800',
    description: 'Rûpela fermî',
  },
  {
    name: 'Discord',
    url: 'https://discord.gg/Y3VyEC6h8W',
    icon: '💬',
    color: 'from-indigo-500 to-purple-600',
    description: 'Civaka me',
  },
];

export function SocialLinks() {
  const { openLink, hapticImpact } = useTelegram();

  const handleClick = (url: string) => {
    hapticImpact('light');
    openLink(url);
  };

  return (
    <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
      <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
        <ExternalLink className="w-4 h-4 text-primary" />
        Me bişopîne
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Bi me re têkiliyê ragire û nûçeyên herî dawî bistîne!
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SOCIAL_LINKS.map((link) => (
          <button
            key={link.name}
            onClick={() => handleClick(link.url)}
            className={`
              flex items-center gap-3 p-3 rounded-xl
              bg-gradient-to-r ${link.color} bg-opacity-10
              hover:opacity-90 transition-opacity
              border border-white/10
            `}
          >
            <span className="text-2xl">{link.icon}</span>
            <div className="text-left">
              <p className="text-sm font-medium text-white">{link.name}</p>
              <p className="text-xs text-white/70">{link.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
