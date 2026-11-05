// A renovação automática do login confia no relógio do aparelho. Com relógio ou fuso errado, o navegador acha que o
// acesso ainda vale e o banco recusa com "JWT expired": foi o que travou os lançamentos do Comercial num notebook
// pessoal (chamado #331, 2026-11-05: 24 salvamentos recusados em 11 horas). Aqui quem manda é a resposta do servidor:
// recusou por acesso vencido, renova o login e repete o pedido uma vez, sem a pessoa perceber.
export function fetchQueRenovaSessao(
  renovar: () => Promise<string | null>,
  base: typeof fetch = (entrada, init) => fetch(entrada, init),
): typeof fetch {
  // Várias consultas falham juntas: uma renovação só atende todas.
  let renovacao: Promise<string | null> | null = null;

  return async (entrada, init) => {
    const resposta = await base(entrada, init);
    if (resposta.status !== 401) return resposta;
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (url.includes('/auth/v1/')) return resposta;
    const corpo = await resposta.clone().text().catch(() => '');
    if (!/jwt expired/i.test(corpo)) return resposta;

    renovacao ??= renovar().catch(() => null).finally(() => { renovacao = null; });
    const token = await renovacao;
    if (!token) return resposta;

    const headers = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    headers.set('Authorization', `Bearer ${token}`);
    return base(entrada, { ...init, headers });
  };
}
