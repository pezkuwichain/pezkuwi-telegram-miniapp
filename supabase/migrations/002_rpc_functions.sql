-- RPC Functions for counter operations
-- These are atomic operations to prevent race conditions

-- Announcement reactions
CREATE OR REPLACE FUNCTION increment_announcement_reaction(
  p_announcement_id UUID,
  p_reaction TEXT
)
RETURNS VOID AS $$
BEGIN
  IF p_reaction = 'like' THEN
    UPDATE announcements SET likes = likes + 1 WHERE id = p_announcement_id;
  ELSIF p_reaction = 'dislike' THEN
    UPDATE announcements SET dislikes = dislikes + 1 WHERE id = p_announcement_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_announcement_reaction(
  p_announcement_id UUID,
  p_reaction TEXT
)
RETURNS VOID AS $$
BEGIN
  IF p_reaction = 'like' THEN
    UPDATE announcements SET likes = GREATEST(0, likes - 1) WHERE id = p_announcement_id;
  ELSIF p_reaction = 'dislike' THEN
    UPDATE announcements SET dislikes = GREATEST(0, dislikes - 1) WHERE id = p_announcement_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION change_announcement_reaction(
  p_announcement_id UUID,
  p_old_reaction TEXT,
  p_new_reaction TEXT
)
RETURNS VOID AS $$
BEGIN
  IF p_old_reaction = 'like' THEN
    UPDATE announcements SET likes = GREATEST(0, likes - 1) WHERE id = p_announcement_id;
  ELSIF p_old_reaction = 'dislike' THEN
    UPDATE announcements SET dislikes = GREATEST(0, dislikes - 1) WHERE id = p_announcement_id;
  END IF;

  IF p_new_reaction = 'like' THEN
    UPDATE announcements SET likes = likes + 1 WHERE id = p_announcement_id;
  ELSIF p_new_reaction = 'dislike' THEN
    UPDATE announcements SET dislikes = dislikes + 1 WHERE id = p_announcement_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Thread operations
CREATE OR REPLACE FUNCTION increment_thread_views(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE threads SET views = views + 1 WHERE id = p_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_thread_likes(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE threads SET likes = likes + 1 WHERE id = p_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_thread_likes(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE threads SET likes = GREATEST(0, likes - 1) WHERE id = p_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_thread_reply(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE threads
  SET reply_count = reply_count + 1,
      last_activity = NOW()
  WHERE id = p_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reply operations
CREATE OR REPLACE FUNCTION increment_reply_likes(p_reply_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE replies SET likes = likes + 1 WHERE id = p_reply_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_reply_likes(p_reply_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE replies SET likes = GREATEST(0, likes - 1) WHERE id = p_reply_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Announcement view increment
CREATE OR REPLACE FUNCTION increment_announcement_views(p_announcement_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE announcements SET views = views + 1 WHERE id = p_announcement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
