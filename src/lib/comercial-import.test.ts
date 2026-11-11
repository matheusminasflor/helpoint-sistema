import { describe, expect, it } from 'vitest';
import {
  classificarCfop, competenciaDe, filialNoNomeDoArquivo, lerCadastroClientes, lerRelatorioVendas, prepararImportacao, problemaDoPeriodo, sugerirFilial,
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

  // A linha de TOTAIS que o próprio Forteplus imprime no fim do relatório
  // (quantidade | valor | desconto, sem CFOP) e o rótulo "Totais:" caem no
  // catch-all do leitor — o ramo que decide "o que não reconheço nunca vira
  // item". Ele nunca tinha fixture: na auditoria da L6a, trocá-lo por um
  // `continue` (sumir sem contar) manteve os dez testes verdes, e foi a
  // única mutação que sobreviveu. Com as duas linhas aqui, sumir sem contar
  // quebra a conferência acima — que é exatamente o que ela existe para
  // pegar.
  it('a linha de totais do relatório é descartada, e é CONTADA ao ser descartada', () => {
    expect(resultado.descartes.rodape).toBe(4);
    expect(resultado.itens.some((i) => i.valor_nota === 295646.17)).toBe(false);
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

  // 2026-09-27: o CSV do Forteplus não tem coluna de CNPJ, mas escreve o
  // documento DENTRO da razão social nos clientes pessoa física e MEI. Sem esta
  // extração, a carga de produção nasceria com 100% dos clientes sem documento — e
  // é pelo documento que o SAC reconhece o cliente. Medido na base de teste:
  // 119 CPFs achados nos nomes e 119 passando no dígito verificador, zero falso
  // positivo. Aqui a prova é sobre a fixture do arquivo real do dono.
  it('extrai o documento de dentro da razão social, quando ela o carrega', () => {
    const comDocumento = resultado.clientes.filter((c) => c.documento !== null);
    expect(comDocumento.length).toBe(resultado.comDocumento);
    expect(resultado.comDocumento).toBeGreaterThan(0);
    // Todo documento extraído tem forma de CPF (11) ou CNPJ (14) — nunca um
    // pedaço de número.
    for (const c of comDocumento) {
      expect([11, 14]).toContain(c.documento!.length);
    }
  });

  it('cliente com nome de empresa fica sem documento, e isso é o certo', () => {
    const semNumero = resultado.clientes.find((c) => !/\d/.test(c.razao_social));
    if (semNumero) expect(semNumero.documento).toBeNull();
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

describe('filialNoNomeDoArquivo', () => {
  // Decisão do dono (2026-09-24): o nome é OBRIGATÓRIO e a tela impede a
  // importação sem ele. O `motivo` é o que permite à tela dizer como
  // consertar — sem ele a pessoa só saberia que está bloqueada, não por quê.
  it('identifica a filial e não devolve motivo quando o nome é inequívoco', () => {
    expect(filialNoNomeDoArquivo('INBRAS.xlsx')).toEqual({ filial: 'INBRAS', motivo: null });
    expect(filialNoNomeDoArquivo('MF.xlsx')).toEqual({ filial: 'MF', motivo: null });
    expect(filialNoNomeDoArquivo('vendas_minasflor_2026.xlsx')).toEqual({ filial: 'MF', motivo: null });
  });

  it('distingue "tem as duas" de "não tem nenhuma" — são consertos diferentes', () => {
    expect(filialNoNomeDoArquivo('MF_INBRAS.xlsx')).toEqual({ filial: null, motivo: 'ambos' });
    expect(filialNoNomeDoArquivo('relatorio.xlsx')).toEqual({ filial: null, motivo: 'nenhum' });
  });

  it('não confunde MINASFLOR com MF por acidente de substring', () => {
    // MINASFLOR não contém "MF"; casa pela própria palavra. Se um dia alguém
    // "simplificar" a regra para só `includes('MF')`, este caso continua
    // passando — o que prova é o de cima, com o arquivo chamado minasflor.
    expect(filialNoNomeDoArquivo('MINASFLOR.xlsx').filial).toBe('MF');
  });

  it('não depende de caixa nem de extensão', () => {
    expect(filialNoNomeDoArquivo('inbras_2022_a_2026.XLSX').filial).toBe('INBRAS');
    expect(filialNoNomeDoArquivo('Mf setembro').filial).toBe('MF');
  });
});

describe('prepararImportacao — o arquivo agrupado por cliente (2026-11-11)', () => {
  const it_ = (doc: string, data: string, serie: string, cfop: string, cli: string, prod: string, qtd: number, valor: number) => ({
    emissao: data, documento: doc, serie, tipo_documento: 'NF', cfop, classe: classificarCfop(cfop), cliente_codigo: cli,
    cliente_nome: cli, produto_codigo: prod, produto_nome: prod, quantidade: qtd, valor_nota: valor, desconto: 0,
    vendedor_codigo: null, vendedor_nome: null, pedido: '1',
  });
  const leitura = (itens: ReturnType<typeof it_>[]) => ({
    itens, linhasLidas: itens.length + 3, cfopsDesconhecidos: [],
    totalImpresso: Math.round(itens.reduce((s, i) => s + i.valor_nota, 0) * 100) / 100,
    descartes: { cabecalho_repetido: 1, em_branco: 1, rodape: 1, grupo_cliente: 0, remessa_do_completo: 0 },
  });
  // Marta (1186), out/2026: a bonificação 1445 (s75) e o cashback 1 (s76) do mesmo produto, cada um na sua linha.
  const completo = leitura([
    it_('23440', '2026-10-23', '1', '6101', '1186', '233', 36, 447.12),
    it_('1445', '2026-10-23', '75', '6910', '1186', '233', 6, 74.52),
    it_('1', '2026-10-23', '76', '6910', '1186', '233', 18, 223.56),
    it_('23441', '2026-11-03', '1', '6910', '1186', '671', 20, 54),
  ]);
  const bonificacao = leitura(completo.itens.filter((i) => i.cfop === '6910'));

  it('o completo sozinho basta, e o período sugerido vai da primeira à última nota, em vários meses', () => {
    const r = prepararImportacao([{ nome: 'INBRAS ALL 2026.xlsx', leitura: completo }]);
    expect(r.leitura).toBe(completo);
    expect([r.primeira, r.ultima, r.conferidoComBonificacao]).toEqual(['2026-10-23', '2026-11-03', false]);
  });

  it('o de bonificação que bate é só conferência, em qualquer ordem', () => {
    const r = prepararImportacao([{ nome: 'BONI', leitura: bonificacao }, { nome: 'ALL', leitura: completo }]);
    expect(r.leitura).toBe(completo);
    expect(r.conferidoComBonificacao).toBe(true);
  });

  it('o de bonificação que não bate trava, dizendo o mês e o tipo', () => {
    const faltaCashback = leitura(bonificacao.itens.filter((i) => i.serie !== '76'));
    expect(() => prepararImportacao([{ nome: 'ALL', leitura: completo }, { nome: 'BONI', leitura: faltaCashback }]))
      .toThrow('10/2026 cashback: completo R$ 223.56 × bonificação R$ 0.00');
  });

  it('recusa o formato antigo, que junta documentos diferentes na mesma linha (Amil 23485, out/2026)', () => {
    const antigo = leitura([it_('23485', '2026-10-30', '1', '6107', '1615', '495', 6, 314.34), it_('23485', '2026-10-30', '76', '6910', '1615', '233', 60, 9700.58)]);
    expect(() => prepararImportacao([{ nome: 'ALL', leitura: antigo }])).toThrow(/a nota 23485 aparece nas séries 1 e 76.*agrupando por cliente/);
  });

  it('exige um completo, e só um de cada', () => {
    expect(() => prepararImportacao([{ nome: 'BONI', leitura: bonificacao }])).toThrow(/arquivo completo/);
    expect(() => prepararImportacao([{ nome: 'A', leitura: completo }, { nome: 'B', leitura: completo }])).toThrow(/Um de cada/);
  });
});

describe('problemaDoPeriodo — o período que quem importa confirma', () => {
  it('a semana de 02 a 08/11 cobre notas de 03 a 06/11', () => {
    expect(problemaDoPeriodo('2026-11-02', '2026-11-08', '2026-11-03', '2026-11-06')).toBeNull();
  });
  it('recusa período que deixa nota de fora, invertido ou em branco', () => {
    expect(problemaDoPeriodo('2026-11-04', '2026-11-08', '2026-11-03', '2026-11-06')).toContain('de 03/11/2026 a 06/11/2026');
    expect(problemaDoPeriodo('2026-11-08', '2026-11-02', '2026-11-03', '2026-11-06')).toMatch(/depois da final/);
    expect(problemaDoPeriodo('', '2026-11-08', '2026-11-03', '2026-11-06')).toMatch(/Informe o período/);
  });
});
