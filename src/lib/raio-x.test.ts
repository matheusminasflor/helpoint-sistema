import { describe, expect, it } from 'vitest';
import {
  alertaDoCliente, camposPreenchidos, faltaNaResposta, respostaVazia, situacaoAnterior, somarMotivos, somarPropostas,
  rotuloDoMotivo, type LinhaDoRelatorio, type PerfilDoCliente,
} from './raio-x';

const linha = (o: Partial<LinhaDoRelatorio>): LinhaDoRelatorio => ({
  dor_id: 'd', cliente_codigo: '1', cliente: 'A', carteira: 'X', motivo: 'preco', motivo_outros: null, descricao: null,
  status: 'aberta', registrada_em: '2026-11-05', autor: null, compravam: 100, voltou_em: null, propostas: [], perfil: null, ...o,
});
const perfil = (situacao: PerfilDoCliente['situacao'], created_at: string): PerfilDoCliente => ({
  id: created_at, tipo_negocio: null, quem_decide: null, melhor_contato: null, o_que_pesa: null, situacao, created_at, autor: null,
});

describe('alertaDoCliente', () => {
  it('usa as regras da Carteira', () => {
    expect(alertaDoCliente({ situacao: 'inativo', media_3m: 0, media_12m: 100 })).toBe('parado');
    expect(alertaDoCliente({ situacao: 'ativo', media_3m: 79, media_12m: 100 })).toBe('queda');
    expect(alertaDoCliente({ situacao: 'ativo', media_3m: 80, media_12m: 100 })).toBeNull();
    expect(alertaDoCliente({ situacao: 'nunca_comprou', media_3m: 0, media_12m: 0 })).toBeNull();
  });
});

describe('faltaNaResposta', () => {
  it('exige o motivo só de quem falou com o cliente', () => {
    expect(faltaNaResposta(respostaVazia())).toBe(true);
    expect(faltaNaResposta({ ...respostaVazia(), resultado: 'nao_atendeu' })).toBe(false);
    expect(faltaNaResposta({ ...respostaVazia(), resultado: 'falou' })).toBe(true);
    expect(faltaNaResposta({ ...respostaVazia(), resultado: 'falou', motivo: 'preco' })).toBe(false);
  });
  it('Outros exige o texto', () => {
    expect(faltaNaResposta({ ...respostaVazia(), resultado: 'falou', motivo: 'outros', motivoOutros: ' ' })).toBe(true);
    expect(faltaNaResposta({ ...respostaVazia(), resultado: 'falou', motivo: 'outros', motivoOutros: 'Mudou de ramo' })).toBe(false);
  });
});

describe('situacaoAnterior', () => {
  it('acha a última situação diferente e quando ela acabou', () => {
    expect(situacaoAnterior([perfil('parado', '3'), perfil('parado', '2'), perfil('crescendo', '1')]))
      .toEqual({ situacao: 'crescendo', ate: '2' });
  });
  it('sem mudança, não há situação anterior', () => {
    expect(situacaoAnterior([perfil('parado', '2'), perfil('parado', '1')])).toBeNull();
    expect(situacaoAnterior([])).toBeNull();
  });
});

describe('camposPreenchidos', () => {
  it('conta só os preenchidos', () => {
    expect(camposPreenchidos(undefined)).toBe(0);
    expect(camposPreenchidos({ ...perfil('parado', '1'), quem_decide: 'Carlos' })).toBe(2);
  });
});

describe('somarMotivos', () => {
  it('não conta o mesmo cliente duas vezes e deixa de fora a dor fechada', () => {
    const r = somarMotivos([
      linha({ cliente: 'A', compravam: 100 }), linha({ cliente: 'A', compravam: 100 }),
      linha({ cliente: 'B', compravam: 50 }), linha({ cliente: 'C', status: 'resolvida' }),
      linha({ cliente: 'D', motivo: 'frete', compravam: 200 }),
    ]);
    expect(r).toEqual([
      { rotulo: 'Frete e logística', clientes: 1, compravam: 200 },
      { rotulo: 'Preço', clientes: 2, compravam: 150 },
    ]);
  });
  it('Outros aparece com o texto escrito', () => {
    expect(rotuloDoMotivo({ motivo: 'outros', motivo_outros: 'Mudou de ramo' })).toBe('Mudou de ramo');
  });
});

describe('somarPropostas', () => {
  it('a taxa ignora as que aguardam resposta', () => {
    const propostas = [
      { tipo: 'frete', proposta: 'a', resultado: 'funcionou' }, { tipo: 'frete', proposta: 'b', resultado: 'nao_funcionou' },
      { tipo: 'frete', proposta: 'c', resultado: 'aguardando' },
    ] as LinhaDoRelatorio['propostas'];
    expect(somarPropostas([linha({ propostas })])).toEqual([{ rotulo: 'Condição de frete', oferecidas: 3, funcionaram: 1, taxa: 0.5 }]);
  });
  it('sem resposta, a taxa fica em branco', () => {
    const propostas = [{ tipo: 'campanha', proposta: 'a', resultado: 'aguardando' }] as LinhaDoRelatorio['propostas'];
    expect(somarPropostas([linha({ propostas })])[0].taxa).toBeNull();
  });
});
