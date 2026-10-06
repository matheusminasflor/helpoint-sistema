// TELA BRANCA DEPOIS DE PUBLICAR (dono, 2026-10-06: "às vezes a tela fica branca, aperto F5 e dá
// certo").
//
// As 84 telas carregam em pedaços (`lazy`). Cada publicação troca o nome dos pedaços; quem estava
// com o sistema aberto da versão anterior, ao abrir uma tela ainda não carregada, pede um pedaço
// que não existe mais — o import falha e, sem nada que segure, a tela fica branca. O F5 traz a
// versão nova e resolve. Aqui o sistema faz o F5 sozinho, UMA vez: se recarregou há pouco e o erro
// voltou, não é versão velha, e repetir viraria laço — aí quem mostra o erro é `ErroDaTela`.

const CHAVE = 'helpoint.recarregou-por-versao';
const JANELA_MS = 15_000;

/** O erro é de pedaço de tela que não veio (versão nova publicada, ou rede caiu no meio)? */
export function ehPedacoQueNaoVeio(erro: unknown): boolean {
  const texto = erro instanceof Error ? `${erro.name} ${erro.message}` : String(erro ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk .* failed|module script.*MIME type/i.test(texto);
}

/** Recarrega a página, no máximo uma vez a cada 15 s. Devolve se recarregou. */
export function recarregarUmaVez(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) ?? 0);
    if (Date.now() - ultima < JANELA_MS) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    // Sem sessionStorage (aba privada bloqueada): melhor não recarregar do que arriscar laço.
    return false;
  }
  window.location.reload();
  return true;
}
