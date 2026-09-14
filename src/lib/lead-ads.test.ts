import { describe, it, expect } from 'vitest';
import {
  limparMapeamento, perguntasDoFormulario,
  DESTINOS_EMBUTIDOS, DESTINO_ANOTACAO, PERGUNTAS_PADRAO,
} from './lead-ads';

/**
 * O vocabulário do mapeamento do Lead Ads é mantido em **três** lugares: a lista
 * desta tela, o trigger `crm_lead_ads_confere_mapeamento` (que recusa o que não
 * conhece) e a função `crm_lead_ads_aplicar` (que cumpre).
 *
 * Ele já divergiu duas vezes nesta família de leva — primeiro o passo
 * `whatsapp_template`, que o validador aceitava e o executor não sabia rodar;
 * depois os destinos `name`/`email`/`phone`, aceitos ao salvar e silenciosamente
 * jogados na anotação. As duas vezes custaram uma migration de correção.
 *
 * Este arquivo é o preço de não haver uma terceira: acrescentar destino na tela
 * sem acrescentá-lo no banco (ou o contrário) exige mexer na lista abaixo, e
 * mexer nela sem mexer no banco é uma linha que qualquer revisão vê.
 */
const DESTINOS_QUE_O_BANCO_CUMPRE = ['name', 'email', 'phone', 'company'];

describe('vocabulário do mapeamento', () => {
  it('a tela oferece exatamente os destinos que o banco cumpre', () => {
    expect(DESTINOS_EMBUTIDOS.map(d => d.valor).sort())
      .toEqual([...DESTINOS_QUE_O_BANCO_CUMPRE].sort());
  });

  it('todo destino tem rótulo em português — é o que o administrador lê', () => {
    for (const d of DESTINOS_EMBUTIDOS) expect(d.rotulo.trim().length).toBeGreaterThan(0);
  });
});

describe('limparMapeamento', () => {
  // O banco recusa string vazia como destino ("destino desconhecido"), então
  // "vira anotação" tem de ser a **ausência** da pergunta, não um valor vazio.
  it('tira do mapeamento o que ficou como anotação', () => {
    expect(limparMapeamento({
      quantos_pontos: 'custom:pontos',
      como_nos_achou: DESTINO_ANOTACAO,
      faturamento: '',
    })).toEqual({ quantos_pontos: 'custom:pontos' });
  });

  it('não inventa entrada quando nada foi escolhido', () => {
    expect(limparMapeamento({})).toEqual({});
    expect(limparMapeamento({ a: DESTINO_ANOTACAO })).toEqual({});
  });

  it('o valor da anotação nunca pode ser string vazia', () => {
    // Trocar a constante por '' faria a tela mandar `{"x": ""}`, e o banco
    // recusaria o formulário inteiro com um erro que ninguém decifra.
    expect(DESTINO_ANOTACAO).not.toBe('');
  });
});

describe('perguntasDoFormulario', () => {
  it('lê o formato que a Graph API devolve quando se pede por `fields`', () => {
    expect(perguntasDoFormulario({
      id: '1', questions: { data: [{ key: 'quantos_pontos', label: 'Quantos pontos?' }] },
    })).toEqual([{ key: 'quantos_pontos', label: 'Quantos pontos?' }]);
  });

  it('aguenta o formulário sem pergunta nenhuma', () => {
    expect(perguntasDoFormulario({ id: '1' })).toEqual([]);
    expect(perguntasDoFormulario(undefined)).toEqual([]);
  });

  it('as perguntas que o sistema já reconhece sozinho ficam de fora do mapeamento', () => {
    // São as que o Facebook nomeia igual em todo formulário; escolher destino
    // para elas não mudaria nada, porque `crm_lead_ads_aplicar` as lê direto.
    expect(PERGUNTAS_PADRAO).toContain('full_name');
    expect(PERGUNTAS_PADRAO).toContain('email');
    expect(PERGUNTAS_PADRAO).toContain('phone_number');
  });
});
