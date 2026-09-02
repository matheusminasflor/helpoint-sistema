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
  facebook: 'bg-blue-600',
  meta_ads: 'bg-indigo-600',
  whatsapp: 'bg-green-600',
  tiktok: 'bg-black',
  youtube: 'bg-red-600',
  linkedin: 'bg-blue-700',
  twitter: 'bg-sky-500',
};

export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  draft: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
  scheduled: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  published: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-600 border-red-500/30',
};
