import { describe, it, expect } from 'vitest';
import {
  soDigitos, documentoTemForma, formatarDocumento, rotuloDoDocumento,
  cpfValido, cnpjValido, documentoValido, extrairDocumentoDoNome,
} from './documento';

describe('documento (CNPJ/CPF)', () => {
  it('guarda só dígitos — é o que faz o vínculo com o SAC funcionar', () => {
    // O caso real: o SAC grava `08319138000160`, sem pontuação.
    expect(soDigitos('08.319.138/0001-60')).toBe('08319138000160');
    expect(soDigitos('  08319138000160 ')).toBe('08319138000160');
    expect(soDigitos('123.456.789-09')).toBe('12345678909');
    expect(soDigitos(null)).toBe('');
    expect(soDigitos(undefined)).toBe('');
  });

  it('aceita a forma de CPF e de CNPJ, e recusa o resto', () => {
    expect(documentoTemForma('08.319.138/0001-60')).toBe(true);
    expect(documentoTemForma('123.456.789-09')).toBe(true);
    expect(documentoTemForma('123')).toBe(false);
    expect(documentoTemForma('083191380001601')).toBe(false); // 15 dígitos
    expect(documentoTemForma('')).toBe(false);
    expect(documentoTemForma(null)).toBe(false);
  });

  it('mostra pontuado, e não inventa pontuação em número incompleto', () => {
    expect(formatarDocumento('08319138000160')).toBe('08.319.138/0001-60');
    expect(formatarDocumento('12345678909')).toBe('123.456.789-09');
    // Ainda digitando: devolve os dígitos, para a pessoa ver o que escreveu.
    expect(formatarDocumento('0831913')).toBe('0831913');
    expect(formatarDocumento(null)).toBe('');
  });

  it('diz qual dos dois é, pelo tamanho', () => {
    expect(rotuloDoDocumento('08319138000160')).toBe('CNPJ');
    expect(rotuloDoDocumento('12345678909')).toBe('CPF');
    expect(rotuloDoDocumento('123')).toBe('Documento');
    expect(rotuloDoDocumento(null)).toBe('Documento');
  });

  it('a ida e a volta não perdem nada', () => {
    const doDono = '08.319.138/0001-60';
    expect(formatarDocumento(soDigitos(doDono))).toBe(doDono);
  });
});

describe('dígito verificador', () => {
  it('confere CPF', () => {
    expect(cpfValido('04907925611')).toBe(true);   // cliente real da base
    expect(cpfValido('123.456.789-09')).toBe(true);
    expect(cpfValido('12345678900')).toBe(false);  // DV trocado
  });

  // Repetição passa na conta do mod 11 e não é documento de ninguém.
  it('recusa dígito repetido', () => {
    expect(cpfValido('11111111111')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });

  it('confere CNPJ', () => {
    expect(cnpjValido('08.319.138/0001-60')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('08319138000161')).toBe(false); // DV trocado
  });

  it('documentoValido escolhe a conta pelo tamanho', () => {
    expect(documentoValido('04907925611')).toBe(true);
    expect(documentoValido('08319138000160')).toBe(true);
    expect(documentoValido('123')).toBe(false);
    expect(documentoValido(null)).toBe(false);
  });

  // A diferença entre `documentoTemForma` e `documentoValido`, que existe de
  // propósito: a forma vale para quem DIGITA (o DV não prova que é o documento
  // certo, e a nota fiscal é quem confere); o DV vale para quem EXTRAI de um texto,
  // porque ali ele é o que separa documento de número qualquer.
  it('forma e validade não são a mesma pergunta', () => {
    expect(documentoTemForma('31987654321')).toBe(true);   // tem 11 dígitos
    expect(documentoValido('31987654321')).toBe(false);    // mas é um telefone
  });
});

describe('extrairDocumentoDoNome', () => {
  // Os três formatos que o Forteplus produz de verdade, medidos em 2026-09-27 nos
  // 450 clientes: 120 com CPF no nome, 25 com raiz de CNPJ, 305 sem nada.
  it('acha o CPF no fim do nome, como o Forteplus escreve', () => {
    expect(extrairDocumentoDoNome('EDMAR GONCALVES DA SILVA 04907925611')).toBe('04907925611');
  });

  it('completa a raiz do CNPJ com a filial 0001 e calcula o DV', () => {
    expect(extrairDocumentoDoNome('49.932.013 LILIAN VIEIRA DA SILVA')).toBe('49932013000198');
    expect(extrairDocumentoDoNome('30.398.350 JOELSON MIRANDA SANTOS')).toBe('30398350000119');
  });

  it('aceita o CNPJ já completo e pontuado', () => {
    expect(extrairDocumentoDoNome('EMPRESA X 08.319.138/0001-60')).toBe('08319138000160');
  });

  it('não acha nada em nome de empresa', () => {
    expect(extrairDocumentoDoNome('DUNOGUE DISTRIBUIDORA DE COSMETICOS LTDA')).toBeNull();
    expect(extrairDocumentoDoNome('A C  DIAS DE OLIVEIRA')).toBeNull();
    expect(extrairDocumentoDoNome('')).toBeNull();
    expect(extrairDocumentoDoNome(null)).toBeNull();
  });

  // A asserção que justifica o dígito verificador existir: telefone com DDD tem 11
  // dígitos. Sem o DV isto viraria um CPF gravado no cadastro — e documento errado
  // não dá erro, faz o chamado do SAC não encontrar o cliente.
  it('NÃO confunde telefone de 11 dígitos com CPF', () => {
    expect(extrairDocumentoDoNome('LOJA DO CENTRO 31987654321')).toBeNull();
  });

  it('não pega pedaço de número maior', () => {
    // 13 dígitos: nem CPF nem CNPJ, e o de 11 de dentro não vale.
    expect(extrairDocumentoDoNome('PEDIDO 0490792561123')).toBeNull();
  });

  // Número completo no nome ganha do palpite da raiz, porque a raiz assume `0001`.
  it('o documento completo ganha da raiz quando os dois aparecem', () => {
    expect(extrairDocumentoDoNome('11.222.333 EMPRESA 08319138000160')).toBe('08319138000160');
  });
});
