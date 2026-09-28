// Fixtures dos três relatórios do Forteplus: a ficha cadastral de clientes e os
// dois relatórios financeiros (contas a pagar e contas a receber).
//
// POR QUE ESTAS SÃO ESCRITAS À MÃO, se `forteplus-vendas.ts` é GERADA do xlsx real.
// Porque o conteúdo é diferente: o relatório de vendas tem nome de cliente e valor,
// e estes três têm **CNPJ, endereço, e-mail e telefone de 406 clientes reais**.
// Recortar o arquivo real para dentro do repositório publicaria isso. Então a
// FORMA é copiada do arquivo real, célula por célula, com as posições medidas em
// 2026-09-28 (`scripts/inspecionar-ficha-clientes.mjs` e
// `scripts/inspecionar-fin-forteplus.mjs`), e os VALORES são inventados.
//
// O QUE PROTEGE CONTRA UM VALOR DIGITADO ERRADO — o motivo de o outro ser gerado.
// Os relatórios financeiros imprimem o próprio "Totais:", e o teste confere a soma
// das linhas contra ele. Um dígito trocado em qualquer parcela quebra o teste; não
// dá para "consertar" a fixture sem consertar o total, e não dá para consertar o
// total sem somar as parcelas. A fixture se audita sozinha.
//
// Os CNPJ inventados passam no dígito verificador de verdade (é o que `documentoValido`
// exige): sem isso o leitor devolveria `documento: null` e o teste provaria o contrário
// do que quer provar.

/**
 * A ficha cadastral: um BLOCO por cliente, rótulo numa coluna e valor na próxima
 * célula preenchida. Rótulos nas colunas 1, 9 e 16; valores em 4, 11, 13 e 24.
 *
 * Os quatro clientes cobrem, nesta ordem, o que o arquivo real tem:
 *   1. ficha completa (fixo E celular);
 *   2. ficha SEM e-mail e SEM telefone fixo, com celular — prova a reserva;
 *   3. ficha sem e-mail, sem fixo e sem celular — telefone tem de sair `null`;
 *   4. CPF em vez de CNPJ, com o documento embutido no nome (pessoa física).
 *
 * E o recorte inclui o RODAPÉ de página, que repete `CNPJ:` — o da INBRAS. Sem ele
 * na fixture, o leitor poderia gravar o CNPJ da própria empresa em todo cliente e o
 * teste ficaria verde.
 */
const L = (pares: [number, string][]): unknown[] => {
  const row = new Array(42).fill('');
  for (const [i, v] of pares) row[i] = v;
  return row;
};

export const FORTEPLUS_FICHA_FIXTURE: unknown[][] = [
  L([[29, 'CNPJ:'], [37, 'Página:'], [40, '1/2']]),
  L([[2, 'INBRAS - INDUSTRIA BRASILEIRA DE COSMETICOS LTDA'], [31, '07.025.603/0001-97']]),
  L([[2, 'Relatório Geral de Cliente'], [26, 'Data e Hora:'], [30, '28/09/2026']]),
  L([]),

  // 1. completa
  L([[1, 'NOME:'], [4, 'COMERCIAL FIXTURE UM LTDA']]),
  L([[1, 'CNPJ/CPF:'], [4, '11.222.333/0001-81'], [9, 'I.E/RG:'], [11, '123456789'], [16, 'INSC. MUNICIPAL:']]),
  L([[1, 'ENDEREÇO:'], [4, 'Rua Um Nº 10 Complemento SALA 2 - Bairro Centro']]),
  L([[1, 'CEP:'], [4, '30110-001'], [9, 'TIPO CONTRIBUINTE:'], [13, '1 - Contribuinte ICMS'], [16, 'CALCULA ST:'], [24, 'SIM']]),
  L([[1, 'ESTADO:'], [4, 'MG'], [9, 'CIDADE:'], [13, 'Belo Horizonte'], [16, 'VENDEDOR:']]),
  L([[1, 'E-MAIL:'], [4, 'Contato@FixtureUm.com.BR'], [9, 'CLASSE:'], [16, 'CONVÊNIO:'], [24, 'INEXISTENTE']]),
  L([[1, 'TELEFONE:'], [4, '(31)3333-1111'], [9, 'CELULAR'], [13, '(31)99999-1111'], [16, 'CONTATO OUTRO:']]),
  L([[1, 'ROTA:']]),
  L([[9, 'REGIÃO:']]),
  L([]),

  // 2. sem e-mail e sem fixo, só celular
  L([[1, 'NOME:'], [4, 'FIXTURE DOIS COMERCIO DE COSMETICOS']]),
  L([[1, 'CNPJ/CPF:'], [4, '11.444.777/0001-61'], [9, 'I.E/RG:'], [16, 'INSC. MUNICIPAL:']]),
  L([[1, 'ENDEREÇO:'], [4, 'Avenida Dois Nº 200 - Bairro Industrial']]),
  L([[1, 'CEP:'], [4, '13010-002'], [9, 'TIPO CONTRIBUINTE:'], [16, 'CALCULA ST:'], [24, 'NÃO']]),
  L([[1, 'ESTADO:'], [4, 'SP'], [9, 'CIDADE:'], [13, 'Campinas'], [16, 'VENDEDOR:']]),
  L([[1, 'E-MAIL:'], [9, 'CLASSE:'], [16, 'CONVÊNIO:'], [24, 'INEXISTENTE']]),
  L([[1, 'TELEFONE:'], [9, 'CELULAR'], [13, '(19)98888-2222'], [16, 'CONTATO OUTRO:']]),
  L([[1, 'ROTA:']]),
  L([]),

  // Mudança de página: o rodapé e o cabeçalho repetido no MEIO do arquivo. O
  // `CNPJ:` daqui é da INBRAS e não pode virar documento de cliente.
  L([[5, 'Rua Jose Antonio dos Santos, 2621 - Inacia de Carvalho - São José da Lapa - MG']]),
  L([[27, 'www.forteplus.com.br']]),
  L([[2, 'INBRAS - INDUSTRIA BRASILEIRA DE COSMETICOS LTDA'], [17, 'CNPJ:'], [19, '07.025.603/0001-97'], [29, 'Página:'], [31, '2/2']]),
  L([[2, 'Relatório Geral de Cliente'], [26, 'Data e Hora:'], [30, '28/09/2026'], [35, '10:14:38']]),
  L([]),

  // 3. sem nenhum telefone
  L([[1, 'NOME:'], [4, 'FIXTURE TRES DISTRIBUIDORA ME']]),
  L([[1, 'CNPJ/CPF:'], [4, '33.555.888/0001-88'], [9, 'I.E/RG:'], [16, 'INSC. MUNICIPAL:']]),
  L([[1, 'ENDEREÇO:'], [4, 'Travessa Tres Nº 30 - Bairro Norte']]),
  L([[1, 'CEP:'], [4, '70000-003'], [9, 'TIPO CONTRIBUINTE:'], [16, 'CALCULA ST:'], [24, 'NÃO']]),
  L([[1, 'ESTADO:'], [4, 'DF'], [9, 'CIDADE:'], [13, 'Brasília'], [16, 'VENDEDOR:']]),
  L([[1, 'E-MAIL:'], [9, 'CLASSE:'], [16, 'CONVÊNIO:'], [24, 'INEXISTENTE']]),
  L([[1, 'TELEFONE:'], [9, 'CELULAR'], [16, 'CONTATO OUTRO:']]),
  L([]),

  // 4. pessoa física: CPF, e o documento embutido no nome, como o Forteplus escreve
  L([[1, 'NOME:'], [4, '111.444.777 FIXTURE QUATRO DA SILVA']]),
  L([[1, 'CNPJ/CPF:'], [4, '111.444.777-35'], [9, 'I.E/RG:'], [11, 'MG-11.111.111'], [16, 'INSC. MUNICIPAL:']]),
  L([[1, 'ENDEREÇO:'], [4, 'Rua Quatro Nº 44 - Bairro Sul']]),
  L([[1, 'CEP:'], [4, '90000-004'], [9, 'TIPO CONTRIBUINTE:'], [16, 'CALCULA ST:'], [24, 'NÃO']]),
  L([[1, 'ESTADO:'], [4, 'RS'], [9, 'CIDADE:'], [13, 'Porto Alegre'], [16, 'VENDEDOR:']]),
  L([[1, 'E-MAIL:'], [4, 'quatro@fixture.com.br'], [9, 'CLASSE:'], [16, 'CONVÊNIO:'], [24, 'INEXISTENTE']]),
  L([[1, 'TELEFONE:'], [4, '(51)3000-4444'], [9, 'CELULAR'], [16, 'CONTATO OUTRO:']]),
  L([]),
  L([[5, 'Rua Jose Antonio dos Santos, 2621 - Inacia de Carvalho - São José da Lapa - MG']]),
];

const F = (pares: [number, string | number][]): unknown[] => {
  const row = new Array(60).fill('');
  for (const [i, v] of pares) row[i] = v;
  return row;
};

/**
 * Contas a RECEBER. Cabeçalho impresso na linha 5, com os rótulos DESLOCADOS em
 * relação aos dados (Vencimento rotulado na 9 e dado na 10; Valor Parcela na 23 e
 * dado na 22) — é justamente isso que o leitor posicional existe para atravessar.
 *
 * Cobre: um título normal, um SEM número de documento, uma NCC negativa (nota de
 * crédito, que ABATE), um título já quitado (saldo zero), a mudança de página com
 * cabeçalho repetido, um subtotal por data e a linha "Totais:".
 *
 * Soma das quatro parcelas: 1000.00 + 250.50 − 300.00 + 49.50 = 1000.00.
 */
export const FORTEPLUS_RECEBER_FIXTURE: unknown[][] = [
  F([[36, 'CNPJ:'], [49, 'Página:'], [54, '1/2']]),
  F([[2, 'INBRAS - INDUSTRIA BRASILEIRA DE COSMETICOS LTDA'], [40, '07.025.603/0001-97']]),
  F([]),
  F([]),
  F([[2, 'Relatório de Contas a Receber'], [45, 'Data e Hora:'], [51, '28/09/2026']]),
  F([[1, 'Cod'], [4, 'N. Docto'], [5, 'Parc'], [7, 'Emissão'], [9, 'Vencimento'], [11, 'Tp'],
     [13, 'Cliente  Razão Social'], [23, 'Valor Parcela'], [27, 'Saldo'], [31, 'Acréscimo'],
     [36, 'Desconto'], [43, 'Total Receber'], [47, 'Meio Pagto'], [53, 'Vendedor']]),
  F([]),
  // agrupamento por data de emissão: data na coluna 0 e nada mais
  F([[0, '16/08/2023']]),
  F([[0, '53'], [4, '16447'], [5, '3'], [7, '16/08/2023'], [10, '15/10/2023'], [12, 'NFE'],
     [14, '1355'], [16, 'COMERCIAL FIXTURE UM LTDA'], [22, '1000.00'], [27, '1000.00'],
     [33, '0'], [38, '0'], [43, '1000.00'], [47, 'Boleto'], [53, 'VENDEDOR FIXTURE']]),
  // subtotal da data
  F([[20, '1000.00'], [25, '1000.00'], [29, '1000.00']]),
  // sem número de documento — legítimo, e o filtro NÃO pode exigir
  F([[0, '54'], [5, '1'], [7, '20/08/2023'], [10, '20/09/2023'], [12, 'NFE'],
     [14, '1356'], [16, 'FIXTURE DOIS COMERCIO DE COSMETICOS'], [22, '250.50'], [27, '250.50'],
     [33, '0'], [38, '0'], [43, '250.50'], [53, 'FINANCEIRO CONFERENCIA']]),
  // mudança de página
  F([[1, 'Rua Jose Antonio dos Santos, 2621 - Inacia de Carvalho - São José da Lapa - MG']]),
  F([[2, 'INBRAS - INDUSTRIA BRASILEIRA DE COSMETICOS LTDA'], [40, '07.025.603/0001-97']]),
  F([[1, 'Cod'], [4, 'N. Docto'], [5, 'Parc'], [7, 'Emissão'], [9, 'Vencimento'], [11, 'Tp'],
     [13, 'Cliente  Razão Social'], [23, 'Valor Parcela'], [27, 'Saldo'], [43, 'Total Receber']]),
  // nota de crédito: NEGATIVA, e o sinal tem de sobreviver
  F([[0, '6299'], [4, '20324'], [5, '0'], [7, '24/09/2024'], [10, '24/09/2024'], [12, 'NCC'],
     [14, '1128'], [16, 'COMERCIAL FIXTURE UM LTDA'], [22, '-300.00'], [27, '-300.00'],
     [33, '0'], [38, '0'], [43, '-300.00'], [53, 'FINANCEIRO APROVADO']]),
  // já quitado: saldo zero → status 'paid', e a data que vale é o vencimento
  F([[0, '7001'], [4, '20999'], [5, '1'], [7, '01/03/2026'], [10, '10/03/2026'], [12, 'NFE'],
     [14, '1355'], [16, 'COMERCIAL FIXTURE UM LTDA'], [22, '49.50'], [27, '0'],
     [33, '0'], [38, '0'], [43, '49.50'], [47, 'Dinheiro'], [53, 'VENDEDOR FIXTURE']]),
  F([]),
  F([[34, 'Total:'], [41, '1000.00']]),
  F([[2, 'Totais:'], [20, '1000.00'], [25, '700.00'], [29, '0'], [36, '0'], [44, '1000.00']]),
  F([[33, 'www.forteplus.com.br']]),
];

/**
 * Contas a PAGAR. Mesmo deslocamento do cabeçalho, outras posições de dado (Valor
 * Parcela na 19, parcela na 6, emissão na 8) e a coluna que o de receber não tem:
 * **Plano de Contas na 35**, que vira a categoria do lançamento.
 *
 * Soma: 2728.75 + 2566.41 − 120.38 = 5174.78.
 */
export const FORTEPLUS_PAGAR_FIXTURE: unknown[][] = [
  F([[29, 'CNPJ:'], [37, 'Página:'], [40, '1/1']]),
  F([[2, 'INBRAS - INDUSTRIA BRASILEIRA DE COSMETICOS LTDA'], [31, '07.025.603/0001-97']]),
  F([]),
  F([]),
  F([[2, 'Relatório Contas a Pagar'], [32, 'Data e Hora:'], [39, '28/09/2026']]),
  F([[1, 'Cod'], [4, 'Documento'], [6, 'Parc'], [8, 'Emissão'], [9, 'Vencimento'], [11, 'Tp'],
     [14, 'Fornecedor Razao Social'], [21, 'Valor Parcela'], [23, 'Saldo Parcela'],
     [26, 'Acresc./Juros'], [28, 'Desconto'], [30, 'Saldo Pagar'], [35, 'Plano de Contas'],
     [40, 'Meio pgto'], [45, 'F']]),
  F([]),
  F([[0, '21/07/2023']]),
  F([[0, '963'], [4, '692'], [6, '1'], [8, '21/07/2023'], [10, '20/08/2023'], [12, 'NFE'],
     [14, '11'], [16, 'FORNECEDOR FIXTURE QUIMICA LTDA'], [19, '2728.75'], [23, '2728.75'],
     [26, '0'], [28, '0'], [30, '2728.75'], [35, 'Não Classificado'], [40, 'N/I'], [46, '2']]),
  F([[20, '2728.75'], [24, '2728.75'], [30, '2728.75']]),
  // recibo SEM documento: é a linha que o filtro antigo derrubava
  F([[0, '3944'], [6, '0'], [8, '21/03/2025'], [10, '31/08/2026'], [12, 'RC'],
     [14, '31'], [16, 'CONTABILIDADE FIXTURE'], [19, '2566.41'], [23, '2566.41'],
     [26, '0'], [28, '0'], [30, '2566.41'], [35, 'Prestadores de Serviço'], [40, 'Boleto'], [46, '1']]),
  // devolução ao fornecedor: negativa
  F([[0, '4316'], [6, '0'], [8, '24/04/2025'], [10, '24/04/2025'], [12, 'PA'],
     [14, '614'], [16, 'EMBALAGENS FIXTURE'], [19, '-120.38'], [23, '-120.38'],
     [26, '0'], [28, '0'], [30, '-120.38'], [35, 'Compra de Embalagens'], [40, 'PIX'], [46, '2']]),
  F([]),
  F([[2, 'Totais:'], [20, '5174.78'], [24, '5174.78'], [30, '5174.78']]),
  F([[33, 'www.forteplus.com.br']]),
];
