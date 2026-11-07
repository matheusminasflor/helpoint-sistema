// Leva as reuniões da conta do Google para os canais do Chat (dono, 2026-11-07). Só leitura no Google. O texto entra
// como o Gemini gerou: o Helpoint separa a pauta da transcrição e não resume nada. Exige service_role (verify_jwt = true).
//   Corpo opcional: { "desde": "2026-10-01T00:00:00-03:00", "avisar": false } importa o histórico sem mandar mensagem.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/require-service-role.ts";
import { lerDoGoogle, textoDoArquivo, tokenDoGoogle } from "../_shared/google.ts";

// A conta que organiza, grava e guarda as reuniões da Minasflor (Workspace minasflor.com).
const CONTA = 'ti@minasflor.com';
const ROBOS = /notetaker|fireflies|read\.ai|otter\.ai|^minasflor ti$/i;

interface Evento {
  id: string;
  status?: string;
  recurringEventId?: string;
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: { email?: string; displayName?: string; resource?: boolean }[];
  hangoutLink?: string;
}

interface Arquivo { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string }
interface ArquivoDaReuniao extends Arquivo { titulo: string; quando: number; tipo: string }

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const normaliza = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** O Google nomeia cada arquivo como "<reunião> - 2026/11/06 15:02 GMT-03:00 - Anotações do Gemini". */
const NOME_DO_ARQUIVO = /^(.*) - (\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) GMT([+-]\d{2}:\d{2}) - (.+)$/;

/**
 * Os arquivos das reuniões, da conta inteira. Não vêm dos anexos do evento: a reunião repetida acumula os anexos de
 * todas as semanas, e a lista de presença (Participação) nem é anexada.
 */
async function arquivosDasReunioes(token: string, de: string) {
  const desde = new Date(new Date(de).getTime() - 86400_000).toISOString();
  const q = `trashed = false and createdTime > '${desde}' and (name contains 'Gemini' or name contains 'Transcri' or name contains 'Transcript' or name contains 'Participação' or name contains 'Recording' or name contains 'Gravação')`;
  const arquivos: ArquivoDaReuniao[] = [];
  let pagina = '';
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)');
    url.searchParams.set('pageSize', '200');
    if (pagina) url.searchParams.set('pageToken', pagina);
    const r = await lerDoGoogle<{ files?: Arquivo[]; nextPageToken?: string }>(token, url.toString());
    for (const a of r.files ?? []) {
      const m = NOME_DO_ARQUIVO.exec(a.name);
      if (m) arquivos.push({ ...a, titulo: normaliza(m[1]), quando: new Date(`${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:00${m[7]}`).getTime(), tipo: m[8] });
    }
    pagina = r.nextPageToken ?? '';
  } while (pagina);
  return arquivos;
}

/** O limite da edge function: para antes e continua na próxima rodada, porque o que já entrou é pulado. */
const TEMPO_DA_RODADA = 110_000;

/** "Jacqueline Cardoso" é "Jacqueline Dias Cardoso": um nome contém o outro, com pelo menos dois nomes e um só candidato. */
function pessoaPeloNome<T extends { full_name: unknown }>(nome: string, perfis: T[]): T | null {
  const partes = normaliza(nome).split(' ');
  if (partes.length < 2) return null;
  const candidatos = perfis.filter((p) => {
    const dele = normaliza(String(p.full_name)).split(' ');
    return dele.length >= 2 && dele[0] === partes[0] && (dele.every((x) => partes.includes(x)) || partes.every((x) => dele.includes(x)));
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

/** O documento do Gemini traz a transcrição depois da linha "<título> - Transcrição". */
function separar(texto: string) {
  const limpo = texto.replace(/\r\n/g, '\n').trim();
  const marca = /^.* - (Transcrição|Transcript)\s*$/im.exec(limpo);
  if (!marca) return { pauta: limpo, transcricao: null };
  return { pauta: limpo.slice(0, marca.index).trim(), transcricao: limpo.slice(marca.index).trim() };
}

async function todosOsEventos(token: string, de: string, ate: string) {
  const eventos: Evento[] = [];
  let pagina: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', de);
    url.searchParams.set('timeMax', ate);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    if (pagina) url.searchParams.set('pageToken', pagina);
    const r = await lerDoGoogle<{ items?: Evento[]; nextPageToken?: string }>(token, url.toString());
    eventos.push(...(r.items ?? []));
    pagina = r.nextPageToken;
  } while (pagina);
  return eventos;
}

/** Quem entrou de fato naquele horário: a mesma sala do Meet se repete toda semana. */
async function quemEntrou(token: string, sala: string, inicio: string, fim: string) {
  const antes = new Date(new Date(inicio).getTime() - 3600_000).toISOString();
  const depois = new Date(new Date(fim).getTime() + 3 * 3600_000).toISOString();
  const filtro = encodeURIComponent(`space.meeting_code="${sala}" AND start_time>="${antes}" AND start_time<="${depois}"`);
  const { conferenceRecords = [] } = await lerDoGoogle<{ conferenceRecords?: { name: string }[] }>(token, `https://meet.googleapis.com/v2/conferenceRecords?filter=${filtro}`);
  const pessoas = new Map<string, { entrada: string | null; saida: string | null }>();
  for (const r of conferenceRecords) {
    const { participants = [] } = await lerDoGoogle<{ participants?: { signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string }; earliestStartTime?: string; latestEndTime?: string }[] }>(
      token, `https://meet.googleapis.com/v2/${r.name}/participants?pageSize=100`,
    );
    for (const p of participants) {
      const nome = (p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? '').trim();
      if (!nome || ROBOS.test(nome)) continue;
      const atual = pessoas.get(nome);
      const entrada = p.earliestStartTime ?? null;
      const saida = p.latestEndTime ?? null;
      pessoas.set(nome, {
        entrada: atual?.entrada && entrada ? (atual.entrada < entrada ? atual.entrada : entrada) : atual?.entrada ?? entrada,
        saida: atual?.saida && saida ? (atual.saida > saida ? atual.saida : saida) : atual?.saida ?? saida,
      });
    }
  }
  return pessoas;
}

/** Um encontro, venha de um evento da agenda ou só dos arquivos do Drive. */
interface Encontro {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  repetida: boolean;
  linkMeet: string | null;
  sala: string | null;
  convidados: NonNullable<Evento['attendees']>;
  arquivos: ArquivoDaReuniao[];
}

type Tempo = { entrada: string | null; saida: string | null; email?: string };

/** A lista "Participação" do Google: Nome, Sobrenome, e-mail, duração, entrada e saída. */
function pessoasDaLista(csv: string, inicio: string) {
  const dia = new Date(inicio).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const linhas = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim()));
  const titulos = (linhas[0] ?? []).map(normaliza);
  const coluna = (nome: RegExp) => titulos.findIndex((t) => nome.test(t));
  const [nome, sobrenome, email, entrada, saida] = [coluna(/^nome|first/), coluna(/sobrenome|last/), coluna(/e-?mail/), coluna(/entrada|joined/), coluna(/saida|left/)];
  const hora = (h?: string) => (h && /^\d{2}:\d{2}/.test(h) ? `${dia}T${h.slice(0, 5)}:00-03:00` : null);
  const pessoas = new Map<string, Tempo>();
  for (const l of linhas.slice(1)) {
    const completo = `${l[nome] ?? ''} ${sobrenome >= 0 ? l[sobrenome] ?? '' : ''}`.trim();
    if (completo && !ROBOS.test(completo)) pessoas.set(completo, { entrada: hora(l[entrada]), saida: hora(l[saida]), email: l[email]?.toLowerCase() });
  }
  return pessoas;
}

/** O que está no Drive e nenhum evento da agenda reclamou: reunião aberta na hora, sem convite. */
function encontrosSemEvento(arquivos: ArquivoDaReuniao[], usados: Set<string>, de: string) {
  const inicioDaJanela = new Date(de).getTime() + 3 * 3600_000;
  const soltos = arquivos.filter((a) => !usados.has(a.id) && a.quando >= inicioDaJanela).sort((a, b) => a.quando - b.quando);
  const grupos: ArquivoDaReuniao[][] = [];
  for (const a of soltos) {
    const grupo = grupos.find((g) => g[0].titulo === a.titulo && a.quando - g[0].quando < 2 * 3600_000);
    if (grupo) grupo.push(a); else grupos.push([a]);
  }
  return grupos.map((g): Encontro => ({
    id: `arquivo:${g[0].id}`,
    titulo: NOME_DO_ARQUIVO.exec(g[0].name)![1].trim(),
    inicio: new Date(g[0].quando).toISOString(),
    fim: new Date(g[0].quando + 3600_000).toISOString(),
    repetida: false, linkMeet: null, sala: null, convidados: [], arquivos: g,
  }));
}

async function rodada(db: SupabaseClient, tenant: string, corpo: { desde?: string; avisar?: boolean }) {
  const avisar = corpo.avisar !== false;
  const agora = new Date();
  const de = corpo.desde ?? new Date(agora.getTime() - 3 * 86400_000).toISOString();

  const { data: perfis, error: erroPerfis } = await db.from('profiles').select('id, full_name, email, is_active').eq('tenant_id', tenant);
  if (erroPerfis) throw erroPerfis;
  const ativos = perfis.filter((p) => p.is_active !== false);
  const porEmail = new Map(ativos.map((p) => [String(p.email).toLowerCase(), p]));
  const porNome = new Map(ativos.map((p) => [normaliza(String(p.full_name)), p]));
  const { data: nomes, error: erroNomes } = await db.from('reuniao_nomes').select('nome_google, user_id, ignorar').eq('tenant_id', tenant);
  if (erroNomes) throw erroNomes;
  const ligados = new Map(nomes.map((n) => [n.nome_google as string, n]));

  const token = await tokenDoGoogle(CONTA);
  // As próximas duas semanas entram na Agenda; o histórico termina em hoje.
  const horizonte = new Date(agora.getTime() + 14 * 86400_000).toISOString();
  const eventos = await todosOsEventos(token, de, horizonte);
  const arquivos = await arquivosDasReunioes(token, de);
  const avisarPessoas = async (pessoas: string[], serie: string, title: string, message: string) => {
    if (pessoas.length === 0) return;
    const { error } = await db.from('notifications').insert(pessoas.map((user_id) => ({
      tenant_id: tenant, user_id, type: 'reminder', reference_type: 'reuniao', reference_id: serie, title, message,
    })));
    if (error) throw error;
  };
  const resultado = { eventos: eventos.length, sem_evento: 0, guardadas: 0, sem_pauta: 0, sem_mudanca: 0, parou_no_tempo: false, falhas: [] as string[] };

  const margem = 2 * 3600_000;
  const usados = new Set<string>();
  const encontros: Encontro[] = [];
  // Só reunião com sala do Meet. A que ainda não terminou entra sem pauta, para a Agenda e o lembrete.
  for (const e of eventos) {
    const inicio = e.start?.dateTime;
    const fim = e.end?.dateTime;
    if (e.status === 'cancelled' || !e.hangoutLink || !inicio || !fim) continue;
    const titulo = (e.summary ?? 'Reunião sem título').trim();
    const doEncontro = new Date(fim) <= agora ? arquivos.filter((a) => a.titulo === normaliza(titulo)
      && a.quando >= new Date(inicio).getTime() - margem && a.quando <= new Date(fim).getTime() + margem) : [];
    doEncontro.forEach((a) => usados.add(a.id));
    encontros.push({
      id: e.id, titulo, inicio, fim, repetida: !!e.recurringEventId, linkMeet: e.hangoutLink,
      sala: e.hangoutLink.split('/').pop()!, convidados: e.attendees ?? [], arquivos: doEncontro,
    });
  }
  const semEvento = encontrosSemEvento(arquivos, usados, de);
  resultado.sem_evento = semEvento.length;

  for (const m of [...encontros, ...semEvento]) {
    if (Date.now() - agora.getTime() > TEMPO_DA_RODADA) {
      resultado.parou_no_tempo = true;
      break;
    }
    const { id, titulo, inicio } = m;
    let fim = m.fim;
    const terminou = new Date(fim) <= agora;
    try {
      const documentos = m.arquivos.filter((a) => a.mimeType === 'application/vnd.google-apps.document' && /gemini|anota|transcri/i.test(a.tipo));
      const gravacao = m.arquivos.find((a) => a.mimeType.startsWith('video/'));
      const planilhas = m.arquivos.filter((a) => a.mimeType === 'application/vnd.google-apps.spreadsheet' && /particip|presen|attendance/i.test(a.tipo));
      // A data mais nova dos arquivos: documento ou lista que mudar faz o robô reler o encontro.
      const documentoEm = [...documentos, ...planilhas].map((a) => a.modifiedTime).sort().at(-1) ?? null;

      const { data: guardada, error: erroGuardada } = await db.from('reunioes').select('id, documento_em, inicio').eq('tenant_id', tenant).eq('google_evento', id).maybeSingle();
      if (erroGuardada) throw erroGuardada;
      const mesmoDocumento = guardada?.documento_em && documentoEm && new Date(guardada.documento_em).getTime() === new Date(documentoEm).getTime();
      // Sem documento dois dias depois, o Google não gerou anotações: a reunião fica como está.
      const semAnotacoes = guardada && !guardada.documento_em && !documentoEm && agora.getTime() - new Date(fim).getTime() > 2 * 86400_000;
      if (mesmoDocumento || semAnotacoes) {
        resultado.sem_mudanca++;
        continue;
      }

      // Sala aberta duas vezes no mesmo horário gera dois documentos: vale o que tem o conteúdo da reunião.
      const textos = await Promise.all(documentos.map(async (d) => ({ arquivo: d, texto: await textoDoArquivo(token, d.id, 'text/plain') })));
      const documento = textos.sort((a, b) => b.texto.length - a.texto.length)[0];
      const texto = documento ? separar(documento.texto) : null;
      // A sala aberta antes da hora também gera lista: vale a que tem mais gente.
      const listas = await Promise.all(planilhas.map((p) => textoDoArquivo(token, p.id, 'text/csv')));
      const lista = listas.sort((a, b) => b.split('\n').length - a.split('\n').length)[0] ?? null;

      // A presença: quem foi convidado e quem entrou, ligados às pessoas do Helpoint.
      const entraram: Map<string, Tempo> = m.sala && terminou ? await quemEntrou(token, m.sala, inicio, fim)
        : lista ? pessoasDaLista(lista, inicio) : new Map();
      // Sala sem documento e só com robô dentro não foi reunião.
      if (!m.sala && !documento && entraram.size === 0) continue;
      if (!m.sala) {
        const saidas = [...entraram.values()].flatMap((p) => (p.saida ? [p.saida] : [])).sort();
        fim = saidas.at(-1) ? new Date(saidas.at(-1)!).toISOString() : fim;
      }
      const linhas = new Map<string, { nome: string; user_id: string | null; convidado: boolean; entrou: boolean; entrada: string | null; saida: string | null }>();
      const chave = (user: string | null, nome: string) => user ?? `nome:${nome}`;
      for (const a of m.convidados) {
        const email = a.email?.toLowerCase();
        if (!email || a.resource || email === CONTA) continue;
        const p = porEmail.get(email);
        const nome = String(p?.full_name ?? a.displayName ?? email);
        linhas.set(chave(p?.id ?? null, nome), { nome, user_id: p?.id ?? null, convidado: true, entrou: false, entrada: null, saida: null });
      }
      for (const [nomeGoogle, tempo] of entraram) {
        const ligacao = ligados.get(nomeGoogle);
        const presenca = { entrada: tempo.entrada, saida: tempo.saida };
        if (ligacao?.ignorar) {
          linhas.set(chave(null, nomeGoogle), { nome: nomeGoogle, user_id: null, convidado: false, entrou: true, ...presenca });
          continue;
        }
        const user = (ligacao?.user_id as string | null) ?? (tempo.email ? porEmail.get(tempo.email)?.id : null) ?? porNome.get(normaliza(nomeGoogle))?.id ?? pessoaPeloNome(nomeGoogle, ativos)?.id ?? null;
        // O nome ligado sozinho sai da lista do administrador.
        if (user && ligacao && !ligacao.user_id) {
          const { error } = await db.from('reuniao_nomes').update({ user_id: user }).eq('tenant_id', tenant).eq('nome_google', nomeGoogle);
          if (error) throw error;
          ligados.set(nomeGoogle, { ...ligacao, user_id: user });
        }
        const k = chave(user, nomeGoogle);
        const atual = linhas.get(k);
        linhas.set(k, { nome: atual?.nome ?? nomeGoogle, user_id: user, convidado: atual?.convidado ?? false, entrou: true, ...presenca });
        if (!user && !ligacao) {
          const { error } = await db.from('reuniao_nomes').upsert({ tenant_id: tenant, nome_google: nomeGoogle }, { onConflict: 'tenant_id,nome_google', ignoreDuplicates: true });
          if (error) throw error;
          ligados.set(nomeGoogle, { nome_google: nomeGoogle, user_id: null, ignorar: false });
        }
      }
      const pessoas = [...linhas.values()];
      const membros = [...new Set(pessoas.flatMap((p) => (p.user_id ? [p.user_id] : [])))];
      // Reunião futura sem ninguém do Helpoint não tem Agenda para aparecer. A que aconteceu fica, e a Diretoria alcança.
      if (!terminou && membros.length === 0) continue;

      // Um canal por nome de reunião: o Google divide a mesma reunião em séries quando alguém a edita.
      const googleSerie = `titulo:${normaliza(titulo)}`;
      const { data: serie, error: erroSerie } = await db.from('reuniao_series').select('id, canal_id, avulsa').eq('tenant_id', tenant).eq('google_serie', googleSerie).maybeSingle();
      if (erroSerie) throw erroSerie;
      let canalId = serie?.canal_id as string | undefined;
      let serieId = serie?.id as string | undefined;
      if (serie?.avulsa && (m.repetida || !guardada)) {
        const { error } = await db.from('reuniao_series').update({ avulsa: false }).eq('id', serie.id);
        if (error) throw error;
      }
      if (!canalId) {
        const { data: canal, error } = await db.from('chat_channels')
          .insert({ tenant_id: tenant, nome: `reuniao-${crypto.randomUUID().slice(0, 13)}`, privado: true, tipo: 'reuniao' }).select('id').single();
        if (error) throw error;
        canalId = canal.id;
        const { data: nova, error: erroNova } = await db.from('reuniao_series')
          .insert({ tenant_id: tenant, google_serie: googleSerie, titulo, avulsa: !m.repetida, canal_id: canalId }).select('id').single();
        if (erroNova) throw erroNova;
        serieId = nova.id;
      }

      const remarcada = guardada && new Date(guardada.inicio).getTime() !== new Date(inicio).getTime();
      const { data: reuniao, error: erroReuniao } = await db.from('reunioes').upsert({
        tenant_id: tenant, serie_id: serieId, google_evento: id, titulo, inicio, fim,
        documento_id: documento?.arquivo.id ?? null, documento_em: documentoEm,
        link_documento: documento?.arquivo.webViewLink ?? null, link_gravacao: gravacao?.webViewLink ?? null, link_meet: m.linkMeet,
        pauta: texto?.pauta || null, lista_google: lista, updated_at: agora.toISOString(),
        ...(remarcada ? { lembrete_em: null } : {}),
      }, { onConflict: 'tenant_id,google_evento' }).select('id').single();
      if (erroReuniao) throw erroReuniao;

      if (texto?.transcricao) {
        const { error } = await db.from('reuniao_transcricoes').upsert({ reuniao_id: reuniao.id, tenant_id: tenant, texto: texto.transcricao });
        if (error) throw error;
      } else {
        const { error } = await db.from('reuniao_transcricoes').delete().eq('reuniao_id', reuniao.id);
        if (error) throw error;
      }
      const { error: erroApaga } = await db.from('reuniao_presencas').delete().eq('reuniao_id', reuniao.id);
      if (erroApaga) throw erroApaga;
      if (pessoas.length) {
        const { error } = await db.from('reuniao_presencas').insert(pessoas.map((p) => ({ ...p, tenant_id: tenant, reuniao_id: reuniao.id })));
        if (error) throw error;
      }
      if (membros.length) {
        const { error } = await db.from('chat_channel_members')
          .upsert(membros.map((p) => ({ tenant_id: tenant, channel_id: canalId, user_id: p })), { onConflict: 'channel_id,user_id', ignoreDuplicates: true });
        if (error) throw error;
      }

      if (texto) resultado.guardadas++; else if (terminou) resultado.sem_pauta++;
      // Uma mensagem por reunião, quando há pauta. Reler o documento não repete o aviso.
      const recente = agora.getTime() - new Date(fim).getTime() < 3 * 86400_000;
      if (avisar && texto && recente && membros[0]) {
        const { count, error: erroConta } = await db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('reuniao_id', reuniao.id);
        if (erroConta) throw erroConta;
        if (!count) {
          const dia = new Date(inicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const { error } = await db.from('chat_messages').insert({
            tenant_id: tenant, channel_id: canalId, author_id: membros[0], reuniao_id: reuniao.id,
            conteudo: `Pauta de ${dia}: ${titulo}`,
          });
          if (error) throw error;
          await avisarPessoas(membros, serieId!, `Pauta de ${dia}: ${titulo}`, 'A pauta da reunião já está no Helpoint.');
        }
      }
    } catch (erro) {
      resultado.falhas.push(`${titulo}: ${String((erro as Error).message).slice(0, 200)}`);
    }
  }

  // Reunião cancelada no Google some da Agenda. A lista só vale completa, sem parada por tempo.
  if (!resultado.parou_no_tempo) {
    const vivas = eventos.map((e) => e.id);
    const { data: futuras, error } = await db.from('reunioes').select('id, google_evento').eq('tenant_id', tenant).gt('inicio', agora.toISOString());
    if (error) resultado.falhas.push(error.message);
    const canceladas = (futuras ?? []).filter((r) => !vivas.includes(r.google_evento)).map((r) => r.id);
    if (canceladas.length) {
      const { error: erroApaga } = await db.from('reunioes').delete().in('id', canceladas);
      if (erroApaga) resultado.falhas.push(erroApaga.message);
    }
  }

  // Meia hora antes: quem vai à reunião recebe o aviso, uma vez.
  const limite = new Date(agora.getTime() + 35 * 60_000).toISOString();
  const { data: proximas, error: erroProximas } = await db.from('reunioes').select('id, serie_id, titulo, inicio')
    .eq('tenant_id', tenant).is('lembrete_em', null).gt('inicio', agora.toISOString()).lte('inicio', limite);
  if (erroProximas) resultado.falhas.push(erroProximas.message);
  for (const r of proximas ?? []) {
    try {
      const { data: presencas, error } = await db.from('reuniao_presencas').select('user_id').eq('reuniao_id', r.id).not('user_id', 'is', null);
      if (error) throw error;
      const { count, error: erroConta } = await db.from('reunioes').select('id', { count: 'exact', head: true })
        .eq('serie_id', r.serie_id).lt('inicio', r.inicio).not('pauta', 'is', null);
      if (erroConta) throw erroConta;
      const hora = new Date(r.inicio).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      await avisarPessoas(presencas.map((p) => p.user_id as string), r.serie_id, `Reunião às ${hora}: ${r.titulo}`,
        count ? 'Veja na reunião onde a última parou.' : 'A reunião começa em breve.');
      const { error: erroMarca } = await db.from('reunioes').update({ lembrete_em: agora.toISOString() }).eq('id', r.id);
      if (erroMarca) throw erroMarca;
    } catch (erro) {
      resultado.falhas.push(`Lembrete de ${r.titulo}: ${String((erro as Error).message).slice(0, 200)}`);
    }
  }
  return resultado;
}

serve(async (req) => {
  const recusa = requireServiceRole(req);
  if (recusa) return recusa;
  const corpo = await req.json().catch(() => ({})) as { desde?: string; avisar?: boolean };

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // ponytail: uma conta do Google, de uma empresa. Com outra empresa, a conta vira configuração por empresa.
  const { data: empresa, error: erroEmpresa } = await db.from('tenants').select('id').order('created_at').limit(1).single();
  if (erroEmpresa) return json({ error: erroEmpresa.message }, 500);
  const tenant = empresa.id as string;

  try {
    const resultado = await rodada(db, tenant, corpo);
    const { error } = await db.from('reuniao_robo').upsert({
      tenant_id: tenant, ok_em: new Date().toISOString(), caiu_em: null, ultimo_erro: resultado.falhas[0] ?? null,
    });
    if (error) throw error;
    return json(resultado);
  } catch (erro) {
    // A leitura inteira parou: chave recusada ou Google fora. Avisa quem administra, uma vez por queda.
    const motivo = String((erro as Error).message).slice(0, 200);
    const { error } = await db.rpc('reuniao_robo_caiu', { p_tenant: tenant, p_motivo: motivo });
    if (error) console.error('reuniao_robo_caiu:', error.message);
    return json({ error: motivo }, 500);
  }
});
