import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  DbUser,
  DbAnnouncementWithAuthor,
  DbThreadWithAuthor,
  DbReplyWithAuthor,
  ThreadCounters,
  ReplyCounters,
} from '@/types/database';

// ==================== PUBLIC TYPES ====================

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  is_admin: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  author_id: string;
  likes: number;
  dislikes: number;
  views: number;
  created_at: string;
  author: { username: string | null; first_name: string; photo_url: string | null } | null;
  user_reaction: 'like' | 'dislike' | null;
}

export interface Thread {
  id: string;
  title: string;
  content: string;
  author_id: string;
  reply_count: number;
  likes: number;
  views: number;
  last_activity: string;
  created_at: string;
  author: { username: string | null; first_name: string; photo_url: string | null } | null;
  user_liked: boolean;
}

export interface Reply {
  id: string;
  thread_id: string;
  content: string;
  author_id: string;
  likes: number;
  created_at: string;
  author: { username: string | null; first_name: string; photo_url: string | null } | null;
  user_liked: boolean;
}

// ==================== HELPER TYPES ====================

interface ReactionRecord {
  announcement_id: string;
  reaction: 'like' | 'dislike';
}

interface ThreadLikeRecord {
  thread_id: string;
}

interface ReplyLikeRecord {
  reply_id: string;
}

interface IdRecord {
  id: string;
}

// ==================== USER ====================

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async (): Promise<User | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase.from('tg_users').select('*').eq('id', user.id).single();

      return data as DbUser | null;
    },
  });
}

// ==================== ANNOUNCEMENTS ====================

export function useAnnouncements() {
  const { data: currentUser } = useCurrentUser();

  return useQuery({
    queryKey: ['announcements'],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from('tg_announcements')
        .select(
          `
          *,
          author:tg_users!author_id(username, first_name, photo_url)
        `
        )
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const announcements = (data || []) as DbAnnouncementWithAuthor[];

      // Get user's reactions if logged in
      if (currentUser && announcements.length > 0) {
        const { data: reactions } = await supabase
          .from('tg_announcement_reactions')
          .select('announcement_id, reaction')
          .eq('user_id', currentUser.id);

        const reactionMap = new Map<string, 'like' | 'dislike'>(
          ((reactions || []) as ReactionRecord[]).map((r) => [r.announcement_id, r.reaction])
        );

        return announcements.map((a) => ({
          ...a,
          user_reaction: reactionMap.get(a.id) || null,
        }));
      }

      return announcements.map((a) => ({ ...a, user_reaction: null }));
    },
  });
}

export function useAnnouncementReaction(sessionToken: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      announcementId,
      reaction,
    }: {
      announcementId: string;
      reaction: 'like' | 'dislike';
    }) => {
      if (!sessionToken) throw new Error('Not authenticated');

      // Call Edge Function for secure reaction handling
      const { data, error } = await supabase.functions.invoke('announcement-reaction', {
        body: { sessionToken, announcementId, reaction },
      });

      if (error) {
        console.error('[useAnnouncementReaction] Edge function error:', error);
        throw new Error(error.message || 'Failed to process reaction');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onMutate: async ({ announcementId, reaction }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['announcements'] });

      // Snapshot the previous value
      const previousAnnouncements = queryClient.getQueryData<Announcement[]>(['announcements']);

      // Optimistically update to the new value
      queryClient.setQueryData<Announcement[]>(['announcements'], (old) => {
        if (!old) return [];
        return old.map((ann) => {
          if (ann.id === announcementId) {
            const currentReaction = ann.user_reaction;
            let newLikes = ann.likes;
            let newDislikes = ann.dislikes;
            let newReaction: 'like' | 'dislike' | null = reaction;

            if (currentReaction === reaction) {
              // Toggling off
              newReaction = null;
              if (reaction === 'like') newLikes--;
              else newDislikes--;
            } else {
              // Changing reaction or adding new
              if (currentReaction === 'like') newLikes--;
              if (currentReaction === 'dislike') newDislikes--;

              if (reaction === 'like') newLikes++;
              else newDislikes++;
            }

            return {
              ...ann,
              user_reaction: newReaction,
              likes: Math.max(0, newLikes),
              dislikes: Math.max(0, newDislikes),
            };
          }
          return ann;
        });
      });

      // Return a context object with the snapshotted value
      return { previousAnnouncements };
    },
    onError: (_err, _newTodo, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousAnnouncements) {
        queryClient.setQueryData(['announcements'], context.previousAnnouncements);
      }
    },
    onSettled: () => {
      // Always refetch after error or success:
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

// ==================== FORUM ====================

export function useThreads(sort: 'latest' | 'popular' | 'hot' = 'latest') {
  const { data: currentUser } = useCurrentUser();

  return useQuery({
    queryKey: ['threads', sort],
    queryFn: async (): Promise<Thread[]> => {
      let query = supabase
        .from('tg_threads')
        .select(
          `
          *,
          author:tg_users!author_id(username, first_name, photo_url)
        `
        )
        .limit(50);

      if (sort === 'latest') {
        query = query.order('created_at', { ascending: false });
      } else if (sort === 'popular') {
        query = query.order('reply_count', { ascending: false });
      } else if (sort === 'hot') {
        query = query.order('last_activity', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      const threads = (data || []) as DbThreadWithAuthor[];

      // Get user's likes if logged in
      if (currentUser && threads.length > 0) {
        const { data: likes } = await supabase
          .from('tg_thread_likes')
          .select('thread_id')
          .eq('user_id', currentUser.id);

        const likedIds = new Set(((likes || []) as ThreadLikeRecord[]).map((l) => l.thread_id));

        return threads.map((t) => ({
          ...t,
          user_liked: likedIds.has(t.id),
        }));
      }

      return threads.map((t) => ({ ...t, user_liked: false }));
    },
  });
}

export function useThread(threadId: string | null) {
  const { data: currentUser } = useCurrentUser();

  return useQuery({
    queryKey: ['thread', threadId],
    queryFn: async (): Promise<{ thread: Thread; replies: Reply[] } | null> => {
      if (!threadId) return null;

      const { data: thread, error } = await supabase
        .from('tg_threads')
        .select(
          `
          *,
          author:tg_users!author_id(username, first_name, photo_url)
        `
        )
        .eq('id', threadId)
        .single();

      if (error) throw error;

      const threadData = thread as DbThreadWithAuthor;

      const { data: replies } = await supabase
        .from('tg_replies')
        .select(
          `
          *,
          author:tg_users!author_id(username, first_name, photo_url)
        `
        )
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      const repliesData = (replies || []) as DbReplyWithAuthor[];

      // Increment view count
      await supabase
        .from('tg_threads')
        .update({ views: (threadData.views ?? 0) + 1 })
        .eq('id', threadId);

      // Get user's likes
      let userLikedThread = false;
      let likedReplyIds = new Set<string>();

      if (currentUser) {
        const { data: threadLike } = await supabase
          .from('tg_thread_likes')
          .select('id')
          .eq('thread_id', threadId)
          .eq('user_id', currentUser.id)
          .single();

        userLikedThread = !!threadLike;

        if (repliesData.length > 0) {
          const { data: replyLikes } = await supabase
            .from('tg_reply_likes')
            .select('reply_id')
            .eq('user_id', currentUser.id)
            .in(
              'reply_id',
              repliesData.map((r) => r.id)
            );

          likedReplyIds = new Set(((replyLikes || []) as ReplyLikeRecord[]).map((l) => l.reply_id));
        }
      }

      return {
        thread: { ...threadData, user_liked: userLikedThread },
        replies: repliesData.map((r) => ({
          ...r,
          user_liked: likedReplyIds.has(r.id),
        })),
      };
    },
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }): Promise<Thread> => {
      if (!currentUser) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('tg_threads')
        .insert({
          title,
          content,
          author_id: currentUser.id,
          last_activity: new Date().toISOString(),
        })
        .select(
          `
          *,
          author:tg_users!author_id(username, first_name, photo_url)
        `
        )
        .single();

      if (error) throw error;
      const threadData = data as DbThreadWithAuthor;
      return { ...threadData, user_liked: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

export function useCreateReply() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  return useMutation({
    mutationFn: async ({
      threadId,
      content,
    }: {
      threadId: string;
      content: string;
    }): Promise<Reply> => {
      if (!currentUser) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('tg_replies')
        .insert({
          thread_id: threadId,
          content,
          author_id: currentUser.id,
        })
        .select(
          `
          *,
          author:tg_users!author_id(username, first_name, photo_url)
        `
        )
        .single();

      if (error) throw error;

      // Update thread reply count and last activity
      const { data: thread } = await supabase
        .from('tg_threads')
        .select('reply_count')
        .eq('id', threadId)
        .single();

      const threadCounters = thread as Partial<ThreadCounters> | null;

      await supabase
        .from('tg_threads')
        .update({
          reply_count: (threadCounters?.reply_count ?? 0) + 1,
          last_activity: new Date().toISOString(),
        })
        .eq('id', threadId);

      const replyData = data as DbReplyWithAuthor;
      return { ...replyData, user_liked: false };
    },
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

export function useToggleThreadLike() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  return useMutation({
    mutationFn: async (threadId: string) => {
      if (!currentUser) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('tg_thread_likes')
        .select('id')
        .eq('thread_id', threadId)
        .eq('user_id', currentUser.id)
        .single();

      const existingLike = existing as IdRecord | null;

      const { data: thread } = await supabase
        .from('tg_threads')
        .select('likes')
        .eq('id', threadId)
        .single();

      const threadCounters = thread as Partial<ThreadCounters> | null;
      const currentLikes = threadCounters?.likes ?? 0;

      if (existingLike) {
        await supabase.from('tg_thread_likes').delete().eq('id', existingLike.id);
        await supabase
          .from('tg_threads')
          .update({ likes: Math.max(0, currentLikes - 1) })
          .eq('id', threadId);
      } else {
        await supabase.from('tg_thread_likes').insert({
          thread_id: threadId,
          user_id: currentUser.id,
        });
        await supabase
          .from('tg_threads')
          .update({ likes: currentLikes + 1 })
          .eq('id', threadId);
      }

      return threadId;
    },
    onSuccess: (threadId) => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

export function useToggleReplyLike() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ replyId, threadId }: { replyId: string; threadId: string }) => {
      if (!currentUser) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('tg_reply_likes')
        .select('id')
        .eq('reply_id', replyId)
        .eq('user_id', currentUser.id)
        .single();

      const existingLike = existing as IdRecord | null;

      const { data: reply } = await supabase
        .from('tg_replies')
        .select('likes')
        .eq('id', replyId)
        .single();

      const replyCounters = reply as Partial<ReplyCounters> | null;
      const currentLikes = replyCounters?.likes ?? 0;

      if (existingLike) {
        await supabase.from('tg_reply_likes').delete().eq('id', existingLike.id);
        await supabase
          .from('tg_replies')
          .update({ likes: Math.max(0, currentLikes - 1) })
          .eq('id', replyId);
      } else {
        await supabase.from('tg_reply_likes').insert({
          reply_id: replyId,
          user_id: currentUser.id,
        });
        await supabase
          .from('tg_replies')
          .update({ likes: currentLikes + 1 })
          .eq('id', replyId);
      }

      return threadId;
    },
    onSuccess: (threadId) => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    },
  });
}
