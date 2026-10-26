/**
 * O tamanho máximo de um arquivo do RH (holerite, documento, atestado) — o mesmo limite do balde
 * `rh-documents` no Storage (migration 20261119030000; pedido do dono para o banco não crescer à
 * toa). A tela confere antes de enviar para a pessoa ler o motivo, não um erro do Storage.
 */
export const LIMITE_ARQUIVO_RH_MB = 5;

/**
 * A pasta do arquivo de um colaborador no balde (`<empresa>/<pasta>/<ano>/...`): sempre a do colaborador (o id do RH),
 * tenha ele login ou não. O colaborador com login lê a pasta dele pela policy "Colaborador lê a pasta do seu cadastro no
 * RH" (20270207010000) — e continua lendo os arquivos de antes de ganhar o login. Os arquivos antigos, na pasta do login,
 * seguem pela policy de sempre.
 */
export const pastaDoColaborador = (c: { id: string }) => c.id;

export function conferirTamanhoDoArquivoRH(file: File): void {
  if (file.size > LIMITE_ARQUIVO_RH_MB * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(1).replace('.', ',');
    throw new Error(`O arquivo tem ${mb} MB; o limite é ${LIMITE_ARQUIVO_RH_MB} MB. Reduza ou comprima o PDF e envie de novo.`);
  }
}
