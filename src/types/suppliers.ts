/**
 * Fornecedor — da empresa, não de um módulo.
 *
 * Nasceu dentro do Marketing (`mkt_suppliers`, tipos `MKTSupplier*`) e o
 * Financeiro tinha a sua própria tabela, sem tela nenhuma. Na leva I (Compras,
 * 2026-09-26) as duas viraram uma: a tabela é `suppliers`, e o tipo mora aqui
 * em vez de em `mkt-expanded.ts`, porque o nome do arquivo também é
 * documentação — tipo de fornecedor num arquivo de Marketing é o começo da
 * segunda tabela de fornecedor.
 *
 * 2026-10-04: "de que é o fornecedor" passou a ser GRUPO (vários por fornecedor,
 * criados pela empresa — `useGruposDeFornecedor`, migration 20261203100000). A
 * `category` abaixo ficou no banco sem uso pela tela; sai quando a coluna sair.
 */

export type SupplierCategory =
  | 'grafica' | 'producao' | 'midia' | 'eventos'
  | 'brindes' | 'digital' | 'audiovisual' | 'outro';

export type SupplierStatus = 'active' | 'inactive' | 'blocked';

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  cnpj?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category: SupplierCategory;
  services: string[];
  rating?: number;
  status: SupplierStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export const SUPPLIER_CATEGORY_LABELS: Record<SupplierCategory, string> = {
  grafica: 'Gráfica',
  producao: 'Produção',
  midia: 'Mídia',
  eventos: 'Eventos',
  brindes: 'Brindes',
  digital: 'Digital',
  audiovisual: 'Audiovisual',
  outro: 'Outro',
};

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  blocked: 'Bloqueado',
};
