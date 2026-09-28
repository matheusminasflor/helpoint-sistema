// Leitor do "Relatório Geral de Cliente" do Forteplus — a FICHA CADASTRAL.
//
// POR QUE UM LEITOR PRÓPRIO, E NÃO O DE CLIENTES QUE JÁ EXISTE. O CSV que
// `lerCadastroClientes` (`@/lib/comercial-import`) lê é uma TABELA: cinco colunas,
// uma linha por cliente, e ele traz só código, razão social, fantasia, tabela e
// ativo. O que falta no cadastro — CNPJ, endereço, CEP, cidade, estado, e-mail,
// telefone — não está lá, e é justamente o que esta ficha carrega. Medido no
// arquivo real de 2026-09-28 (`scripts/inspecionar-ficha-clientes.mjs`), 406 fichas:
//
//   CNPJ/CPF, ENDEREÇO, CEP, ESTADO, CIDADE ....... 100%
//   E-MAIL ....................................... 79%
//   TELEFONE ..................................... 49%   CELULAR ... 40%
//   VENDEDOR ...................................... 0% (1 ficha)   REGIÃO ... 1% (3)
//
// Ou seja: a ficha resolve documento e endereço, e **não** resolve carteira —
// vendedor vem vazio no Forteplus. Quem atribui carteira é a tela do Comercial.
//
// O FORMATO. Não é tabela: é um BLOCO por cliente, com RÓTULO numa célula e VALOR
// na célula seguinte preenchida da mesma linha, em três colunas de rótulo (1, 9 e
// 16). Ler por posição de coluna aqui erraria — o valor do `CEP:` está na coluna 4,
// o do `CIDADE:` na 13 e o do `CALCULA ST:` na 24, e nada disso é estável entre
// rótulos. Então o leitor casa **rótulo → próxima célula preenchida**, e é imune a
// deslocamento de coluna.
//
// A FICHA NÃO TEM CÓDIGO DE CLIENTE. É o fato que manda no importador: o casamento
// com a base é pela RAZÃO SOCIAL, que é o mesmo texto do CSV (verificado no banco
// em 2026-09-28: 5 de 5 amostras casaram exato). O rodapé de cada página repete
// `CNPJ:` — o da INBRAS, não o do cliente —, `Página:` e `Data e Hora:`; por isso o
// leitor só aceita os rótulos que conhece, em vez de varrer tudo que termina em
// dois-pontos.
import * as XLSX from 'xlsx';
import { soDigitos, documentoValido } from '@/lib/documento';

export interface FichaCliente {
  /** A razão social exatamente como a ficha traz — é a chave do casamento. */
  razao_social: string;
  /** CPF ou CNPJ, só dígitos. `null` quando não passa no dígito verificador. */
  documento: string | null;
  endereco: string | null;
  cep: string | null;
  cidade: string | null;
  /** UF em duas letras. */
  estado: string | null;
  email: string | null;
  /** Telefone fixo; quando vazio, vale o celular — é um campo só no cadastro. */
  telefone: string | null;
}

export interface LeituraFicha {
  fichas: FichaCliente[];
  /** Quantas fichas trouxeram cada campo — o que a tela mostra antes de gravar. */
  preenchidos: Record<'documento' | 'endereco' | 'cep' | 'cidade' | 'estado' | 'email' | 'telefone', number>;
  /** Razões sociais repetidas dentro do próprio arquivo, se houver. */
  repetidas: string[];
}

/**
 * Os rótulos que este leitor conhece, normalizados. Um rótulo fora desta lista é
 * ignorado — inclusive o `CNPJ:` do rodapé, que é o da própria INBRAS e, lido como
 * se fosse do cliente, gravaria o mesmo CNPJ em 135 clientes.
 */
const ROTULOS = {
  NOME: 'nome',
  'CNPJ/CPF': 'documento',
  ENDERECO: 'endereco',
  CEP: 'cep',
  CIDADE: 'cidade',
  ESTADO: 'estado',
  'E-MAIL': 'email',
  TELEFONE: 'telefone',
  CELULAR: 'celular',
} as const;

type Campo = (typeof ROTULOS)[keyof typeof ROTULOS];

function normalizarRotulo(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/:$/, '')
    .trim()
    .toUpperCase();
}

/** As células preenchidas de uma linha, como pares [coluna, texto]. */
function celulas(row: unknown[] | undefined): [number, string][] {
  return (row ?? [])
    .map((c, i): [number, string] => [i, String(c ?? '').trim()])
    .filter(([, v]) => v !== '');
}

/** O CEP em `00000-000`; `null` quando não tem os oito dígitos. */
function normalizarCep(bruto: string): string | null {
  const d = soDigitos(bruto);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
}

export function lerFichaClientes(matriz: unknown[][]): LeituraFicha {
  const fichas: FichaCliente[] = [];
  let atual: Partial<Record<Campo, string>> | null = null;

  const fechar = () => {
    if (!atual?.nome) { atual = null; return; }
    const documentoBruto = soDigitos(atual.documento ?? '');
    fichas.push({
      razao_social: atual.nome,
      // Passa pelo dígito verificador: a ficha traz o CNPJ formatado e confiável,
      // mas gravar documento inválido no cadastro quebra o reconhecimento do SAC,
      // que compara por documento. Melhor `null` do que um número que não é de
      // ninguém. Ver `documentoValido` em `@/lib/documento`.
      documento: documentoValido(documentoBruto) ? documentoBruto : null,
      endereco: atual.endereco ?? null,
      cep: atual.cep ? normalizarCep(atual.cep) : null,
      cidade: atual.cidade ?? null,
      // A UF vem sempre em duas letras no relatório; qualquer coisa diferente é
      // ruído de célula mesclada e não entra.
      estado: atual.estado && /^[A-Za-z]{2}$/.test(atual.estado) ? atual.estado.toUpperCase() : null,
      email: atual.email?.includes('@') ? atual.email.toLowerCase() : null,
      // Fixo primeiro, celular como reserva: o cadastro tem UM campo de telefone, e
      // 49% têm fixo contra 40% com celular — sem a reserva, 1 em cada 5 clientes
      // que TEM telefone entraria sem nenhum.
      telefone: atual.telefone ?? atual.celular ?? null,
    });
    atual = null;
  };

  for (const row of matriz) {
    const c = celulas(row);
    if (c.length === 0) continue;

    for (let i = 0; i < c.length; i++) {
      const [, bruto] = c[i];
      const rotulo = normalizarRotulo(bruto);
      // `CELULAR` vem SEM dois-pontos no relatório (medido); os outros vêm com.
      const eRotulo = bruto.trim().endsWith(':') || rotulo === 'CELULAR';
      if (!eRotulo) continue;
      const campo = (ROTULOS as Record<string, Campo | undefined>)[rotulo];
      if (!campo) continue;

      // `NOME:` abre ficha: fecha a anterior antes de começar a próxima.
      if (campo === 'nome') fechar();
      if (campo === 'nome') atual = {};
      if (!atual) continue;

      // O valor é a próxima célula preenchida da MESMA linha — desde que ela não
      // seja outro rótulo. Rótulo seguido de rótulo significa campo vazio.
      const proxima = c[i + 1];
      if (!proxima) continue;
      const proxRotulo = normalizarRotulo(proxima[1]);
      const proxEhRotulo = proxima[1].trim().endsWith(':') || proxRotulo === 'CELULAR';
      if (proxEhRotulo) continue;
      atual[campo] = proxima[1];
    }
  }
  fechar();

  const preenchidos = {
    documento: fichas.filter((f) => f.documento).length,
    endereco: fichas.filter((f) => f.endereco).length,
    cep: fichas.filter((f) => f.cep).length,
    cidade: fichas.filter((f) => f.cidade).length,
    estado: fichas.filter((f) => f.estado).length,
    email: fichas.filter((f) => f.email).length,
    telefone: fichas.filter((f) => f.telefone).length,
  };

  const vistos = new Set<string>();
  const repetidas: string[] = [];
  for (const f of fichas) {
    const chave = f.razao_social.toUpperCase();
    if (vistos.has(chave)) { if (!repetidas.includes(f.razao_social)) repetidas.push(f.razao_social); }
    else vistos.add(chave);
  }

  return { fichas, preenchidos, repetidas };
}

/**
 * Lê o .xlsx e recusa arquivo que não seja esta ficha.
 *
 * Mesma postura de `lerCadastroClientes` (achado 7 da auditoria do Comercial): sem
 * checar a assinatura, o leitor aceitava qualquer planilha e produzia "clientes"
 * inventados que o upsert gravava por cima do cadastro legítimo. Aqui a assinatura
 * é o título do relatório, que aparece no rodapé de toda página.
 */
export async function lerFichaDeArquivo(file: File): Promise<LeituraFicha> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('A planilha está vazia. Nada foi importado.');
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });

  const titulo = matriz
    .slice(0, 40)
    .flatMap((r) => celulas(r).map(([, v]) => v))
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!titulo.includes('relatorio geral de cliente')) {
    throw new Error(
      'Este arquivo não parece o "Relatório Geral de Cliente" do Forteplus — ' +
      'não encontrei o título nas primeiras linhas. Nada foi importado.'
    );
  }

  const leitura = lerFichaClientes(matriz);
  if (leitura.fichas.length === 0) {
    throw new Error('Não encontrei nenhuma ficha de cliente neste arquivo. Nada foi importado.');
  }
  return leitura;
}
