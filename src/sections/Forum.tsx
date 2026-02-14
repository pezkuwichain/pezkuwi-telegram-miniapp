/**
 * Forum Section - Community Discussions
 * Uses shared Supabase tables from pwap/web (forum_discussions, forum_categories)
 */

import { useState, useEffect } from 'react';
import {
  MessageCircle,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Clock,
  TrendingUp,
  Flame,
  RefreshCw,
  Search,
  Pin,
  Lock,
  Eye,
  AlertTriangle,
  Info,
  CheckCircle,
  Megaphone,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuth } from '@/contexts/AuthContext';
import { useForum, type ForumDiscussion, type ForumReply } from '@/hooks/useForum';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '@/i18n';

type SortBy = 'recent' | 'popular' | 'replies' | 'views';

export function ForumSection() {
  const { hapticImpact, hapticNotification, showAlert } = useTelegram();
  const { user: authUser } = useAuth();
  const { t } = useTranslation();
  // Use authenticated user ID from backend, not initDataUnsafe
  const userId = authUser?.telegram_id?.toString() || '';
  const userName = authUser?.first_name || 'Telegram User';

  const {
    announcements,
    categories,
    discussions,
    loading,
    refreshData,
    fetchReplies,
    createDiscussion,
    createReply,
    voteOnDiscussion,
    voteOnReply,
    incrementViewCount,
  } = useForum(userId);

  const [view, setView] = useState<'list' | 'thread' | 'create'>('list');
  const [selectedDiscussion, setSelectedDiscussion] = useState<ForumDiscussion | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Thread view state
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Create discussion state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newTags, setNewTags] = useState('');
  const [submittingDiscussion, setSubmittingDiscussion] = useState(false);

  const handleOpenThread = async (discussion: ForumDiscussion) => {
    hapticImpact('light');
    setSelectedDiscussion(discussion);
    setView('thread');

    // Increment view count
    await incrementViewCount(discussion.id);

    // Load replies
    setLoadingReplies(true);
    const loadedReplies = await fetchReplies(discussion.id);
    setReplies(loadedReplies);
    setLoadingReplies(false);
  };

  const handleBack = () => {
    hapticImpact('light');
    setView('list');
    setSelectedDiscussion(null);
    setReplies([]);
    setReplyText('');
  };

  const handleOpenCreate = () => {
    hapticImpact('medium');
    setView('create');
    // Set default category if available
    if (categories.length > 0 && !newCategory) {
      setNewCategory(categories[0].id);
    }
  };

  const handleCloseCreate = () => {
    hapticImpact('light');
    setView('list');
    setNewTitle('');
    setNewContent('');
    setNewTags('');
  };

  const handleVoteDiscussion = async (voteType: 'upvote' | 'downvote') => {
    if (!selectedDiscussion || !userId) {
      showAlert(t('forum.loginToVote'));
      return;
    }

    hapticImpact('light');
    try {
      await voteOnDiscussion(selectedDiscussion.id, userId, voteType);
      hapticNotification('success');

      // Update local state
      const updatedDiscussion = discussions.find((d) => d.id === selectedDiscussion.id);
      if (updatedDiscussion) {
        setSelectedDiscussion(updatedDiscussion);
      }
    } catch {
      hapticNotification('error');
      showAlert(t('forum.voteError'));
    }
  };

  const handleVoteReply = async (replyId: string, voteType: 'upvote' | 'downvote') => {
    if (!userId) {
      showAlert(t('forum.loginToVote'));
      return;
    }

    hapticImpact('light');
    try {
      await voteOnReply(replyId, userId, voteType);
      hapticNotification('success');

      // Refresh replies
      if (selectedDiscussion) {
        const loadedReplies = await fetchReplies(selectedDiscussion.id);
        setReplies(loadedReplies);
      }
    } catch {
      hapticNotification('error');
    }
  };

  const handleSubmitReply = async () => {
    if (!selectedDiscussion || !replyText.trim() || !userId) {
      showAlert(t('forum.writeReply'));
      return;
    }

    if (selectedDiscussion.is_locked) {
      showAlert(t('forum.topicLocked'));
      return;
    }

    setSubmittingReply(true);
    hapticImpact('medium');

    try {
      await createReply({
        discussion_id: selectedDiscussion.id,
        content: replyText.trim(),
        author_id: userId,
        author_name: userName,
      });

      setReplyText('');
      hapticNotification('success');

      // Refresh replies
      const loadedReplies = await fetchReplies(selectedDiscussion.id);
      setReplies(loadedReplies);
    } catch {
      hapticNotification('error');
      showAlert(t('forum.replyError'));
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleSubmitDiscussion = async () => {
    if (!newTitle.trim() || !newContent.trim() || !newCategory || !userId) {
      showAlert(t('forum.fillAllFields'));
      return;
    }

    setSubmittingDiscussion(true);
    hapticImpact('medium');

    try {
      const tags = newTags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      await createDiscussion({
        title: newTitle.trim(),
        content: newContent.trim(),
        category_id: newCategory,
        author_id: userId,
        author_name: userName,
        tags,
      });

      hapticNotification('success');
      showAlert(t('forum.topicCreated'));
      handleCloseCreate();
    } catch {
      hapticNotification('error');
      showAlert(t('forum.topicCreateError'));
    } finally {
      setSubmittingDiscussion(false);
    }
  };

  const getAnnouncementStyle = (type: string) => {
    switch (type) {
      case 'critical':
        return { icon: AlertTriangle, bgClass: 'bg-red-500/20 border-red-500/40 text-red-300' };
      case 'warning':
        return {
          icon: AlertTriangle,
          bgClass: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
        };
      case 'success':
        return { icon: CheckCircle, bgClass: 'bg-green-500/20 border-green-500/40 text-green-300' };
      default:
        return { icon: Info, bgClass: 'bg-blue-500/20 border-blue-500/40 text-blue-300' };
    }
  };

  // Filter and sort discussions
  const filteredDiscussions = discussions
    .filter((d) => {
      const matchesSearch =
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        filterCategory === 'all' || d.category?.name.toLowerCase() === filterCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return (b.upvotes || 0) - (a.upvotes || 0);
        case 'replies':
          return b.replies_count - a.replies_count;
        case 'views':
          return b.views_count - a.views_count;
        default:
          return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
      }
    });

  // Refresh selected discussion when discussions update
  const selectedDiscussionId = selectedDiscussion?.id;
  useEffect(() => {
    if (selectedDiscussionId) {
      const updated = discussions.find((d) => d.id === selectedDiscussionId);
      if (updated) {
        setSelectedDiscussion(updated);
      }
    }
  }, [discussions, selectedDiscussionId]);

  // Create Discussion View
  if (view === 'create') {
    return (
      <div className="flex flex-col h-full">
        <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm safe-area-top">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloseCreate}
                className="p-2 -ml-2 rounded-lg hover:bg-secondary"
              >
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold">{t('forum.newTopic')}</h1>
            </div>
            <button
              onClick={handleSubmitDiscussion}
              disabled={submittingDiscussion || !newTitle.trim() || !newContent.trim()}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                submittingDiscussion || !newTitle.trim() || !newContent.trim()
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-primary text-primary-foreground'
              )}
            >
              {submittingDiscussion ? t('forum.submitting') : t('forum.publish')}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">
          {/* Category */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {t('forum.category')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    hapticImpact('light');
                    setNewCategory(cat.id);
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                    newCategory === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  )}
                >
                  <span>{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {t('forum.topicTitle')}
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('forum.topicTitlePlaceholder')}
              className="w-full px-4 py-3 bg-secondary rounded-lg text-foreground"
              maxLength={200}
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">{t('forum.content')}</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t('forum.contentPlaceholder')}
              className="w-full px-4 py-3 bg-secondary rounded-lg text-foreground min-h-[200px] resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {t('forum.tagsLabel')}
            </label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder={t('forum.tagsPlaceholder')}
              className="w-full px-4 py-3 bg-secondary rounded-lg text-foreground"
            />
          </div>
        </div>
      </div>
    );
  }

  // Thread Detail View
  if (view === 'thread' && selectedDiscussion) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm safe-area-top">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-secondary">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold truncate flex-1">{selectedDiscussion.title}</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto hide-scrollbar p-4">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {selectedDiscussion.is_pinned && (
              <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                <Pin className="w-3 h-3" />
                {t('common.pinned')}
              </span>
            )}
            {selectedDiscussion.is_locked && (
              <span className="inline-flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
                <Lock className="w-3 h-3" />
                {t('common.locked')}
              </span>
            )}
            {selectedDiscussion.category && (
              <span className="inline-flex items-center gap-1 text-xs bg-secondary text-muted-foreground px-2 py-1 rounded-full">
                {selectedDiscussion.category.icon} {selectedDiscussion.category.name}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="bg-secondary/30 rounded-xl p-4 mb-4 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                {selectedDiscussion.author_name?.charAt(0) || 'A'}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {selectedDiscussion.author_name || t('common.anonymous')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(selectedDiscussion.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>

            {/* Image if exists */}
            {selectedDiscussion.image_url && (
              <div className="mb-4 rounded-lg overflow-hidden bg-secondary/50">
                <img
                  src={selectedDiscussion.image_url}
                  alt=""
                  className="w-full h-auto object-contain"
                />
              </div>
            )}

            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {selectedDiscussion.content}
            </p>

            {/* Tags */}
            {selectedDiscussion.tags && selectedDiscussion.tags.length > 0 && (
              <div className="flex gap-2 mt-4 flex-wrap">
                {selectedDiscussion.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Stats & Vote Buttons */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
              <button
                onClick={() => handleVoteDiscussion('upvote')}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  selectedDiscussion.userVote === 'upvote'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                )}
              >
                <ThumbsUp className="w-4 h-4" />
                {selectedDiscussion.upvotes || 0}
              </button>
              <button
                onClick={() => handleVoteDiscussion('downvote')}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  selectedDiscussion.userVote === 'downvote'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                )}
              >
                <ThumbsDown className="w-4 h-4" />
                {selectedDiscussion.downvotes || 0}
              </button>
              <span className="flex items-center gap-1 text-sm text-muted-foreground ml-auto">
                <MessageSquare className="w-4 h-4" />
                {selectedDiscussion.replies_count}
              </span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Eye className="w-4 h-4" />
                {selectedDiscussion.views_count}
              </span>
            </div>
          </div>

          {/* Replies Section */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {t('forum.replies')} ({replies.length})
            </h3>

            {loadingReplies ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-secondary/30 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-secondary rounded w-1/4 mb-2" />
                    <div className="h-3 bg-secondary rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : replies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('forum.noRepliesYet')}</p>
                <p className="text-xs">{t('forum.beFirstToReply')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="bg-secondary/20 rounded-xl p-3 border border-border/30"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                        {reply.author_name?.charAt(0) || 'A'}
                      </div>
                      <span className="text-sm font-medium">
                        {reply.author_name || t('common.anonymous')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
                      {reply.content}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleVoteReply(reply.id, 'upvote')}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                          reply.userVote === 'upvote'
                            ? 'bg-green-500/20 text-green-400'
                            : 'text-muted-foreground hover:bg-secondary'
                        )}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        {reply.upvotes || 0}
                      </button>
                      <button
                        onClick={() => handleVoteReply(reply.id, 'downvote')}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                          reply.userVote === 'downvote'
                            ? 'bg-red-500/20 text-red-400'
                            : 'text-muted-foreground hover:bg-secondary'
                        )}
                      >
                        <ThumbsDown className="w-3 h-3" />
                        {reply.downvotes || 0}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reply Input */}
        {!selectedDiscussion.is_locked && (
          <div className="flex-shrink-0 p-4 border-t border-border bg-background safe-area-bottom">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('forum.replyPlaceholder')}
                className="flex-1 px-4 py-2.5 bg-secondary rounded-lg text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitReply();
                  }
                }}
              />
              <button
                onClick={handleSubmitReply}
                disabled={submittingReply || !replyText.trim()}
                className={cn(
                  'p-2.5 rounded-lg transition-colors',
                  submittingReply || !replyText.trim()
                    ? 'bg-secondary text-muted-foreground'
                    : 'bg-primary text-primary-foreground'
                )}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Thread List View
  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm safe-area-top">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-blue-400" />
            </div>
            <h1 className="text-lg font-semibold">{t('forum.title')}</h1>
            <span className="text-xs text-muted-foreground">({discussions.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleOpenCreate}
              className="p-2 rounded-lg bg-primary text-primary-foreground"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                hapticImpact('light');
                refreshData();
              }}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-secondary"
            >
              <RefreshCw
                className={`w-5 h-5 text-muted-foreground ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('forum.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-secondary rounded-lg text-sm"
          />
        </div>

        {/* Sort Tabs */}
        <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
          {[
            { id: 'recent' as SortBy, icon: Clock, label: t('forum.sortRecent') },
            { id: 'popular' as SortBy, icon: TrendingUp, label: t('forum.sortPopular') },
            { id: 'replies' as SortBy, icon: MessageSquare, label: t('forum.sortReplies') },
            { id: 'views' as SortBy, icon: Eye, label: t('forum.sortViews') },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => {
                hapticImpact('light');
                setSortBy(id);
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs transition-colors',
                sortBy === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="p-4 space-y-2">
            {announcements.map((announcement) => {
              const style = getAnnouncementStyle(announcement.type);
              const Icon = style.icon;
              return (
                <div key={announcement.id} className={`rounded-xl p-3 border ${style.bgClass}`}>
                  <div className="flex items-start gap-3">
                    <Megaphone className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm">{announcement.title}</h4>
                      <p className="text-xs mt-1 opacity-90 line-clamp-2">{announcement.content}</p>
                    </div>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className="px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1">
              <button
                onClick={() => {
                  hapticImpact('light');
                  setFilterCategory('all');
                }}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors',
                  filterCategory === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                )}
              >
                {t('forum.all')}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    hapticImpact('light');
                    setFilterCategory(category.name.toLowerCase());
                  }}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors flex items-center gap-1',
                    filterCategory === category.name.toLowerCase()
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  )}
                >
                  <span>{category.icon}</span>
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Discussions List */}
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-secondary/50 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredDiscussions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 p-8 text-center">
            <MessageCircle className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{t('forum.noTopicsFound')}</p>
            <p className="text-sm text-muted-foreground/70 mb-4">{t('forum.changeFilters')}</p>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              {t('forum.createNewTopic')}
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredDiscussions.map((discussion) => (
              <button
                key={discussion.id}
                onClick={() => handleOpenThread(discussion)}
                className="w-full text-left bg-secondary/30 rounded-xl p-4 border border-border/50 hover:bg-secondary/50 transition-colors"
              >
                {/* Badges */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {discussion.is_pinned && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                      <Pin className="w-2.5 h-2.5" />
                      {t('common.pinned')}
                    </span>
                  )}
                  {discussion.is_locked && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      <Lock className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {discussion.category && (
                    <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">
                      {discussion.category.icon} {discussion.category.name}
                    </span>
                  )}
                  {(discussion.upvotes || 0) > 10 && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                      <Flame className="w-2.5 h-2.5" />
                      {t('common.trending')}
                    </span>
                  )}
                </div>

                {/* Image thumbnail if exists */}
                {discussion.image_url && (
                  <div className="mb-2 rounded-lg overflow-hidden bg-secondary/50">
                    <img
                      src={discussion.image_url}
                      alt=""
                      className="w-full h-auto object-contain max-h-40"
                    />
                  </div>
                )}

                {/* Title */}
                <h3 className="font-medium text-foreground mb-1 line-clamp-2">
                  {discussion.title}
                </h3>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>{discussion.author_name || t('common.anonymous')}</span>
                  <span>
                    {formatDistanceToNow(new Date(discussion.last_activity_at), {
                      addSuffix: true,
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="w-3 h-3" />
                    {(discussion.upvotes || 0) - (discussion.downvotes || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {discussion.replies_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {discussion.views_count}
                  </span>
                </div>

                {/* Tags */}
                {discussion.tags && discussion.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {discussion.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] text-cyan-400">
                        #{tag}
                      </span>
                    ))}
                    {discussion.tags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{discussion.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
