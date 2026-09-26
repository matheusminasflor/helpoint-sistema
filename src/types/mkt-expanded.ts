// Marketing Module Expanded Types - Suppliers, UGC, AI, Social Accounts

// ========== Supplier Types ==========
// O fornecedor deixou de ser do Marketing na leva I (Compras, 2026-09-26): a
// tabela `mkt_suppliers` e a `fin_suppliers` viraram `suppliers`, uma só para a
// empresa. O tipo mora em `@/types/suppliers`; o reexport abaixo existe para o
// resto deste arquivo (`MKTQuotation.supplier`) continuar legível.
export type {
  Supplier, SupplierCategory, SupplierStatus,
} from './suppliers';
export { SUPPLIER_CATEGORY_LABELS, SUPPLIER_STATUS_LABELS } from './suppliers';

import type { Supplier } from './suppliers';

// ========== Quotation Types ==========
export type MKTQuotationStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export interface MKTQuotationItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface MKTQuotation {
  id: string;
  tenant_id: string;
  supplier_id: string;
  event_id?: string;
  title: string;
  description?: string;
  items: MKTQuotationItem[];
  total_value?: number;
  status: MKTQuotationStatus;
  approved_by?: string;
  approved_at?: string;
  purchase_order_ref?: string;
  valid_until?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Relations
  supplier?: Supplier;
  event?: { id: string; title: string };
}

export const QUOTATION_STATUS_LABELS: Record<MKTQuotationStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export const QUOTATION_STATUS_COLORS: Record<MKTQuotationStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-600 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  cancelled: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
};

// ========== UGC Types ==========
export type MKTUGCStatus = 'pending' | 'approved' | 'rejected';
export type MKTUGCMediaType = 'image' | 'video' | 'story' | 'reel' | 'carousel';

export interface MKTUGCEngagement {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
}

export interface MKTUGC {
  id: string;
  tenant_id: string;
  title: string;
  source_platform: string;
  source_url?: string;
  source_author?: string;
  media_type: MKTUGCMediaType;
  media_url?: string;
  thumbnail_url?: string;
  description?: string;
  hashtags: string[];
  influencer_id?: string;
  approval_status: MKTUGCStatus;
  usage_rights?: string;
  used_in_campaigns: string[];
  engagement_original: MKTUGCEngagement;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Relations
  influencer?: { id: string; name: string; stage_name?: string };
}

export const UGC_STATUS_LABELS: Record<MKTUGCStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export const UGC_MEDIA_TYPE_LABELS: Record<MKTUGCMediaType, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  story: 'Story',
  reel: 'Reels',
  carousel: 'Carrossel',
};

export const UGC_STATUS_COLORS: Record<MKTUGCStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-600 border-red-500/30',
};

// ========== AI Generation Types ==========
export type MKTAIGenerationType = 'image' | 'image-edit' | 'caption' | 'idea' | 'reminder';

export interface MKTAIGeneration {
  id: string;
  tenant_id: string;
  type: MKTAIGenerationType;
  prompt: string;
  result?: string;
  model_used: string;
  post_id?: string;
  event_id?: string;
  accepted: boolean;
  created_by?: string;
  created_at: string;
}

export const AI_GENERATION_TYPE_LABELS: Record<MKTAIGenerationType, string> = {
  image: 'Imagem',
  'image-edit': 'Edição de Imagem',
  caption: 'Legenda',
  idea: 'Ideia',
  reminder: 'Lembrete',
};

// ========== Social Account Types ==========
export interface MKTSocialAccount {
  id: string;
  tenant_id: string;
  platform: string;
  account_name: string;
  account_id?: string;
  page_id?: string;
  access_token?: string;
  token_expires_at?: string;
  is_active: boolean;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
}
