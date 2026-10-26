// O MODELO DE COLABORADORES do RH (rodada 2, R4; decisões do dono de 2026-10-25). O RH baixa o modelo (vazio, ou com a
// lista atual para completar — as pessoas copiadas do login entram sem CPF), preenche e importa. Quem acha a pessoa,
// confere e grava é o banco (`rh_importar_colaboradores`): aqui só se lê a planilha. O molde é `modelo-de-clientes.ts`.
//
// Obrigatórios: nome, CPF, admissão, empresa, setor e cargo (o CPF identifica: importar de novo atualiza). O resto é
// opcional, e célula vazia não apaga o que está gravado.
import * as XLSX from 'xlsx';
import { normalizeHeader, parseAmount, parseDate } from '@/lib/planilha';

export const ABA_DO_MODELO_DE_COLABORADORES = 'COLABORADORES';
export const COLUNAS_DO_MODELO_DE_COLABORADORES = [
  'NOME', 'CPF', 'ADMISSÃO', 'EMPRESA', 'SETOR', 'CARGO', 'E-MAIL', 'SALÁRIO', 'CONTRATO', 'E-MAIL DO GESTOR',
  'NASCIMENTO', 'MATRÍCULA', 'CENTRO DE CUSTO', 'FIM DAS ÚLTIMAS FÉRIAS',
] as const;
export const OBRIGATORIAS_DO_MODELO = ['NOME', 'CPF', 'ADMISSÃO', 'EMPRESA', 'SETOR', 'CARGO'] as const;

/** Uma linha como vai para o banco; `linha` é o número dela na planilha (para a prévia dizer onde está o erro). */
export interface LinhaDoColaborador {
  linha: number;
  nome: string;
  cpf: string;
  admissao: string | null;
  empresa: string;
  setor: string;
  cargo: string;
  email?: string;
  salario?: number;
  contrato?: string;
  gestor_email?: string;
  nascimento?: string;
  matricula?: string;
  centro_custo?: string;
  ultimas_ferias_fim?: string;
}

/** O colaborador como o sistema o escreve no modelo ("baixar a lista atual"). Sem salário: ele não sai do banco. */
export interface ColaboradorDoModelo {
  full_name: string | null; cpf: string | null; admission_date: string | null; empresa: string | null;
  department: string | null; job_title: string | null; access_email: string | null; contract_type: string | null;
  birth_date: string | null; matricula: string | null; last_vacation_end?: string | null;
}

export interface LeituraDoModeloDeColaboradores {
  linhas: LinhaDoColaborador[];
  /** Linha que não entra por algo que dá para ver já na planilha (data que não é data, salário que não é número). */
  recusadas: { linha: number; motivo: string }[];
}

export class ModeloDeColaboradoresInvalido extends Error {}

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const dataBR = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** A matriz do modelo: cabeçalho + uma linha por colaborador, em ordem de nome. */
export function linhasDoModeloDeColaboradores(colaboradores: ColaboradorDoModelo[]): string[][] {
  return [
    [...COLUNAS_DO_MODELO_DE_COLABORADORES],
    ...[...colaboradores]
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR'))
      .map((c) => [
        c.full_name ?? '', c.cpf ?? '', dataBR(c.admission_date), c.empresa ?? '', c.department ?? '', c.job_title ?? '',
        c.access_email ?? '', '', c.contract_type ?? '', '', dataBR(c.birth_date), c.matricula ?? '', '',
        dataBR(c.last_vacation_end),
      ]),
  ];
}

/** Gera e baixa o modelo — vazio (`[]`) ou com a lista atual. */
export function baixarModeloDeColaboradores(colaboradores: ColaboradorDoModelo[], arquivo: string) {
  const aba = XLSX.utils.aoa_to_sheet(linhasDoModeloDeColaboradores(colaboradores));
  aba['!cols'] = [34, 16, 12, 16, 16, 22, 30, 12, 14, 30, 12, 12, 16, 14].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, ABA_DO_MODELO_DE_COLABORADORES);
  XLSX.writeFile(wb, arquivo);
}

/**
 * Lê o modelo (nome da aba → matriz, como `readSheets` devolve, com as datas ainda como o Excel as guarda). Recusa com
 * `ModeloDeColaboradoresInvalido` o que não é o modelo: sem a aba COLABORADORES, ou com outro cabeçalho.
 */
export function lerModeloDeColaboradores(planilha: Record<string, unknown[][]>): LeituraDoModeloDeColaboradores {
  const nomeDaAba = Object.keys(planilha)
    .find((n) => normalizeHeader(n) === normalizeHeader(ABA_DO_MODELO_DE_COLABORADORES));
  if (!nomeDaAba) {
    throw new ModeloDeColaboradoresInvalido('Esta planilha não é o modelo de colaboradores (falta a aba COLABORADORES). Baixe o modelo e preencha nele.');
  }
  const [cabecalho = [], ...brutas] = planilha[nomeDaAba];
  const esperado = COLUNAS_DO_MODELO_DE_COLABORADORES.map(normalizeHeader);
  if (esperado.some((c, i) => normalizeHeader(cabecalho[i]) !== c)) {
    throw new ModeloDeColaboradoresInvalido(
      `O cabeçalho da aba COLABORADORES não é o do modelo (${COLUNAS_DO_MODELO_DE_COLABORADORES.join(' | ')}). Baixe o modelo e preencha nele.`,
    );
  }

  const linhas: LinhaDoColaborador[] = [];
  const recusadas: { linha: number; motivo: string }[] = [];
  brutas.forEach((celulas, i) => {
    const numero = i + 2;
    const c = (k: number) => texto(celulas[k]);
    if (!c(0) && !c(1)) return; // linha vazia
    const motivos: string[] = [];
    const data = (k: number, nome: string) => {
      if (!c(k)) return undefined;
      const iso = parseDate(celulas[k]);
      if (!iso) motivos.push(`${nome} "${c(k)}" não é data`);
      return iso ?? undefined;
    };
    const admissao = data(2, 'admissão');
    const nascimento = data(10, 'nascimento');
    const ferias = data(13, 'fim das últimas férias');
    let salario: number | undefined;
    if (c(7)) {
      const v = parseAmount(celulas[7]);
      if (v === null) motivos.push(`salário "${c(7)}" não é número`);
      else salario = v;
    }
    if (motivos.length) { recusadas.push({ linha: numero, motivo: motivos.join('; ') }); return; }
    const linha: LinhaDoColaborador = {
      linha: numero, nome: c(0), cpf: c(1), admissao: admissao ?? null, empresa: c(3), setor: c(4), cargo: c(5),
    };
    const por = <K extends keyof LinhaDoColaborador>(campo: K, valor: LinhaDoColaborador[K] | undefined | '') => {
      if (valor !== undefined && valor !== '') linha[campo] = valor;
    };
    por('email', c(6).toLowerCase());
    por('salario', salario);
    por('contrato', c(8));
    por('gestor_email', c(9).toLowerCase());
    por('nascimento', nascimento);
    por('matricula', c(11));
    por('centro_custo', c(12));
    por('ultimas_ferias_fim', ferias);
    linhas.push(linha);
  });
  return { linhas, recusadas };
}
