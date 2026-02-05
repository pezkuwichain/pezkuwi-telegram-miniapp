/**
 * Forum Hook - Fetches forum data from Supabase
 * Copied from pwap/web and adapted for Telegram Mini App
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AdminAnnouncement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'critical';
  priority: number;
  created_at: string;
  expires_at?: string;
}

export interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  discussion_count?: number;
}

export interface ForumDiscussion {
  id: string;
  category_id: string;
  category?: ForumCategory;
  proposal_id?: string;
  title: string;
  content: string;
  image_url?: string;
  author_id: string;
  author_name: string;
  author_address?: string;
  is_pinned: boolean;
  is_locked: boolean;
  views_count: number;
  replies_count: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'upvote' | 'downvote' | null;
}

export interface ForumReply {
  id: string;
  discussion_id: string;
  parent_reply_id?: string;
  content: string;
  author_id: string;
  author_name: string;
  author_address?: string;
  is_edited: boolean;
  edited_at?: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'upvote' | 'downvote' | null;
}

interface CreateDiscussionParams {
  title: string;
  content: string;
  category_id: string;
  author_id: string;
  author_name: string;
  author_address?: string;
  tags?: string[];
  image_url?: string;
}

interface CreateReplyParams {
  discussion_id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_address?: string;
  parent_reply_id?: string;
}

export function useForum(userId?: string) {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [discussions, setDiscussions] = useState<ForumDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('admin_announcements')
        .select('*')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error fetching announcements:', err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('forum_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    }
  }, []);

  const fetchDiscussions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('forum_discussions')
        .select(
          `
          *,
          category:forum_categories(*)
        `
        )
        .order('is_pinned', { ascending: false })
        .order('last_activity_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch reaction counts and user votes for each discussion
      const discussionsWithReactions = await Promise.all(
        (data || []).map(async (discussion) => {
          const { data: reactions } = await supabase
            .from('forum_reactions')
            .select('reaction_type, user_id')
            .eq('discussion_id', discussion.id);

          const upvotes = reactions?.filter((r) => r.reaction_type === 'upvote').length || 0;
          const downvotes = reactions?.filter((r) => r.reaction_type === 'downvote').length || 0;
          const userVote = userId
            ? reactions?.find((r) => r.user_id === userId)?.reaction_type || null
            : null;

          return {
            ...discussion,
            upvotes,
            downvotes,
            userVote,
          };
        })
      );

      setDiscussions(discussionsWithReactions);
    } catch (err) {
      console.error('Error fetching discussions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch discussions');
    }
  }, [userId]);

  const fetchForumData = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchAnnouncements(), fetchCategories(), fetchDiscussions()]);
    setLoading(false);
  }, [fetchAnnouncements, fetchCategories, fetchDiscussions]);

  // Fetch replies for a specific discussion
  const fetchReplies = useCallback(
    async (discussionId: string): Promise<ForumReply[]> => {
      try {
        const { data, error } = await supabase
          .from('forum_replies')
          .select('*')
          .eq('discussion_id', discussionId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Fetch reaction counts for replies
        const repliesWithReactions = await Promise.all(
          (data || []).map(async (reply) => {
            const { data: reactions } = await supabase
              .from('forum_reactions')
              .select('reaction_type, user_id')
              .eq('reply_id', reply.id);

            const upvotes = reactions?.filter((r) => r.reaction_type === 'upvote').length || 0;
            const downvotes = reactions?.filter((r) => r.reaction_type === 'downvote').length || 0;
            const userVote = userId
              ? reactions?.find((r) => r.user_id === userId)?.reaction_type || null
              : null;

            return {
              ...reply,
              upvotes,
              downvotes,
              userVote,
            };
          })
        );

        return repliesWithReactions;
      } catch (err) {
        console.error('Error fetching replies:', err);
        return [];
      }
    },
    [userId]
  );

  // Create a new discussion
  const createDiscussion = useCallback(
    async (params: CreateDiscussionParams): Promise<ForumDiscussion | null> => {
      try {
        const { data, error } = await supabase
          .from('forum_discussions')
          .insert({
            title: params.title,
            content: params.content,
            category_id: params.category_id,
            author_id: params.author_id,
            author_name: params.author_name,
            author_address: params.author_address,
            tags: params.tags || [],
            image_url: params.image_url,
            is_pinned: false,
            is_locked: false,
            views_count: 0,
            replies_count: 0,
            last_activity_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Refresh discussions
        await fetchDiscussions();

        return data;
      } catch (err) {
        console.error('Error creating discussion:', err);
        throw err;
      }
    },
    [fetchDiscussions]
  );

  // Create a new reply
  const createReply = useCallback(async (params: CreateReplyParams): Promise<ForumReply | null> => {
    try {
      const { data, error } = await supabase
        .from('forum_replies')
        .insert({
          discussion_id: params.discussion_id,
          content: params.content,
          author_id: params.author_id,
          author_name: params.author_name,
          author_address: params.author_address,
          parent_reply_id: params.parent_reply_id,
          is_edited: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Update discussion's reply count and last_activity_at
      await supabase
        .from('forum_discussions')
        .update({
          replies_count: supabase.rpc('increment_replies', { discussion_id: params.discussion_id }),
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', params.discussion_id);

      return data;
    } catch (err) {
      console.error('Error creating reply:', err);
      throw err;
    }
  }, []);

  // Vote on a discussion
  const voteOnDiscussion = useCallback(
    async (
      discussionId: string,
      visitorUserId: string,
      voteType: 'upvote' | 'downvote'
    ): Promise<void> => {
      try {
        // Check if user already voted
        const { data: existingVote } = await supabase
          .from('forum_reactions')
          .select('*')
          .eq('discussion_id', discussionId)
          .eq('user_id', visitorUserId)
          .single();

        if (existingVote) {
          if (existingVote.reaction_type === voteType) {
            // Remove vote if same type
            await supabase.from('forum_reactions').delete().eq('id', existingVote.id);
          } else {
            // Update vote if different type
            await supabase
              .from('forum_reactions')
              .update({ reaction_type: voteType })
              .eq('id', existingVote.id);
          }
        } else {
          // Create new vote
          await supabase.from('forum_reactions').insert({
            discussion_id: discussionId,
            user_id: visitorUserId,
            reaction_type: voteType,
          });
        }

        // Refresh discussions to update counts
        await fetchDiscussions();
      } catch (err) {
        console.error('Error voting on discussion:', err);
        throw err;
      }
    },
    [fetchDiscussions]
  );

  // Vote on a reply
  const voteOnReply = useCallback(
    async (
      replyId: string,
      visitorUserId: string,
      voteType: 'upvote' | 'downvote'
    ): Promise<void> => {
      try {
        // Check if user already voted
        const { data: existingVote } = await supabase
          .from('forum_reactions')
          .select('*')
          .eq('reply_id', replyId)
          .eq('user_id', visitorUserId)
          .single();

        if (existingVote) {
          if (existingVote.reaction_type === voteType) {
            // Remove vote if same type
            await supabase.from('forum_reactions').delete().eq('id', existingVote.id);
          } else {
            // Update vote if different type
            await supabase
              .from('forum_reactions')
              .update({ reaction_type: voteType })
              .eq('id', existingVote.id);
          }
        } else {
          // Create new vote
          await supabase.from('forum_reactions').insert({
            reply_id: replyId,
            user_id: visitorUserId,
            reaction_type: voteType,
          });
        }
      } catch (err) {
        console.error('Error voting on reply:', err);
        throw err;
      }
    },
    []
  );

  // Increment view count
  const incrementViewCount = useCallback(async (discussionId: string): Promise<void> => {
    try {
      const { data } = await supabase
        .from('forum_discussions')
        .select('views_count')
        .eq('id', discussionId)
        .single();

      if (data) {
        await supabase
          .from('forum_discussions')
          .update({ views_count: (data.views_count || 0) + 1 })
          .eq('id', discussionId);
      }
    } catch (err) {
      console.error('Error incrementing view count:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchForumData();
  }, [fetchForumData]);

  // Subscribe to real-time updates
  useEffect(() => {
    const discussionsSubscription = supabase
      .channel('forum_discussions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'forum_discussions',
        },
        () => {
          fetchDiscussions();
        }
      )
      .subscribe();

    const announcementsSubscription = supabase
      .channel('admin_announcements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_announcements',
        },
        () => {
          fetchAnnouncements();
        }
      )
      .subscribe();

    const repliesSubscription = supabase
      .channel('forum_replies')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'forum_replies',
        },
        () => {
          fetchDiscussions();
        }
      )
      .subscribe();

    return () => {
      discussionsSubscription.unsubscribe();
      announcementsSubscription.unsubscribe();
      repliesSubscription.unsubscribe();
    };
  }, [fetchDiscussions, fetchAnnouncements]);

  return {
    announcements,
    categories,
    discussions,
    loading,
    error,
    refreshData: fetchForumData,
    fetchReplies,
    createDiscussion,
    createReply,
    voteOnDiscussion,
    voteOnReply,
    incrementViewCount,
  };
}
