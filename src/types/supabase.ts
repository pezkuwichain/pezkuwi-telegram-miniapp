export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          telegram_id: number;
          username: string | null;
          first_name: string;
          last_name: string | null;
          photo_url: string | null;
          language_code: string | null;
          is_admin: boolean;
          wallet_address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_id: number;
          username?: string | null;
          first_name: string;
          last_name?: string | null;
          photo_url?: string | null;
          language_code?: string | null;
          is_admin?: boolean;
          wallet_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          telegram_id?: number;
          username?: string | null;
          first_name?: string;
          last_name?: string | null;
          photo_url?: string | null;
          language_code?: string | null;
          is_admin?: boolean;
          wallet_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      announcements: {
        Row: {
          id: string;
          title: string;
          content: string;
          image_url: string | null;
          link_url: string | null;
          author_id: string;
          likes: number;
          dislikes: number;
          views: number;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          image_url?: string | null;
          link_url?: string | null;
          author_id: string;
          likes?: number;
          dislikes?: number;
          views?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          image_url?: string | null;
          link_url?: string | null;
          author_id?: string;
          likes?: number;
          dislikes?: number;
          views?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      announcement_reactions: {
        Row: {
          id: string;
          announcement_id: string;
          user_id: string;
          reaction: 'like' | 'dislike';
          created_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          user_id: string;
          reaction: 'like' | 'dislike';
          created_at?: string;
        };
        Update: {
          id?: string;
          announcement_id?: string;
          user_id?: string;
          reaction?: 'like' | 'dislike';
          created_at?: string;
        };
      };
      threads: {
        Row: {
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
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          author_id: string;
          reply_count?: number;
          likes?: number;
          views?: number;
          last_activity?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          author_id?: string;
          reply_count?: number;
          likes?: number;
          views?: number;
          last_activity?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      thread_likes: {
        Row: {
          id: string;
          thread_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
      replies: {
        Row: {
          id: string;
          thread_id: string;
          content: string;
          author_id: string;
          likes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          content: string;
          author_id: string;
          likes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          content?: string;
          author_id?: string;
          likes?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      reply_likes: {
        Row: {
          id: string;
          reply_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          reply_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          reply_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Helper types
export type User = Database['public']['Tables']['users']['Row'];
export type Announcement = Database['public']['Tables']['announcements']['Row'];
export type Thread = Database['public']['Tables']['threads']['Row'];
export type Reply = Database['public']['Tables']['replies']['Row'];

// Extended types with author info
export type AnnouncementWithAuthor = Announcement & {
  author: Pick<User, 'username' | 'first_name' | 'photo_url'>;
  user_reaction?: 'like' | 'dislike' | null;
};

export type ThreadWithAuthor = Thread & {
  author: Pick<User, 'username' | 'first_name' | 'photo_url'>;
  user_liked?: boolean;
};

export type ReplyWithAuthor = Reply & {
  author: Pick<User, 'username' | 'first_name' | 'photo_url'>;
  user_liked?: boolean;
};
