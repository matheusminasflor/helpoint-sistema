import { toLocalISODate } from '@/lib/dates';
import type { Database } from '@/integrations/supabase/types';

/**
 * Regras puras do chat (L11a) — sem banco, para poderem ser provadas sem ele.
 */

export type ChatMensagem = Database['public']['Tables']['chat_messages']['Row'];
export type ChatCanal = Database['public']['Tables']['chat_channels']['Row'];

export interface GrupoDeDia {
  dia: string;
  mensagens: ChatMensagem[];
}

/**
 * Separa as mensagens por dia, no fuso local (regra 4 das cinco). Uma
 * mensagem das 22h30 tem que cair no dia de hoje, não no de amanhã — é
 * exatamente o erro que `toISOString().slice(0, 10)` cometeria.
 */
export function agrupaPorDia(mensagens: ChatMensagem[]): GrupoDeDia[] {
  const grupos: GrupoDeDia[] = [];
  for (const m of mensagens) {
    const dia = toLocalISODate(new Date(m.created_at));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) {
      ultimo.mensagens.push(m);
    } else {
      grupos.push({ dia, mensagens: [m] });
    }
  }
  return grupos;
}

/**
 * O texto que a tela mostra. Um lugar só decide isto: se a mensagem foi
 * apagada, o `conteudo` que chegar (mesmo que não esteja vazio, por algum
 * caminho que não devia existir) nunca aparece — decisão 5, o texto morre no
 * banco, e a tela não é o segundo lugar que teria de lembrar disso.
 */
export function textoDaMensagem(m: ChatMensagem): string {
  return m.deleted_at ? 'Mensagem apagada' : m.conteudo;
}

function escapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quem foi citado como `@Nome` no texto (L11b, decisão 8). Quem resolve o
 * `@` para uma pessoa é a tela, no momento de enviar — o banco só guarda o
 * `uuid`, e é este o único lugar que decide "citou ou não".
 *
 * Casa `@` seguido do nome inteiro da pessoa, com um limite de palavra
 * depois (não deixa `@Ana` casar dentro de `@AnaMaria`) — é por isso que a
 * tela insere `@Nome Completo ` (com o espaço) ao escolher alguém da lista.
 */
export function extraiMencoes(texto: string, pessoas: { id: string; nome: string }[]): string[] {
  const encontrados = new Set<string>();
  for (const pessoa of pessoas) {
    if (!pessoa.nome.trim()) continue;
    const regex = new RegExp('@' + escapaRegex(pessoa.nome) + '(?![\\p{L}\\p{N}])', 'iu');
    if (regex.test(texto)) encontrados.add(pessoa.id);
  }
  return [...encontrados];
}

