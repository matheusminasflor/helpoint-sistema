// Onde ficam as telas de escrever tutorial: na TI (`/ti/pops`) ou na Qualidade (`/qualidade/tutoriais`, rodada 2).
// O banco deixa as duas escreverem (`pode_no_setor('ti','knowledge')` ou `('qualidade','pops')`); a tela volta para o
// endereço de onde a pessoa veio, para a Qualidade não cair na guarda da TI.
export const enderecoDosTutoriais = (pathname: string): string =>
  pathname.replace(/^\/t\/[^/]+/, '').startsWith('/qualidade') ? '/qualidade/tutoriais' : '/ti/pops';
