// Os setores que têm "Diretrizes do <setor>" (decisão do dono, 2026-10-04). O Comercial entrou em 2026-10-20:
// diretriz de processo, ao lado das regras de benefício. A mesma lista do CHECK de `diretrizes.setor`
// (migrations 20261204010000 e 20270129090000).
import type { Department } from '@/config/access-profile-schemas';

export type SetorComDiretriz = Department;

export const SETORES_COM_DIRETRIZ: { setor: SetorComDiretriz; nome: string; rota: string }[] = [
  { setor: 'ti', nome: 'Diretrizes de TI', rota: '/ti/diretrizes' },
  { setor: 'marketing', nome: 'Diretrizes do Marketing', rota: '/mkt/diretrizes' },
  { setor: 'rh', nome: 'Diretrizes do RH', rota: '/rh/diretrizes' },
  { setor: 'qualidade', nome: 'Diretrizes da Qualidade', rota: '/qualidade/diretrizes' },
  { setor: 'financeiro', nome: 'Diretrizes do Financeiro', rota: '/financeiro/diretrizes' },
  { setor: 'compras', nome: 'Diretrizes de Compras', rota: '/compras/diretrizes' },
  { setor: 'comercial', nome: 'Diretrizes do Comercial', rota: '/comercial/diretrizes' },
  { setor: 'educacional', nome: 'Diretrizes do Educacional', rota: '/educacional/diretrizes' },
  { setor: 'expedicao', nome: 'Diretrizes da Expedição', rota: '/expedicao/diretrizes' },
  { setor: 'producao', nome: 'Diretrizes da Produção', rota: '/producao/diretrizes' },
];

export const temDiretriz = (setor: string | null | undefined): setor is SetorComDiretriz =>
  SETORES_COM_DIRETRIZ.some((s) => s.setor === setor);

export const nomeDasDiretrizes = (setor: string) =>
  SETORES_COM_DIRETRIZ.find((s) => s.setor === setor)?.nome ?? 'Diretrizes';


export type StatusDaDiretriz = 'rascunho' | 'publicada' | 'arquivada';
export type VisibilidadeDaDiretriz = 'setor' | 'setores' | 'empresa';

export const ROTULO_DO_STATUS: Record<StatusDaDiretriz, string> = {
  rascunho: 'Rascunho', publicada: 'Publicada', arquivada: 'Arquivada',
};

export const ROTULO_DA_VISIBILIDADE: Record<VisibilidadeDaDiretriz, string> = {
  setor: 'Só o setor', setores: 'O setor e setores escolhidos', empresa: 'A empresa toda',
};
