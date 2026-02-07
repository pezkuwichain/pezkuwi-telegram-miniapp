import {
  Megaphone,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  ExternalLink,
  Calendar,
  Eye,
} from 'lucide-react';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import { useTelegram } from '@/hooks/useTelegram';
import { useAnnouncements, useAnnouncementReaction } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

export function AnnouncementsSection() {
  const { hapticImpact, hapticNotification, openLink } = useTelegram();
  const { isAuthenticated, sessionToken, user, authError } = useAuth();

  const { data: announcements, isLoading, refetch, isRefetching } = useAnnouncements();
  const reactionMutation = useAnnouncementReaction(sessionToken);

  // Debug: Log auth state
  console.warn('[Announcements] Auth state:', {
    isAuthenticated,
    hasSessionToken: !!sessionToken,
    user: user?.first_name,
    authError,
  });

  const handleReaction = (id: string, reaction: 'like' | 'dislike') => {
    if (!isAuthenticated) {
      hapticNotification('error');
      // Show alert or toast here if UI library allows, for now using browser alert for clarity in dev
      // In production better to use a Toast component
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Ji bo dengdanê divê tu têketî bî');
      } else {
        window.alert('Ji bo dengdanê divê tu têketî bî');
      }
      return;
    }
    hapticImpact('light');
    reactionMutation.mutate(
      { announcementId: id, reaction },
      { onSuccess: () => hapticNotification('success') }
    );
  };

  const handleRefresh = () => {
    hapticImpact('medium');
    refetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold">Ragihandin</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <RefreshCw
              className={cn('w-5 h-5 text-muted-foreground', isRefetching && 'animate-spin')}
            />
          </button>
        </div>
      </header>

      {/* Debug Banner - Remove after fixing */}
      <div className="bg-yellow-500/20 text-yellow-300 text-xs p-2 mx-4 mt-2 rounded break-all">
        <div>
          Auth: {isAuthenticated ? 'YES' : 'NO'} | Token: {sessionToken ? 'YES' : 'NO'} | User:{' '}
          {user?.first_name || 'null'}
        </div>
        <div>Err: {authError || 'none'}</div>
        <div>
          TG: {window.Telegram?.WebApp ? 'YES' : 'NO'} | initData:{' '}
          {window.Telegram?.WebApp?.initData
            ? window.Telegram.WebApp.initData.length + ' chars'
            : 'EMPTY'}
        </div>
        <div>
          Platform: {window.Telegram?.WebApp?.platform || 'unknown'} | Ver:{' '}
          {window.Telegram?.WebApp?.version || '?'}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-secondary/50 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-secondary rounded w-3/4 mb-3" />
                <div className="h-3 bg-secondary rounded w-full mb-2" />
                <div className="h-3 bg-secondary rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {announcements?.map((announcement) => (
              <article
                key={announcement.id}
                className="bg-secondary/30 rounded-xl overflow-hidden border border-border/50"
              >
                {/* Image */}
                {announcement.image_url && (
                  <div className="overflow-hidden bg-secondary/50">
                    <img
                      src={announcement.image_url}
                      alt=""
                      className="w-full h-auto object-contain"
                    />
                  </div>
                )}

                <div className="p-4">
                  {/* Title */}
                  <h2 className="font-semibold text-foreground mb-2 leading-tight">
                    {announcement.title}
                  </h2>

                  {/* Content */}
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                    {announcement.content}
                  </p>

                  {/* Link */}
                  {announcement.link_url && (
                    <button
                      onClick={() => openLink(announcement.link_url as string)}
                      className="flex items-center gap-1.5 text-sm text-primary mb-3 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Zêdetir bixwîne
                    </button>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(announcement.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {formatNumber(announcement.views)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                    <button
                      onClick={() => handleReaction(announcement.id, 'like')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        announcement.user_reaction === 'like'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                      )}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      {formatNumber(announcement.likes)}
                    </button>
                    <button
                      onClick={() => handleReaction(announcement.id, 'dislike')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        announcement.user_reaction === 'dislike'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                      )}
                    >
                      <ThumbsDown className="w-4 h-4" />
                      {formatNumber(announcement.dislikes)}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
