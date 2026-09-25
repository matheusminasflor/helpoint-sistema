// Leitura do HISTORICO_METAS.json (e do METAS_<ano>.json) do diretor —
// regra pura, sem dependência de Supabase (o CI não tem `.env`; mesmo
// cuidado de `src/lib/acesso-diretoria.ts` e `src/lib/simulador-metas.ts`).
//
// A importação de verdade (delete+insert em metas_carteira/metas_ano) mora
// na RPC `com_importar_metas`/`com_importar_metas_do_ano` (migration
// 20261021010000) — ela recebe o JSON quase bruto e faz a MESMA
// normalização em SQL. Este módulo é o que a tela usa para a PRÉVIA antes
// de confirmar (no molde de `lerRelatorioVendas`/`comercial-import.ts`):
// valida a forma do arquivo e mostra o que vai ser gravado, sem escrever
// nada.
//
// A regra de ouro do anexo (docs/metas-e-carteiras-fonte-da-verdade.md §3):
// `0.0` e `null` significam "sem dado" e NUNCA se plotam como R$ 0,00.
// Vale para `realizado`, `total`, `meta` e `metaTotal` — as quatro séries.
//
// Frente 6 (.scratch/plano-frente6-importacoes.md §4): desde a Frente 7d a
// importação de verdade (`com_importar_metas`, migration 20261025050000)
// resolve o nome da carteira pela memória de renomeações ANTES de gravar —
// "VIP" no arquivo vira "ESPECIAL" no banco. Esta prévia mostrava a chave
// crua do JSON, então o dono confirmava "VIP" e o banco gravava "ESPECIAL":
// não é erro de número, é de confiança. `resolverCarteiraImportada` faz a
// MESMA conta do lado do navegador — `normalizarNomeCarteira`, a mesma
// função que a tela de Metas já usa para comparar carteiras (senão as duas
// contas divergem e a prévia volta a mentir, só que de um jeito diferente).
import { normalizarNomeCarteira } from './carteira-nome';
import type { RenomeacaoCarteira } from '@/types/comercial';

export interface HistoricoMetasAnoJson {
  cart: Record<string, Array<number | null>>;
  total: Array<number | null>;
  meta: Array<number | null> | null;
  metaTotal?: Array<number | null> | null;
}

export interface HistoricoMetasJson {
  ano_base?: number;
  origem?: string;
  anos: Record<string, HistoricoMetasAnoJson>;
}

/** `0.0` ou `null` → ausência. Nunca zero, nunca `undefined`. */
export function semDado(valor: number | null | undefined): number | null {
  if (valor == null) return null;
  return valor === 0 ? null : valor;
}

export interface PreviaCarteira {
  carteira: string;
  /** 12 posições, índice 0 = janeiro. */
  realizado: Array<number | null>;
}

export interface PreviaAno {
  ano: number;
  carteiras: PreviaCarteira[];
  totalRealizado: Array<number | null>;
  /** `null` = o ano inteiro não tem meta no HISTORICO (2023/2024 no JSON do dono) — não é erro. */
  meta: Array<number | null> | null;
  metaTotal: Array<number | null> | null;
}

export interface PreviaHistoricoMetas {
  anos: PreviaAno[];
}

function ehArray12(v: unknown): v is Array<number | null> {
  return Array.isArray(v) && v.length === 12;
}

/**
 * Valida a forma do HISTORICO_METAS.json e devolve uma prévia normalizada
 * (0.0/null já convertidos em ausência) para a tela mostrar antes de
 * confirmar. Não grava nada — quem grava é `com_importar_metas`.
 */
export function normalizarHistoricoMetas(json: unknown): PreviaHistoricoMetas {
  if (typeof json !== 'object' || json === null || !('anos' in json)) {
    throw new Error('JSON sem a chave "anos" — não parece um HISTORICO_METAS.json válido.');
  }
  const anosObj = (json as HistoricoMetasJson).anos;
  if (typeof anosObj !== 'object' || anosObj === null) {
    throw new Error('JSON sem a chave "anos" — não parece um HISTORICO_METAS.json válido.');
  }

  const anos = Object.keys(anosObj)
    .sort()
    .map((anoStr): PreviaAno => {
      const anoObj = anosObj[anoStr];
      const cartObj = anoObj.cart ?? {};
      const carteiras = Object.keys(cartObj)
        .sort()
        .map((nome): PreviaCarteira => {
          const serie = cartObj[nome];
          if (!ehArray12(serie)) {
            throw new Error(`Carteira "${nome}" do ano ${anoStr} não tem 12 meses.`);
          }
          return { carteira: nome, realizado: serie.map(semDado) };
        });

      if (!ehArray12(anoObj.total)) {
        throw new Error(`"total" do ano ${anoStr} não tem 12 meses.`);
      }

      return {
        ano: Number(anoStr),
        carteiras,
        totalRealizado: anoObj.total.map(semDado),
        meta: ehArray12(anoObj.meta) ? anoObj.meta.map(semDado) : null,
        metaTotal: ehArray12(anoObj.metaTotal) ? anoObj.metaTotal.map(semDado) : null,
      };
    });

  return { anos };
}

export interface CarteiraResolvida {
  /** A chave crua do JSON — o que o dono confirmou visualmente antes desta correção. */
  original: string;
  /** O nome que `com_importar_metas` vai gravar de verdade. Igual a `original` quando não há renomeação. */
  final: string;
}

/**
 * Resolve o nome de uma carteira do arquivo pela mesma memória
 * (`com_carteira_renomeacoes`, lida por `useRenomeacoesCarteira`) que a RPC
 * consulta na hora de gravar: compara pela forma normalizada e devolve o
 * destino quando existe uma renomeação registrada para esta origem.
 */
export function resolverCarteiraImportada(nomeOriginal: string, renomeacoes: RenomeacaoCarteira[]): CarteiraResolvida {
  const normalizado = normalizarNomeCarteira(nomeOriginal);
  const encontrada = renomeacoes.find((r) => normalizarNomeCarteira(r.de) === normalizado);
  return { original: nomeOriginal, final: encontrada?.para ?? nomeOriginal };
}

export interface MetasDoAnoJson {
  ano: number;
}

/** Valida o METAS_<ano>.json e devolve os 12 valores já com 0.0/null → ausência. */
export function normalizarMetasDoAno(json: unknown): { ano: number; metas: Array<number | null> } {
  if (typeof json !== 'object' || json === null || !('ano' in json) || !('metas' in json)) {
    throw new Error('JSON sem "ano"/"metas" — não parece um METAS_<ano>.json válido.');
  }
  const { ano } = json as MetasDoAnoJson;
  // `metas` lido como `unknown`, direto do objeto — `ehArray12` é quem
  // decide a forma; `MetasDoAnoJson` não declara este campo de propósito
  // (item 6.2 da correção da auditoria de 2026-09-22: `metas: number[]`
  // era tipo morto, nunca usado).
  const metas: unknown = (json as Record<string, unknown>).metas;
  if (!ehArray12(metas)) {
    throw new Error(`METAS_${ano}.json precisa ter 12 valores (um por mês); recebi ${Array.isArray(metas) ? metas.length : 0}.`);
  }
  return { ano: Number(ano), metas: metas.map(semDado) };
}
