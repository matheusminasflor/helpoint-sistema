import { describe, expect, it } from 'vitest';
import {
  resolverVisaoDiretoria, rotaDaVisaoDiretoria, VISAO_DIRETORIA_PADRAO, VISOES_DIRETORIA,
} from './diretoria-insights';

describe('resolverVisaoDiretoria', () => {
  it('as quatro visões de hoje resolvem para si mesmas', () => {
    for (const v of VISOES_DIRETORIA) {
      expect(resolverVisaoDiretoria(v.valor)).toBe(v.valor);
    }
    expect(VISOES_DIRETORIA).toHaveLength(4);
  });

  // A razão de existir deste bloco: na etapa 4 (2026-09-25) sete visões
  // viraram quatro, e o dono perguntou explicitamente se os endereços velhos
  // continuariam funcionando. `?visao=` é contrato com os favoritos das
  // pessoas — link salvo que vira "página não encontrada", ou que cai calado
  // no Resumo, é a mudança se cobrando de quem não pediu nada.
  it('os três endereços fundidos levam para onde o conteúdo mora agora', () => {
    expect(resolverVisaoDiretoria('carteiras')).toBe('metas');
    expect(resolverVisaoDiretoria('conciliacao')).toBe('metas');
    expect(resolverVisaoDiretoria('setores')).toBe('resumo');
  });

  it('endereço desconhecido cai no padrão, sem quebrar', () => {
    expect(resolverVisaoDiretoria('inventado')).toBe(VISAO_DIRETORIA_PADRAO);
    expect(resolverVisaoDiretoria(null)).toBe(VISAO_DIRETORIA_PADRAO);
    expect(resolverVisaoDiretoria(undefined)).toBe(VISAO_DIRETORIA_PADRAO);
    expect(resolverVisaoDiretoria('')).toBe(VISAO_DIRETORIA_PADRAO);
  });

  // `constructor`, `toString` e afins existem em todo objeto por herança. Com
  // um objeto literal simples, `'constructor' in APELIDOS` é TRUE, e o valor
  // seria uma função — que viraria a "visão" escolhida. Não é ataque: é
  // digitar um endereço qualquer e a tela quebrar de um jeito inexplicável.
  it('nome herdado de Object não é confundido com apelido', () => {
    expect(resolverVisaoDiretoria('constructor')).toBe(VISAO_DIRETORIA_PADRAO);
    expect(resolverVisaoDiretoria('toString')).toBe(VISAO_DIRETORIA_PADRAO);
    expect(resolverVisaoDiretoria('__proto__')).toBe(VISAO_DIRETORIA_PADRAO);
  });
});

describe('rotaDaVisaoDiretoria', () => {
  it('a visão padrão não leva query — o endereço curto é o da abertura', () => {
    expect(rotaDaVisaoDiretoria('resumo')).toBe('/diretoria');
  });

  it('as outras levam ?visao=', () => {
    expect(rotaDaVisaoDiretoria('metas')).toBe('/diretoria?visao=metas');
    expect(rotaDaVisaoDiretoria('clientes')).toBe('/diretoria?visao=clientes');
  });

  // O ciclo fechado: o endereço que o menu monta tem que voltar à mesma
  // visão quando alguém o abre. Se as duas funções divergirem, o menu leva
  // para uma tela e acende o item de outra — foi o achado A4 da auditoria de
  // 2026-09-21, do lado do Comercial.
  it('ida e volta: o endereço que o menu monta resolve para a mesma visão', () => {
    for (const v of VISOES_DIRETORIA) {
      const rota = rotaDaVisaoDiretoria(v.valor);
      const query = rota.includes('?visao=') ? rota.split('?visao=')[1] : null;
      expect(resolverVisaoDiretoria(query)).toBe(v.valor);
    }
  });
});
