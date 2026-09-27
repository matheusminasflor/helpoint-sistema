// Marketing Module Types

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'twitter'
  | 'facebook'
  | 'whatsapp'
  | 'meta_ads';

export type PostType =
  | 'feed'
  | 'story'
  | 'reel'
  | 'live'
  | 'short'
  | 'post'
  | 'paid_ad'
  | 'broadcast_list';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  tenant_id: string;
  title: string;
  content?: string;
  platform: SocialPlatform;
  post_type: PostType;
  scheduled_at?: string;
  published_at?: string;
  status: PostStatus;
  media_urls: string[];
  hashtags: string[];
  account_id?: string | null;
  external_link?: string | null;
  strategy_notes?: string | null;
  created_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Labels for UI
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  meta_ads: 'Meta Ads (Tráfego pago)',
  whatsapp: 'WhatsApp (Lista de transmissão)',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'Twitter/X',
};

export const POST_TYPE_LABELS: Record<PostType, string> = {
  feed: 'Feed',
  story: 'Stories',
  reel: 'Reels',
  live: 'Live',
  short: 'Short',
  post: 'Post',
  paid_ad: 'Tráfego pago',
  broadcast_list: 'Lista de transmissão',
};

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  published: 'Publicado',
  failed: 'Falhou',
};

export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
  facebook: 'bg-status-info',
  meta_ads: 'bg-status-info',
  whatsapp: 'bg-status-success',
  tiktok: 'bg-black',
  youtube: 'bg-status-danger',
  linkedin: 'bg-status-info',
  twitter: 'bg-status-info',
};

export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  draft: 'bg-muted/20 text-muted-foreground border-border/30',
  scheduled: 'bg-status-warning/20 text-status-warning border-status-warning/30',
  published: 'bg-status-success/20 text-status-success border-status-success/30',
  failed: 'bg-status-danger/20 text-status-danger border-status-danger/30',
};
