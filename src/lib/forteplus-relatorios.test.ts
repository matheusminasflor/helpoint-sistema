import { describe, expect, it } from 'vitest';
import { lerFichaClientes } from '@/lib/forteplus-ficha';
import { lerForteplusFin, tipoDoRelatorio, totalImpresso } from '@/lib/forteplus-fin';
import {
  FORTEPLUS_FICHA_FIXTURE,
  FORTEPLUS_PAGAR_FIXTURE,
  FORTEPLUS_RECEBER_FIXTURE,
} from '@/lib/__fixtures__/forteplus-relatorios';

describe('lerFichaClientes — a ficha cadastral do Forteplus', () => {
  const r = lerFichaClientes(FORTEPLUS_FICHA_FIXTURE);

  it('acha uma ficha por "NOME:", e só por ele', () => {
    // Quatro clientes na fixture. Se o rodapé de página ou o cabeçalho repetido
    // virasse ficha, sairiam cinco ou seis.
    expect(r.fichas.map((f) => f.razao_social)).toEqual([
      'COMERCIAL FIXTURE UM LTDA',
      'FIXTURE DOIS COMERCIO DE COSMETICOS',
      'FIXTURE TRES DISTRIBUIDORA ME',
      '111.444.777 FIXTURE QUATRO DA SILVA',
    ]);
  });

  it('lê o valor na próxima célula preenchida, não numa coluna fixa', () => {
    // `CEP:` tem o valor na coluna 4 e `CIDADE:` na 13 — quem lê por posição erra um
    // dos dois.
    expect(r.fichas[0]).toEqual({
      razao_social: 'COMERCIAL FIXTURE UM LTDA',
      documento: '11222333000181',
      endereco: 'Rua Um Nº 10 Complemento SALA 2 - Bairro Centro',
      cep: '30110-001',
      cidade: 'Belo Horizonte',
      estado: 'MG',
      email: 'contato@fixtureum.com.br',
      telefone: '(31)3333-1111',
    });
  });

  it('NÃO confunde o CNPJ do rodapé (o da INBRAS) com o do cliente', () => {
    // O rodapé de cada página traz `CNPJ: 07.025.603/0001-97`. Lido como rótulo de
    // cliente, ele gravaria o CNPJ da própria empresa em todo mundo.
    expect(r.fichas.map((f) => f.documento)).not.toContain('07025603000197');
  });

  it('cai no celular quando não há telefone fixo', () => {
    // 49% das fichas reais têm fixo e outros 40% só celular. Sem a reserva, 1 em cada
    // 5 clientes que TEM telefone entraria sem nenhum.
    expect(r.fichas[1].telefone).toBe('(19)98888-2222');
  });

  it('deixa o telefone nulo quando não há fixo nem celular', () => {
    expect(r.fichas[2].telefone).toBeNull();
  });

  it('deixa nulo o e-mail que a ficha não traz', () => {
    expect(r.fichas[1].email).toBeNull();
    expect(r.fichas[2].email).toBeNull();
  });

  it('lê CPF na mesma coluna que lê CNPJ', () => {
    expect(r.fichas[3].documento).toBe('11144477735');
    expect(r.fichas[3].cidade).toBe('Porto Alegre');
    expect(r.fichas[3].estado).toBe('RS');
  });

  it('conta o que cada campo trouxe, que é o que a tela mostra antes de gravar', () => {
    expect(r.preenchidos).toEqual({
      documento: 4, endereco: 4, cep: 4, cidade: 4, estado: 4, email: 2, telefone: 3,
    });
  });

  it('recusa documento que não passa no dígito verificador', () => {
    const comLixo = FORTEPLUS_FICHA_FIXTURE.map((row) => [...(row as unknown[])]);
    // A linha 5 da fixture é o `CNPJ/CPF:` do primeiro cliente; o valor está na 4.
    comLixo[5][4] = '11.222.333/0001-99';
    // Documento inválido gravado no cadastro quebra o reconhecimento do SAC, que
    // compara por documento. Melhor nulo do que um número que não é de ninguém.
    expect(lerFichaClientes(comLixo).fichas[0].documento).toBeNull();
  });
});

describe('lerForteplusFin — os dois relatórios financeiros', () => {
  it('reconhece o tipo pelo título, não pelo nome do arquivo', () => {
    expect(tipoDoRelatorio(FORTEPLUS_RECEBER_FIXTURE)).toBe('receber');
    expect(tipoDoRelatorio(FORTEPLUS_PAGAR_FIXTURE)).toBe('pagar');
    expect(tipoDoRelatorio([['uma planilha qualquer']])).toBeNull();
  });

  describe('contas a receber', () => {
    const r = lerForteplusFin(FORTEPLUS_RECEBER_FIXTURE, 'receber');

    it('lê os quatro títulos e ignora grupo, subtotal, rodapé e cabeçalho repetido', () => {
      expect(r.linhas).toHaveLength(4);
      expect(r.descartadas).toEqual([]);
    });

    it('fecha com o "Totais:" que o próprio relatório imprime', () => {
      // É a conferência que achou o filtro errado em 2026-09-28: o leitor somava
      // 108.728,88 onde o relatório imprimia 125.983,90.
      expect(r.totalImpresso).toBe(1000);
      expect(r.total).toBeCloseTo(1000, 2);
    });

    it('lê o vencimento da coluna do DADO, não da coluna do rótulo', () => {
      // "Vencimento" está rotulado na coluna 9 e o dado está na 10. Lendo a 9 o
      // leitor acha vazio e descarta TODAS as linhas — foi o que o caminho genérico
      // fazia, e por isso importar o Forteplus trazia zero lançamentos.
      expect(r.linhas[0].due_date).toBe('2023-10-15');
      expect(r.linhas[0].amount).toBe(1000);
      expect(r.linhas[0].competence).toBe('2023-10-01');
    });

    it('aceita título SEM número de documento', () => {
      // Recibo, DAS, taxa e pagamento avulso vêm sem nota fiscal — 53 dos 93 títulos
      // do relatório real de contas a pagar.
      expect(r.linhas[1].document_number).toBeNull();
      expect(r.linhas[1].amount).toBe(250.5);
    });

    it('preserva o sinal da nota de crédito, que ABATE', () => {
      // Com `Math.abs` os 300 deixariam de abater E entrariam como receita: o
      // recebível inflaria em 600.
      expect(r.linhas[2].amount).toBe(-300);
    });

    it('dá "pago" a quem tem saldo zero, com a data do vencimento', () => {
      // O relatório não traz o dia do pagamento, e o CHECK `fin_entries_paga_tem_data`
      // exige data. Hoje jogaria anos de contas pagas no mês corrente.
      expect(r.linhas[3].status).toBe('paid');
      expect(r.linhas[3].settled_at).toBe('2026-03-10');
      expect(r.linhas[0].status).toBe('pending');
      expect(r.linhas[0].settled_at).toBeNull();
    });

    it('dá a cada título um external_id, que é o que impede duplicar na reimportação', () => {
      expect(r.linhas.map((l) => l.external_id)).toEqual([
        'forteplus:receber:53', 'forteplus:receber:54',
        'forteplus:receber:6299', 'forteplus:receber:7001',
      ]);
    });

    it('guarda o vendedor e o código do cliente na observação, não em coluna própria', () => {
      // `fin_entries` não tem coluna de vendedor, e o campo do Forteplus vem
      // contaminado: "FINANCEIRO APROVADO" e "FINANCEIRO CONFERENCIA" aparecem no
      // meio de nomes de gente (medido: 12 valores distintos no arquivo real).
      expect(r.linhas[0].notes).toContain('Vendedor no Forteplus: VENDEDOR FIXTURE');
      expect(r.linhas[0].notes).toContain('Código no Forteplus: 1355');
      expect(r.linhas[0].contraparte_codigo).toBe('1355');
      expect(r.vendedores).toContain('FINANCEIRO CONFERENCIA');
    });

    it('não tem plano de contas — o relatório de receber não traz', () => {
      expect(r.planosDeConta).toEqual([]);
      expect(r.linhas[0].category).toBeNull();
    });
  });

  describe('contas a pagar', () => {
    const r = lerForteplusFin(FORTEPLUS_PAGAR_FIXTURE, 'pagar');

    it('lê os três títulos e fecha com o total impresso', () => {
      expect(r.linhas).toHaveLength(3);
      expect(r.totalImpresso).toBe(5174.78);
      expect(r.total).toBeCloseTo(5174.78, 2);
    });

    it('usa as posições do relatório de PAGAR, que são outras', () => {
      // Valor na coluna 19 (no de receber é a 22), emissão na 8, parcela na 6.
      expect(r.linhas[0].amount).toBe(2728.75);
      expect(r.linhas[0].due_date).toBe('2023-08-20');
      expect(r.linhas[0].notes).toContain('Emissão: 21/07/2023');
    });

    it('traz o recibo que não tem nota fiscal', () => {
      expect(r.linhas[1].document_number).toBeNull();
      expect(r.linhas[1].amount).toBe(2566.41);
      expect(r.linhas[1].description).toContain('RC');
    });

    it('vira o plano de contas em categoria do lançamento', () => {
      // São 25 planos no arquivo real, e cada um é exatamente a categoria que o
      // Financeiro usaria à mão.
      expect(r.linhas[0].category).toBe('Não Classificado');
      expect(r.linhas[1].category).toBe('Prestadores de Serviço');
      expect(r.planosDeConta).toEqual([
        'Compra de Embalagens', 'Não Classificado', 'Prestadores de Serviço',
      ]);
    });

    it('limpa o "N/I" da forma de pagamento', () => {
      // "N/I" é o "não informado" do Forteplus. Gravado como texto, viraria uma forma
      // de pagamento chamada N/I nos relatórios do Financeiro.
      expect(r.linhas[0].payment_method).toBeNull();
      expect(r.linhas[1].payment_method).toBe('Boleto');
    });
  });

  it('acha o "Totais:" e não confunde com o "Total:" da página', () => {
    expect(totalImpresso(FORTEPLUS_RECEBER_FIXTURE)).toBe(1000);
    expect(totalImpresso([['nada aqui']])).toBeNull();
  });
});
