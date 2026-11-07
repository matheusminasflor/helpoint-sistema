// Leva as reuniões da conta do Google para os canais do Chat (dono, 2026-11-07). Só leitura no Google. O texto entra
// como o Gemini gerou: o Helpoint separa a pauta da transcrição e não resume nada. Exige service_role (verify_jwt = true).
//   Corpo opcional: { "desde": "2026-10-01T00:00:00-03:00", "avisar": false } importa o histórico sem mandar mensagem.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  attachments?: { fileId?: string; fileUrl?: string; title?: string; mimeType?: string }[];
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const normaliza = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

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

serve(async (req) => {
  const recusa = requireServiceRole(req);
  if (recusa) return recusa;

  const corpo = await req.json().catch(() => ({})) as { desde?: string; avisar?: boolean };
  const avisar = corpo.avisar !== false;
  const agora = new Date();
  const de = corpo.desde ?? new Date(agora.getTime() - 3 * 86400_000).toISOString();

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // ponytail: uma conta do Google, de uma empresa. Com outra empresa, a conta vira configuração por empresa.
  const { data: empresa, error: erroEmpresa } = await db.from('tenants').select('id').order('created_at').limit(1).single();
  if (erroEmpresa) return json({ error: erroEmpresa.message }, 500);
  const tenant = empresa.id as string;

  const { data: perfis, error: erroPerfis } = await db.from('profiles').select('id, full_name, email, is_active').eq('tenant_id', tenant);
  if (erroPerfis) return json({ error: erroPerfis.message }, 500);
  const ativos = perfis.filter((p) => p.is_active !== false);
  const porEmail = new Map(ativos.map((p) => [String(p.email).toLowerCase(), p]));
  const porNome = new Map(ativos.map((p) => [normaliza(String(p.full_name)), p]));
  const { data: nomes, error: erroNomes } = await db.from('reuniao_nomes').select('nome_google, user_id, ignorar').eq('tenant_id', tenant);
  if (erroNomes) return json({ error: erroNomes.message }, 500);
  const ligados = new Map(nomes.map((n) => [n.nome_google as string, n]));

  const token = await tokenDoGoogle(CONTA);
  const eventos = await todosOsEventos(token, de, agora.toISOString());
  const resultado = { eventos: eventos.length, guardadas: 0, sem_pauta: 0, sem_mudanca: 0, parou_no_tempo: false, falhas: [] as string[] };

  for (const e of eventos) {
    if (Date.now() - agora.getTime() > TEMPO_DA_RODADA) {
      resultado.parou_no_tempo = true;
      break;
    }
    const inicio = e.start?.dateTime;
    const fim = e.end?.dateTime;
    // Só reunião com sala do Meet, que já terminou.
    if (e.status === 'cancelled' || !e.hangoutLink || !inicio || !fim || new Date(fim) > agora) continue;
    const titulo = (e.summary ?? 'Reunião sem título').trim();
    try {
      const anexos = e.attachments ?? [];
      const documento = anexos.find((a) => a.mimeType === 'application/vnd.google-apps.document' && /gemini|anota/i.test(a.title ?? ''));
      const gravacao = anexos.find((a) => a.mimeType?.startsWith('video/'));
      const planilha = anexos.find((a) => a.mimeType === 'application/vnd.google-apps.spreadsheet' && /presen|attendance|participa/i.test(a.title ?? ''));
      let documentoEm: string | null = null;
      if (documento?.fileId) {
        ({ modifiedTime: documentoEm } = await lerDoGoogle<{ modifiedTime: string }>(token, `https://www.googleapis.com/drive/v3/files/${documento.fileId}?fields=modifiedTime`));
      }

      const { data: guardada, error: erroGuardada } = await db.from('reunioes').select('id, documento_em').eq('tenant_id', tenant).eq('google_evento', e.id).maybeSingle();
      if (erroGuardada) throw erroGuardada;
      const mesmoDocumento = guardada?.documento_em && documentoEm && new Date(guardada.documento_em).getTime() === new Date(documentoEm).getTime();
      // Sem documento dois dias depois, o Google não gerou anotações: a reunião fica como está.
      const semAnotacoes = guardada && !documentoEm && agora.getTime() - new Date(fim).getTime() > 2 * 86400_000;
      if (mesmoDocumento || semAnotacoes) {
        resultado.sem_mudanca++;
        continue;
      }

      // A presença: quem foi convidado e quem entrou, ligados às pessoas do Helpoint.
      const sala = e.hangoutLink.split('/').pop()!;
      const entraram = await quemEntrou(token, sala, inicio, fim);
      const linhas = new Map<string, { nome: string; user_id: string | null; convidado: boolean; entrou: boolean; entrada: string | null; saida: string | null }>();
      const chave = (user: string | null, nome: string) => user ?? `nome:${nome}`;
      for (const a of e.attendees ?? []) {
        const email = a.email?.toLowerCase();
        if (!email || a.resource || email === CONTA) continue;
        const p = porEmail.get(email);
        const nome = String(p?.full_name ?? a.displayName ?? email);
        linhas.set(chave(p?.id ?? null, nome), { nome, user_id: p?.id ?? null, convidado: true, entrou: false, entrada: null, saida: null });
      }
      for (const [nomeGoogle, tempo] of entraram) {
        const ligacao = ligados.get(nomeGoogle);
        if (ligacao?.ignorar) {
          linhas.set(chave(null, nomeGoogle), { nome: nomeGoogle, user_id: null, convidado: false, entrou: true, ...tempo });
          continue;
        }
        const user = (ligacao?.user_id as string | null) ?? porNome.get(normaliza(nomeGoogle))?.id ?? pessoaPeloNome(nomeGoogle, ativos)?.id ?? null;
        const k = chave(user, nomeGoogle);
        const atual = linhas.get(k);
        linhas.set(k, { nome: atual?.nome ?? nomeGoogle, user_id: user, convidado: atual?.convidado ?? false, entrou: true, ...tempo });
        if (!user && !ligacao) {
          const { error } = await db.from('reuniao_nomes').upsert({ tenant_id: tenant, nome_google: nomeGoogle }, { onConflict: 'tenant_id,nome_google', ignoreDuplicates: true });
          if (error) throw error;
          ligados.set(nomeGoogle, { nome_google: nomeGoogle, user_id: null, ignorar: false });
        }
      }
      const pessoas = [...linhas.values()];
      const membros = [...new Set(pessoas.flatMap((p) => (p.user_id ? [p.user_id] : [])))];
      if (membros.length === 0) continue;

      // Um canal por nome de reunião: o Google divide a mesma reunião em séries quando alguém a edita.
      const googleSerie = `titulo:${normaliza(titulo)}`;
      const { data: serie, error: erroSerie } = await db.from('reuniao_series').select('id, canal_id, avulsa').eq('tenant_id', tenant).eq('google_serie', googleSerie).maybeSingle();
      if (erroSerie) throw erroSerie;
      let canalId = serie?.canal_id as string | undefined;
      let serieId = serie?.id as string | undefined;
      if (serie?.avulsa && (e.recurringEventId || !guardada)) {
        const { error } = await db.from('reuniao_series').update({ avulsa: false }).eq('id', serie.id);
        if (error) throw error;
      }
      if (!canalId) {
        const { data: canal, error } = await db.from('chat_channels')
          .insert({ tenant_id: tenant, nome: `reuniao-${crypto.randomUUID().slice(0, 13)}`, privado: true, tipo: 'reuniao' }).select('id').single();
        if (error) throw error;
        canalId = canal.id;
        const { data: nova, error: erroNova } = await db.from('reuniao_series')
          .insert({ tenant_id: tenant, google_serie: googleSerie, titulo, avulsa: !e.recurringEventId, canal_id: canalId }).select('id').single();
        if (erroNova) throw erroNova;
        serieId = nova.id;
      }

      const texto = documento?.fileId ? separar(await textoDoArquivo(token, documento.fileId, 'text/plain')) : null;
      const lista = planilha?.fileId ? await textoDoArquivo(token, planilha.fileId, 'text/csv') : null;

      const { data: reuniao, error: erroReuniao } = await db.from('reunioes').upsert({
        tenant_id: tenant, serie_id: serieId, google_evento: e.id, titulo, inicio, fim,
        documento_id: documento?.fileId ?? null, documento_em: documentoEm,
        link_documento: documento?.fileUrl ?? null, link_gravacao: gravacao?.fileUrl ?? null,
        pauta: texto?.pauta ?? null, lista_google: lista, updated_at: agora.toISOString(),
      }, { onConflict: 'tenant_id,google_evento' }).select('id').single();
      if (erroReuniao) throw erroReuniao;

      if (texto?.transcricao) {
        const { error } = await db.from('reuniao_transcricoes').upsert({ reuniao_id: reuniao.id, tenant_id: tenant, texto: texto.transcricao });
        if (error) throw error;
      }
      const { error: erroApaga } = await db.from('reuniao_presencas').delete().eq('reuniao_id', reuniao.id);
      if (erroApaga) throw erroApaga;
      const { error: erroPresenca } = await db.from('reuniao_presencas').insert(pessoas.map((p) => ({ ...p, tenant_id: tenant, reuniao_id: reuniao.id })));
      if (erroPresenca) throw erroPresenca;
      const { error: erroMembros } = await db.from('chat_channel_members')
        .upsert(membros.map((m) => ({ tenant_id: tenant, channel_id: canalId, user_id: m })), { onConflict: 'channel_id,user_id', ignoreDuplicates: true });
      if (erroMembros) throw erroMembros;

      if (texto) resultado.guardadas++; else resultado.sem_pauta++;
      // A mensagem sai uma vez, quando a pauta chega. Atualização do documento não repete o aviso.
      if (avisar && texto && !guardada?.documento_em) {
        const dia = new Date(inicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const { error } = await db.from('chat_messages').insert({
          tenant_id: tenant, channel_id: canalId, author_id: membros[0], reuniao_id: reuniao.id,
          conteudo: `Pauta de ${dia}: ${titulo}`,
        });
        if (error) throw error;
      }
    } catch (erro) {
      resultado.falhas.push(`${titulo}: ${String((erro as Error).message).slice(0, 200)}`);
    }
  }
  return json(resultado);
});
