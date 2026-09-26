// O que a tela diz quando o banco recusa uma leitura — a regra, sem o toast.
//
// Leva C do docs/plano-geral.md. `src/App.tsx` montava `new QueryClient()` sem
// tratamento de erro, então **todo `unwrap` que lança dentro de um `useQuery`
// morria em silêncio**: o hook cumpre a regra 1 das cinco, lança de verdade, e a
// tela simplesmente não recebe dado. Quem escreveu o componente decidia, um a
// um, se tratava `isError` — e quando esquecia, falha de RLS virava "nenhum
// registro", que é exatamente o que a regra 1 existe para impedir, uma camada
// acima. Eu já havia corrigido isso tela por tela quatro vezes, sempre depois de
// uma auditoria apontar.
//
// **Mora aqui, e não dentro do `App.tsx`, por causa do teste.** `App.tsx` arrasta
// o roteador, o cliente do Supabase e as 60 páginas; importá-lo num teste exige
// `VITE_SUPABASE_URL` no momento do import, e o CI não tem `.env` — a mesma
// armadilha que `acesso-diretoria.ts` registrou. Regra pura fica em módulo sem
// dependência nenhuma, e o `App.tsx` só liga o fio.

/** O que o aviso diz: uma frase para a pessoa, e o detalhe técnico para a TI. */
export interface AvisoDeConsulta {
  titulo: string;
  detalhe: string | undefined;
}

/**
 * Erros que NÃO merecem aviso, porque outro mecanismo já está cuidando — e um
 * aviso a mais aqui seria ruído em cima de um redirecionamento que já acontece.
 *
 * Sessão vencida é o caso que importa: quando o token expira, TODA consulta da
 * tela falha de uma vez. O `AuthContext` derruba para o login sozinho; avisar
 * "não consegui ler" no meio disso conta uma história errada sobre o que
 * aconteceu (a pessoa pensaria em problema de dado, não em sessão).
 *
 * A comparação é por texto porque é o que o PostgREST entrega: não há código
 * estável para isso na resposta que chega até aqui.
 */
export function deveAvisar(erro: unknown): boolean {
  const texto = mensagemCrua(erro).toLowerCase();
  if (!texto) return true;
  // Sessão/token: o login já toma conta.
  if (texto.includes('jwt') || texto.includes('refresh token') || texto.includes('expired')) return false;
  // Consulta cancelada pelo próprio react-query (a pessoa saiu da tela antes de
  // a resposta chegar). Não é falha: é a tela mudando.
  if (texto.includes('abort')) return false;
  return true;
}

/**
 * A frase que a pessoa lê. Uma só, genérica de propósito: o aviso global não sabe
 * QUAL número faltou — quem sabe é o componente, e é por isso que os componentes
 * que já tratam `isError` continuam com o texto específico deles (a ficha do
 * cliente, a conciliação, a tela de Importações). Este é o chão, não o teto.
 *
 * "O que aparece pode estar incompleto" é a parte que faz o aviso valer: o perigo
 * nunca foi a tela vazia, foi a tela com MENOS dado parecendo completa.
 *
 * O detalhe técnico vai junto porque quem opera este sistema hoje é a própria TI
 * — "permission denied for table x" é a diferença entre chutar e saber. Cortado
 * em 180 caracteres: mensagem de Postgres com `CONTEXT` inteiro não cabe em toast
 * nenhum.
 */
export function avisoDaConsulta(erro: unknown): AvisoDeConsulta {
  const cru = mensagemCrua(erro).trim();
  return {
    titulo: 'Não consegui ler um dado desta tela. O que aparece pode estar incompleto — recarregue a página.',
    detalhe: cru ? cru.slice(0, 180) : undefined,
  };
}

/**
 * O `id` do toast. Sonner colapsa avisos com o mesmo `id` num só — e sem isso
 * uma tela com oito consultas que falham juntas (queda de rede, sessão perdida,
 * policy nova quebrada) empilharia oito avisos iguais, que é como se ensina
 * alguém a ignorar aviso.
 */
export const ID_DO_AVISO_DE_CONSULTA = 'consulta-falhou';

function mensagemCrua(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === 'string') return erro;
  // `unwrap` lança Error; mas erro de rede do fetch pode chegar como objeto com
  // `message`. Nunca `JSON.stringify` do desconhecido: já apareceu payload com
  // token dentro em log de erro de outros sistemas, e toast é tela.
  if (erro && typeof erro === 'object' && 'message' in erro) {
    const m = (erro as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}
