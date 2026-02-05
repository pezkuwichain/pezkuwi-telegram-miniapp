/**
 * Database types for Supabase tables
 * These types match the actual database schema
 */

// ==================== USERS ====================

export interface DbUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

// ==================== ANNOUNCEMENTS ====================

export interface DbAnnouncement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  author_id: string;
  is_published: boolean;
  likes: number;
  dislikes: number;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface DbAnnouncementWithAuthor extends DbAnnouncement {
  author: DbAuthorInfo | null;
}

export interface DbAnnouncementReaction {
  id: string;
  announcement_id: string;
  user_id: string;
  reaction: 'like' | 'dislike';
  created_at: string;
}

// ==================== FORUM ====================

export interface DbThread {
  id: string;
  title: string;
  content: string;
  author_id: string;
  reply_count: number;
  likes: number;
  views: number;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface DbThreadWithAuthor extends DbThread {
  author: DbAuthorInfo | null;
}

export interface DbReply {
  id: string;
  thread_id: string;
  content: string;
  author_id: string;
  likes: number;
  created_at: string;
  updated_at: string;
}

export interface DbReplyWithAuthor extends DbReply {
  author: DbAuthorInfo | null;
}

export interface DbThreadLike {
  id: string;
  thread_id: string;
  user_id: string;
  created_at: string;
}

export interface DbReplyLike {
  id: string;
  reply_id: string;
  user_id: string;
  created_at: string;
}

// ==================== COMMON ====================

export interface DbAuthorInfo {
  username: string | null;
  first_name: string;
  photo_url: string | null;
}

// ==================== QUERY RESULT TYPES ====================

export interface AnnouncementCounters {
  likes: number;
  dislikes: number;
}

export interface ThreadCounters {
  likes: number;
  reply_count: number;
  views: number;
}

export interface ReplyCounters {
  likes: number;
}

// ==================== TYPE GUARDS ====================

export function isDbAnnouncementWithAuthor(data: unknown): data is DbAnnouncementWithAuthor {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'title' in data &&
    'content' in data &&
    'author_id' in data
  );
}

export function isDbThreadWithAuthor(data: unknown): data is DbThreadWithAuthor {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'title' in data &&
    'content' in data &&
    'author_id' in data &&
    'reply_count' in data
  );
}

export function isDbReplyWithAuthor(data: unknown): data is DbReplyWithAuthor {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'thread_id' in data &&
    'content' in data &&
    'author_id' in data
  );
}

// ==================== SUPABASE DATABASE SCHEMA ====================

export type Database = {
  public: {
    Tables: {
      tg_users: {
        Row: DbUser;
        Insert: Omit<DbUser, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DbUser, 'id' | 'created_at'>>;
      };
      tg_announcements: {
        Row: DbAnnouncement;
        Insert: Omit<
          DbAnnouncement,
          'id' | 'likes' | 'dislikes' | 'views' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Omit<DbAnnouncement, 'id' | 'created_at'>>;
      };
      tg_announcement_reactions: {
        Row: DbAnnouncementReaction;
        Insert: Omit<DbAnnouncementReaction, 'id' | 'created_at'>;
        Update: Partial<Omit<DbAnnouncementReaction, 'id' | 'created_at'>>;
      };
      tg_threads: {
        Row: DbThread;
        Insert: Omit<
          DbThread,
          'id' | 'reply_count' | 'likes' | 'views' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Omit<DbThread, 'id' | 'created_at'>>;
      };
      tg_replies: {
        Row: DbReply;
        Insert: Omit<DbReply, 'id' | 'likes' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DbReply, 'id' | 'created_at'>>;
      };
      tg_thread_likes: {
        Row: DbThreadLike;
        Insert: Omit<DbThreadLike, 'id' | 'created_at'>;
        Update: never;
      };
      tg_reply_likes: {
        Row: DbReplyLike;
        Insert: Omit<DbReplyLike, 'id' | 'created_at'>;
        Update: never;
      };
    };
  };
};
