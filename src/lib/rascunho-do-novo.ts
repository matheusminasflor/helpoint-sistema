// O texto do Novo sobrevive ao "voltar" do celular (rodada 3, correção 7 do desenho aprovado). O gesto de voltar troca
// o passo no endereço (`?assunto=` → `?setor=`) e desmonta o formulário sem passar pelo "Descartar o que você
// escreveu?" — título e descrição sumiam. Fica guardado por pessoa e assunto, só na aba (sessionStorage): fechou a
// aba, foi embora. Sem acesso ao armazenamento (aba anônima bloqueada), segue como antes.
// ponytail: só título e descrição; os campos próprios da categoria e os anexos não voltam. Se fizer falta, guardar
// `dynamicValues` aqui também.
export interface RascunhoDoNovo {
  titulo: string;
  descricao: string;
}

const chave = (pessoa: string, assunto: string) => `rascunho-do-novo:${pessoa}:${assunto}`;

export function lerRascunho(pessoa: string, assunto: string): RascunhoDoNovo | null {
  try {
    const v = sessionStorage.getItem(chave(pessoa, assunto));
    return v ? (JSON.parse(v) as RascunhoDoNovo) : null;
  } catch {
    return null;
  }
}

export function guardarRascunho(pessoa: string, assunto: string, r: RascunhoDoNovo) {
  try {
    if (r.titulo.trim() || r.descricao.trim()) sessionStorage.setItem(chave(pessoa, assunto), JSON.stringify(r));
    else sessionStorage.removeItem(chave(pessoa, assunto));
  } catch { /* sem armazenamento: vale a tela aberta */ }
}

export function apagarRascunho(pessoa: string, assunto: string) {
  try { sessionStorage.removeItem(chave(pessoa, assunto)); } catch { /* idem */ }
}
