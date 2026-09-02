import type { Asset, AssetCategory, AssetStatus } from './helpdesk';

export interface AssetWithOwner extends Asset {
  owner?: {
    id: string;
    full_name: string | null;
    email: string;
    department: string | null;
  } | null;
  ticket_count?: number;
}

export interface AssetFormData {
  name: string;
  asset_tag: string;
  category: AssetCategory;
  subcategory?: string;
  status: AssetStatus;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  description?: string;
  location?: string;
  department?: string;
  purchase_date?: string;
  purchase_value?: number;
  warranty_expiry?: string;
  assigned_to?: string | null;
  notes?: string;
  specs?: Record<string, unknown>;
}

export const ASSET_SUBCATEGORIES: Record<AssetCategory, string[]> = {
  hardware: ['Desktop', 'Notebook', 'Servidor', 'Workstation', 'All-in-One'],
  mobile: ['Smartphone', 'Tablet', 'Coletor de Dados'],
  peripheral: ['Impressora', 'Scanner', 'Monitor', 'Teclado', 'Mouse', 'Headset', 'Webcam'],
  network: ['Roteador', 'Switch', 'Access Point', 'Firewall', 'Modem'],
  software: ['Licença Perpétua', 'Assinatura Anual', 'SaaS', 'Contrato'],
  other: ['Outro'],
};

export const getSubcategoryOptions = (category: AssetCategory): string[] => {
  return ASSET_SUBCATEGORIES[category] || [];
};
