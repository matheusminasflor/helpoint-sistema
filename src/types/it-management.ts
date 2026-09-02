// IT Management Types for Licenses, Contracts, and Maintenances

export type LicenseType = 'perpetual' | 'subscription' | 'volume' | 'oem';
export type ContractStatus = 'active' | 'expiring' | 'expired' | 'cancelled';
export type PaymentFrequency = 'monthly' | 'quarterly' | 'yearly' | 'one_time';
export type MaintenanceType = 'preventive' | 'corrective' | 'upgrade' | 'cleaning';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type LicenseItemCategory = 'software' | 'domain' | 'hosting' | 'ssl' | 'online_service' | 'other';

export const LICENSE_ITEM_CATEGORY_LABEL: Record<LicenseItemCategory, string> = {
  software: 'Software',
  domain: 'Domínio de site',
  hosting: 'Hospedagem',
  ssl: 'Certificado SSL',
  online_service: 'Serviço online',
  other: 'Outro',
};

export interface SoftwareLicense {
  id: string;
  tenant_id: string;
  name: string;
  vendor: string | null;
  license_type: LicenseType;
  license_key: string | null;
  total_quantity: number;
  expiry_date: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  notes: string | null;
  is_active: boolean;
  auto_create_ticket: boolean;
  item_category: LicenseItemCategory;
  domain: string | null;
  public_url: string | null;
  admin_url: string | null;
  internal_owner: string | null;
  technical_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseRenewal {
  id: string;
  tenant_id: string;
  license_id: string;
  previous_purchase_date: string | null;
  previous_expiry_date: string | null;
  new_purchase_date: string | null;
  new_expiry_date: string | null;
  renewal_value: number | null;
  provider: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LicenseAssignment {

  id: string;
  tenant_id: string;
  license_id: string;
  assigned_to: string | null;
  asset_id: string | null;
  assigned_at: string;
  assigned_by: string | null;
  notes: string | null;
}

export interface LicenseAssignmentWithDetails extends LicenseAssignment {
  assigned_user?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  asset?: {
    id: string;
    name: string;
    asset_tag: string;
  } | null;
  assigned_by_user?: {
    id: string;
    full_name: string | null;
  } | null;
}

export interface LicenseWithAssignments extends SoftwareLicense {
  assignments: LicenseAssignmentWithDetails[];
  used_quantity: number;
  available_quantity: number;
}

export interface SoftwareContract {
  id: string;
  tenant_id: string;
  name: string;
  vendor: string;
  contract_number: string | null;
  description: string | null;
  start_date: string;
  end_date: string;
  renewal_alert_days: number;
  auto_renew: boolean;
  value: number | null;
  payment_frequency: PaymentFrequency | null;
  status: ContractStatus;
  document_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  auto_create_ticket: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetMaintenance {
  id: string;
  tenant_id: string;
  asset_id: string;
  maintenance_type: MaintenanceType;
  title: string;
  description: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  cost: number | null;
  status: MaintenanceStatus;
  technician_id: string | null;
  external_provider: string | null;
  ticket_id: string | null;
  notes: string | null;
  auto_create_ticket: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceWithDetails extends AssetMaintenance {
  asset?: {
    id: string;
    name: string;
    asset_tag: string;
    category: string;
  } | null;
  technician?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

// Helper functions
export const getLicenseTypeLabel = (type: LicenseType): string => {
  const labels: Record<LicenseType, string> = {
    perpetual: 'Perpétua',
    subscription: 'Assinatura',
    volume: 'Volume',
    oem: 'OEM',
  };
  return labels[type];
};

export const getContractStatusLabel = (status: ContractStatus): string => {
  const labels: Record<ContractStatus, string> = {
    active: 'Ativo',
    expiring: 'Expirando',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  };
  return labels[status];
};

export const getContractStatusColor = (status: ContractStatus): string => {
  const colors: Record<ContractStatus, string> = {
    active: 'bg-green-500/10 text-green-500 border-green-500/20',
    expiring: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    expired: 'bg-red-500/10 text-red-500 border-red-500/20',
    cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };
  return colors[status];
};

export const getPaymentFrequencyLabel = (frequency: PaymentFrequency): string => {
  const labels: Record<PaymentFrequency, string> = {
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    yearly: 'Anual',
    one_time: 'Único',
  };
  return labels[frequency];
};

export const getMaintenanceTypeLabel = (type: MaintenanceType): string => {
  const labels: Record<MaintenanceType, string> = {
    preventive: 'Preventiva',
    corrective: 'Corretiva',
    upgrade: 'Upgrade',
    cleaning: 'Limpeza',
  };
  return labels[type];
};

export const getMaintenanceTypeColor = (type: MaintenanceType): string => {
  const colors: Record<MaintenanceType, string> = {
    preventive: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    corrective: 'bg-red-500/10 text-red-500 border-red-500/20',
    upgrade: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    cleaning: 'bg-green-500/10 text-green-500 border-green-500/20',
  };
  return colors[type];
};

export const getMaintenanceStatusLabel = (status: MaintenanceStatus): string => {
  const labels: Record<MaintenanceStatus, string> = {
    scheduled: 'Agendada',
    in_progress: 'Em Andamento',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  };
  return labels[status];
};

export const getMaintenanceStatusColor = (status: MaintenanceStatus): string => {
  const colors: Record<MaintenanceStatus, string> = {
    scheduled: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    in_progress: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    completed: 'bg-green-500/10 text-green-500 border-green-500/20',
    cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };
  return colors[status];
};

export const getDaysUntilExpiry = (expiryDate: string | null): number | null => {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const isExpiringWithinDays = (expiryDate: string | null, days: number): boolean => {
  const daysUntil = getDaysUntilExpiry(expiryDate);
  if (daysUntil === null) return false;
  return daysUntil > 0 && daysUntil <= days;
};

export const isExpired = (expiryDate: string | null): boolean => {
  const daysUntil = getDaysUntilExpiry(expiryDate);
  if (daysUntil === null) return false;
  return daysUntil < 0;
};

export const formatCurrency = (value: number | null): string => {
  if (value === null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};
