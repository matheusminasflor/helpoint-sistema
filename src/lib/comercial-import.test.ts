import { describe, expect, it } from 'vitest';
import {
  classificarCfop, competenciaDe, lerCadastroClientes, lerRelatorioVendas, sugerirFilial,
} from './comercial-import';
import { FORTEPLUS_VENDAS_FIXTURE } from './__fixtures__/forteplus-vendas';
import { FORTEPLUS_CLIENTES_CP1252_BASE64 } from './__fixtures__/forteplus-clientes-cp1252';

function bytesDoBase64(b64: string): ArrayBuffer {
  const binario = atob(b64);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return bytes.buffer;
}

describe('classificarCfop', () => {
  // O que teria acontecido se o defeito estivesse lá: a linha de R$ 45.693,56
  // (CFOP 6901) entraria na curva de venda — 39% a mais em agosto da MF (§3.1).
  it('separa as quatro classes — venda e industrialização não se confundem', () => {
    expect(classificarCfop('6901')).toBe('industrializacao');
    expect(classificarCfop('5101')).toBe('venda');
    expect(classificarCfop('5910')).toBe('bonificacao');
    expect(classificarCfop('1202')).toBe('devolucao');
  });

  // Se o defeito estivesse lá: um CFOP novo seria somado como venda por
  // descuido, em vez de ficar visível esperando alguém classificar (§3.2).
  it('CFOP fora da lista vira "outros", nunca some nem vira venda', () => {
    expect(classificarCfop('9999')).toBe('outros');
  });
});

describe('lerRelatorioVendas — sobre a fixture real (scripts/extrair-fixture-vendas.js)', () => {
  const resultado = lerRelatorioVendas(FORTEPLUS_VENDAS_FIXTURE);

  // Se o defeito estivesse lá: um leitor que perde a última página, ou come
  // uma linha a cada cabeçalho repetido, entraria com o mês mais leve, em
  // silêncio, para sempre (§4.3 — é a mesma conferência que o banco recusa).
  it('linhasLidas fecha com itens + descartes', () => {
    const somaDescartes = Object.values(resultado.descartes).reduce((a, b) => a + b, 0);
    expect(resultado.linhasLidas).toBe(FORTEPLUS_VENDAS_FIXTURE.length);
    expect(resultado.itens.length + somaDescartes).toBe(resultado.linhasLidas);
  });

  // A fixture tem o cabeçalho de colunas repetido DUAS vezes (a assinatura
  // inicial e a mudança de página no meio do recorte). Se o defeito estivesse
  // lá, a segunda ocorrência viraria uma linha de "item" com produto e CFOP
  // vazios — lixo somado ao faturamento.
  it('o cabeçalho repetido no meio do arquivo não vira item', () => {
    expect(resultado.descartes.cabecalho_repetido).toBe(8);
    expect(resultado.itens.some((i) => i.cfop === '')).toBe(false);
  });

  // Se o defeito estivesse lá (lendo pelo cabeçalho, colunas 14/20, em vez das
  // reais 13/21 — §3.3): o produto viria vazio ou a quantidade seria lida da
  // coluna errada, sem erro nenhum na tela.
  it('lê produto da coluna 13 e quantidade da coluna 21 — não das que o cabeçalho impresso indica', () => {
    const primeiro = resultado.itens[0];
    expect(primeiro.produto_codigo).toBe('572');
    expect(primeiro.quantidade).toBe(6);
    expect(primeiro.valor_nota).toBeCloseTo(99.3, 2);
  });

  // Confere a fixture inteira contra os números somados na hora que ela foi
  // extraída (scripts/extrair-fixture-vendas.js, contra o xlsx real —
  // achado 10.4 da auditoria: o script citado antes aqui nunca existiu) —
  // qualquer refatoração futura do leitor que desvie destes totais quebra
  // este teste, não em produção.
  it('a soma de valor_nota por classe bate com os números conferidos na extração', () => {
    const porClasse = new Map<string, { linhas: number; valor: number }>();
    for (const item of resultado.itens) {
      const atual = porClasse.get(item.classe) ?? { linhas: 0, valor: 0 };
      atual.linhas++;
      atual.valor += item.valor_nota;
      porClasse.set(item.classe, atual);
    }
    expect(porClasse.get('venda')).toEqual({ linhas: 6, valor: expect.closeTo(372.3, 2) });
    expect(porClasse.get('bonificacao')).toEqual({ linhas: 3, valor: expect.closeTo(124.08, 2) });
    expect(porClasse.get('industrializacao')).toEqual({ linhas: 1, valor: 45693.56 });
    expect(porClasse.get('outros')).toEqual({ linhas: 1, valor: 250 });
    expect(porClasse.get('devolucao')).toEqual({ linhas: 1, valor: 100 });
  });
});

describe('competenciaDe', () => {
  // Recebe o `emissao` já convertido de `ItemVenda` ('aaaa-mm-dd') — achado
  // 11.2 da auditoria: era a duplicata de `i.emissao.slice(0,7) + '-01'` no
  // diálogo, que saiu. Se o defeito estivesse lá (usando `new Date()` em vez
  // de fatiar o texto): fuso horário poderia jogar o último dia do mês para
  // o mês seguinte.
  it('nota do último dia do mês fica no mês certo', () => {
    expect(competenciaDe('2026-08-31')).toBe('2026-08-01');
    expect(competenciaDe('2026-09-01')).toBe('2026-09-01');
  });
});

describe('lerCadastroClientes — sobre a fixture real (scripts/extrair-fixture-clientes.js)', () => {
  const resultado = lerCadastroClientes(bytesDoBase64(FORTEPLUS_CLIENTES_CP1252_BASE64));

  // Se o defeito estivesse lá: exatamente o que o painel atual do dono já
  // erra hoje — "AILSON JOS� MARTINS" e "SAL O REF" em vez de "SALÃO REF"
  // (§3.6). A prova aqui é o mesmo nome acentuado de verdade.
  it('lê Windows-1252 sem BOM corretamente — o acento sobrevive', () => {
    const ailson = resultado.clientes.find((c) => c.codigo === '1063');
    expect(ailson?.razao_social).toBe('AILSON JOSÉ MARTINS');
    expect(resultado.tabelas['SALÃO REF']).toBeGreaterThan(0);
  });

  // Se o defeito estivesse lá: cliente sem tabela receberia uma inventada, e
  // um inativo (`False`) contaria como ativo (§3.6 e §3.7 — tabela em branco
  // nunca se chuta).
  it('tabela em branco vira null; ATIVO "False" vira ativo: false', () => {
    const semTabela = resultado.clientes.find((c) => c.tabela_preco === null);
    expect(semTabela).toBeDefined();
    expect(resultado.semTabela).toBeGreaterThan(0);
    const inativo = resultado.clientes.find((c) => c.ativo === false);
    expect(inativo).toBeDefined();
  });

  // Achado 7 da auditoria: antes desta correção, `lerCadastroClientes`
  // aceitava QUALQUER arquivo de texto (nunca lançava) e produzia
  // "clientes" com `codigo` igual à linha inteira — que `com_importar_
  // clientes` grava por upsert, sobrescrevendo cadastro legítimo sem
  // desfazer. Mesma postura do leitor de vendas, que já recusa a ficha
  // errada (ver `lerRelatorioVendas — sobre a fixture real`, acima).
  it('recusa um arquivo de texto qualquer, sem o cabeçalho esperado', () => {
    const bytes = new TextEncoder().encode('isto não é um CSV de clientes\nlinha 2\n').buffer;
    expect(() => lerCadastroClientes(bytes)).toThrow(/não parece o CSV de clientes/);
  });

  // O caso que a auditoria descreveu de propósito: o relatório de VENDAS
  // (outro formato, outro leitor) passado para o leitor de CLIENTES.
  it('recusa o relatório de vendas passado para o leitor de clientes', () => {
    const linhaXlsxComoTexto = FORTEPLUS_VENDAS_FIXTURE.map((linha) => linha.join(';')).join('\n');
    const bytes = new TextEncoder().encode(linhaXlsxComoTexto).buffer;
    expect(() => lerCadastroClientes(bytes)).toThrow(/não parece o CSV de clientes/);
  });
});

describe('sugerirFilial', () => {
  // Se o defeito estivesse lá: um nome ambíguo atribuiria o mês à empresa
  // errada, e ninguém perceberia até o total não bater (§4.8).
  it('só sugere quando o nome é inequívoco; nunca decide sozinha', () => {
    expect(sugerirFilial('MF.xlsx')).toBe('MF');
    expect(sugerirFilial('INBRAS.xlsx')).toBe('INBRAS');
    expect(sugerirFilial('relatorio.xlsx')).toBeNull();
    expect(sugerirFilial('MF_INBRAS.xlsx')).toBeNull();
  });
});
