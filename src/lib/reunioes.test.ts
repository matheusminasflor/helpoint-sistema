import { describe, expect, it } from 'vitest';
import { falasDaTranscricao, lerCsv, mediaDeMinutos, minutosEntre, nomesDaEquipe, paragrafosDaSecao, proximasEtapas, secaoDaPauta, temposDoTexto } from './reunioes';

const pauta = 'Registros da reunião\n\nResumo\nFoco na expansão.\n\nDecisões\nAlinhada\n\nPróximas etapas\n* [Ana] Enviar\n\nDetalhes\nTexto longo.';

describe('seções do Gemini', () => {
  it('devolve o texto da seção como veio, até a próxima', () => {
    expect(secaoDaPauta(pauta, 'Resumo')).toBe('Foco na expansão.');
    expect(secaoDaPauta(pauta, 'Próximas etapas')).toBe('* [Ana] Enviar');
    expect(secaoDaPauta(pauta, 'Detalhes')).toBe('Texto longo.');
  });

  it('seção que não existe vem nula', () => {
    expect(secaoDaPauta('Só um texto', 'Decisões')).toBeNull();
  });
});

describe('tempo da reunião', () => {
  it('calcula os minutos e a média só de quem tem fim', () => {
    expect(minutosEntre('2026-11-06T18:00:00Z', '2026-11-06T19:00:00Z')).toBe(60);
    expect(minutosEntre('2026-11-06T18:00:00Z', null)).toBeNull();
    expect(mediaDeMinutos([
      { inicio: '2026-11-06T18:00:00Z', fim: '2026-11-06T19:00:00Z' },
      { inicio: '2026-11-13T18:00:00Z', fim: '2026-11-13T18:30:00Z' },
      { inicio: '2026-11-20T18:00:00Z', fim: null },
    ])).toBe(45);
  });
});

describe('leitura da pauta', () => {
  it('separa responsáveis, título e texto', () => {
    expect(proximasEtapas('* [Ana, The group] Enviar: mandar hoje.\n* Sem nome')).toEqual([
      { pessoas: ['Ana', 'Grupo'], titulo: 'Enviar', texto: 'mandar hoje.' },
      { pessoas: [], titulo: null, texto: 'Sem nome' },
    ]);
  });
  it('acha subtítulo e prefixo sem mudar o texto', () => {
    expect(paragrafosDaSecao('Ferramentas e migracao\nTeste em 1 semana.\n\n________________\n\nPlano: foco em canais.')).toEqual([
      { titulo: 'Ferramentas e migracao', corpo: 'Teste em 1 semana.' },
      { titulo: 'Plano', corpo: 'foco em canais.' },
    ]);
  });
  it('separa as marcas de tempo', () => {
    expect(temposDoTexto('Plano (00:01:16) (00:09:01).').filter((p) => p.hora).map((p) => p.hora)).toEqual(['00:01:16', '00:09:01']);
  });
});

describe('transcrição por fala', () => {
  it('guarda a hora e junta quem continua falando', () => {
    expect(falasDaTranscricao('00:01:16\nAna Lima: Bom dia\nAna Lima: pessoal\nBia Reis: Oi\n00:02:00\nBia Reis: Certo')).toEqual([
      { id: 0, hora: '00:01:16', nome: 'Ana Lima', fala: 'Bom dia pessoal' },
      { id: 1, hora: '00:01:16', nome: 'Bia Reis', fala: 'Oi Certo' },
    ]);
  });
});

describe('lista de presença do Google', () => {
  it('respeita aspas e vírgulas', () => {
    expect(lerCsv('Nome,Tempo\n"Silva, Ana",59 min\r\n\nBia,48 min\n')).toEqual([
      ['Nome', 'Tempo'], ['Silva, Ana', '59 min'], ['Bia', '48 min'],
    ]);
  });
});

describe('nomes do Google sem pessoa', () => {
  it('mostra quem pode ser da equipe e tira o cliente do treinamento', () => {
    expect(nomesDaEquipe(['Silvana Melo', 'Regina Falabella', 'marcus'], ['Silvana Moraes', 'Marcus Carvalho'])).toEqual(['Silvana Melo', 'marcus']);
  });
});
