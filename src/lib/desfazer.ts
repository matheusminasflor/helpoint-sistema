// "FEITO · DESFAZER" (proposta "Helpoint no dia a dia", regra 1, etapa 1, aprovada em 2026-10-24): assumir, atribuir,
// mudar status, liquidar e mover compra aparecem na hora, e o banco só grava depois de 8 segundos. Desfazer dentro
// desse tempo não grava nada — nem aviso, nem automação, nem histórico.
//
// Por que esperar em vez de gravar e "desfazer" com outra gravação: o chamado tem 26 gatilhos (avisos ao solicitante,
// automações, prazo, primeira resposta). Uma gravação de volta os dispararia de novo, e a pessoa receberia "em
// andamento" e depois "aberto" de um clique que nunca aconteceu.
//
// ponytail: fechar a aba nos 8 s grava na hora (`gravarTudoAgora`, chamado no `beforeunload`, que também pergunta se
// a pessoa quer sair). Se o navegador matar a página antes do pedido sair, a ação se perde — o teto conhecido.
import { toast } from 'sonner';

export const TEMPO_PARA_DESFAZER = 8000;

interface Pendente {
  gravar: () => Promise<unknown>;
  depois: (erro?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendentes = new Map<string, Pendente>();

async function executa(chave: string, p: Pendente) {
  if (pendentes.get(chave) === p) pendentes.delete(chave);
  clearTimeout(p.timer);
  try {
    await p.gravar();
  } catch (erro) {
    p.depois(erro);
    return;
  }
  p.depois();
}

/**
 * Agenda a gravação e mostra "mensagem · Desfazer" por 8 s.
 * - `chave`: o que está sendo mexido (ex.: `chamado:<id>`). Uma segunda ação na mesma chave grava a primeira na hora.
 * - `aoDesfazer`: volta a tela para como estava (nada foi ao banco).
 * - `depois`: roda quando a gravação termina; com `erro`, ela falhou e a tela precisa voltar à verdade do banco.
 */
export function feitoComDesfazer({ chave, mensagem, gravar, aoDesfazer, depois }: {
  chave: string;
  mensagem: string;
  gravar: () => Promise<unknown>;
  aoDesfazer: () => void;
  depois: (erro?: unknown) => void;
}) {
  const anterior = pendentes.get(chave);
  if (anterior) void executa(chave, anterior);
  const p: Pendente = { gravar, depois, timer: setTimeout(() => void executa(chave, p), TEMPO_PARA_DESFAZER) };
  pendentes.set(chave, p);
  toast.success(mensagem, {
    id: chave,
    duration: TEMPO_PARA_DESFAZER,
    action: {
      label: 'Desfazer',
      onClick: () => {
        if (pendentes.get(chave) !== p) return;
        clearTimeout(p.timer);
        pendentes.delete(chave);
        aoDesfazer();
      },
    },
  });
}

/** Grava já tudo o que está esperando (a página vai fechar). */
export function gravarTudoAgora() {
  for (const [chave, p] of [...pendentes]) void executa(chave, p);
}

export const temGravacaoEsperando = () => pendentes.size > 0;

// Uma vez por página (o `AppLayout` remonta a cada rota): fechar ou recarregar com algo esperando grava já e pergunta.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!temGravacaoEsperando()) return;
    gravarTudoAgora();
    e.preventDefault();
    e.returnValue = '';
  });
}
