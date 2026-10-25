// Os Termos de Uso e a Política de Privacidade do Portal do Distribuidor (LGPD; adendo do dono de 2026-10-21 e a
// decisão 3 de 2026-10-25). O texto mora em docs/termos-portal-distribuidor.md — este arquivo é a cópia que a tela
// mostra. Mudou o texto → muda a VERSAO → todos aceitam de novo no próximo acesso (`dist_termos_aceitos`).
export const VERSAO_DOS_TERMOS = '2026-10-25';

export interface SecaoDosTermos { titulo: string; paragrafos: string[] }

export const TERMOS_DE_USO: SecaoDosTermos[] = [
  { titulo: 'O que é o Portal', paragrafos: [
    'Uma área do Helpoint, o sistema da Minasflor, para os clientes que revendem os produtos Minasflor organizarem os salões que atendem, as visitas, as vendas e o estoque deles, e falarem com a Minasflor.'] },
  { titulo: 'Quem pode usar', paragrafos: [
    'Só quem a Minasflor liberou. O cadastro do distribuidor é conferido e ligado ao cadastro dele na Minasflor antes do primeiro uso. Cada pessoa tem o próprio acesso; ele é pessoal e não se empresta.'] },
  { titulo: 'O que o distribuidor faz aqui', paragrafos: [
    'Cadastra salões e visitas, registra as vendas aos salões, acompanha o estoque, vê os pedidos feitos à Minasflor e abre atendimento. O distribuidor responde pelo que registra e por ter o direito de registrar os dados dos salões e das pessoas que cadastra.'] },
  { titulo: 'Vendedores', paragrafos: [
    'O distribuidor pode convidar vendedores da equipe. Ele vê tudo o que os vendedores registram; cada vendedor vê o que é dele. Quando um vendedor sai, o distribuidor tira o acesso dele.'] },
  { titulo: 'Pedidos e estoque', paragrafos: [
    'Os pedidos são feitos no catálogo da Minasflor (Conecta Venda), na tabela de preço do distribuidor; o Portal mostra a situação deles.',
    'O que o distribuidor compra da Minasflor entra no estoque dele quando a nota fiscal é emitida; as vendas aos salões ele registra. Os números organizam o trabalho e não substituem o controle fiscal dele.'] },
  { titulo: 'Uso correto e suspensão', paragrafos: [
    'Não é permitido tentar acessar dados de outro distribuidor, usar o Portal para fins alheios à relação comercial com a Minasflor, nem cadastrar dados que não tenha o direito de usar. A Minasflor pode suspender o acesso de quem descumprir estes termos ou quando a relação comercial terminar.',
    'Quando estes termos mudarem, o Portal pede um novo aceite.'] },
];

export const POLITICA_DE_PRIVACIDADE: SecaoDosTermos[] = [
  { titulo: 'Quem trata os dados', paragrafos: ['A Minasflor, dona do Helpoint, é a controladora dos dados do Portal.'] },
  { titulo: 'Que dados coletamos e para quê', paragrafos: [
    'Do distribuidor e dos vendedores: nome, e-mail, telefone, CNPJ, razão social e cidade — para liberar o acesso, ligar ao cadastro comercial e avisar sobre pedidos e atendimento.',
    'Dos salões cadastrados: nome, cidade, endereço e situação no funil — para organizar a carteira e as visitas; a Minasflor acompanha onde a marca está.',
    'Do contato do salão: nome da pessoa e telefone — só para o distribuidor e a equipe dele falarem com o salão.',
    'Vendas ao salão e estoque do distribuidor — para recompra, oportunidades e reposição. E o registro de acesso (data e hora), para a segurança do sistema.'] },
  { titulo: 'Quem vê o quê', paragrafos: [
    'O distribuidor e a equipe dele veem tudo o que registram. A Minasflor vê o salão, a cidade, a situação no funil, as vendas e o estoque do distribuidor. O nome e o telefone do contato do salão a Minasflor não vê: ficam só com o distribuidor e a equipe dele.',
    'Os dados não são vendidos nem cedidos a terceiros. Saem do Helpoint só para os serviços que fazem o sistema funcionar (hospedagem e banco de dados, envio de e-mail) e para o catálogo de pedidos da Minasflor (Conecta Venda), sempre para a finalidade acima.'] },
  { titulo: 'Base legal e por quanto tempo guardamos', paragrafos: [
    'A execução da relação comercial entre a Minasflor e o distribuidor (art. 7º, V, da LGPD) e o legítimo interesse de organizá-la (art. 7º, IX). Para os contatos dos salões, o distribuidor declara ter relação com o salão que justifica o registro.',
    'Guardamos enquanto o distribuidor estiver ativo e, depois, pelo prazo que a lei exigir para registros comerciais e fiscais. Contatos de salões são apagados quando o distribuidor os apaga ou quando o acesso dele é encerrado, se não houver obrigação legal de guardar.'] },
  { titulo: 'Seus direitos', paragrafos: [
    'Qualquer pessoa cujos dados estejam no Portal pode pedir para ver, corrigir, levar ou apagar os seus dados, saber com quem foram compartilhados e retirar um consentimento que tenha dado. Peça pelo "Falar com a Minasflor"; respondemos em até 15 dias.'] },
  { titulo: 'Segurança', paragrafos: [
    'Acesso só com código enviado ao e-mail, cada pessoa vendo apenas o que lhe cabe (a regra mora no banco de dados, não só na tela), e registro de quem pediu, liberou e convidou cada acesso.'] },
];
