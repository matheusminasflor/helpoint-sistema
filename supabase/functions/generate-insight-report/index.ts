import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callTenantAI, AIError } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LYRA_SYSTEM_PROMPT = `Você é uma Analista de Dados Sênior de TI. Fria, objetiva e pragmática.

REGRAS ESTRITAS:
- SE as métricas estão dentro da meta ou melhorando: reconheça a estabilidade e recomende "Manter processos atuais". NÃO invente sugestões de mudança.
- Destaque APENAS desvios padrão reais (ex: "Técnico X teve queda de 30% na resolução", "Categoria Rede teve pico de chamados terça-feira").
- Use bullet points curtos.
- Sem introduções longas, sem jargões motivacionais, sem textos poéticos.
- Máximo 8 bullet points por análise.
- Seja realista e direta.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { report_id } = await req.json();
    if (!report_id) {
      return new Response(JSON.stringify({ error: "report_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for DB queries
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Get user profile for tenant_id
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tenantId = profile.tenant_id;

    // Get the report
    const { data: report } = await adminClient
      .from("ti_insight_reports")
      .select("*")
      .eq("id", report_id)
      .eq("tenant_id", tenantId)
      .single();
    if (!report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetMetrics: string[] = report.target_metrics || [];
    const metricsData: Record<string, any> = {};
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Collect metrics
    for (const metric of targetMetrics) {
      switch (metric) {
        case "tickets_open_closed": {
          const { data: open } = await adminClient
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["open", "in_progress"])
            .gte("created_at", thirtyDaysAgo);
          const { data: closed } = await adminClient
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["resolved", "closed"])
            .gte("created_at", thirtyDaysAgo);
          const { count: openCount } = await adminClient
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["open", "in_progress"])
            .gte("created_at", thirtyDaysAgo);
          const { count: closedCount } = await adminClient
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["resolved", "closed"])
            .gte("created_at", thirtyDaysAgo);
          metricsData.tickets_open_closed = {
            value: `${openCount ?? 0} / ${closedCount ?? 0}`,
            total: (openCount ?? 0) + (closedCount ?? 0),
            detail: `Abertos: ${openCount ?? 0} | Fechados: ${closedCount ?? 0} (últimos 30 dias)`,
            open: openCount ?? 0,
            closed: closedCount ?? 0,
          };
          break;
        }
        case "avg_resolution_time": {
          const { data: resolved } = await adminClient
            .from("tickets")
            .select("created_at, resolved_at")
            .eq("tenant_id", tenantId)
            .not("resolved_at", "is", null)
            .gte("created_at", thirtyDaysAgo);
          let avgHours = 0;
          if (resolved && resolved.length > 0) {
            const totalMs = resolved.reduce((sum: number, t: any) => {
              return sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime());
            }, 0);
            avgHours = Math.round((totalMs / resolved.length / (1000 * 60 * 60)) * 10) / 10;
          }
          metricsData.avg_resolution_time = {
            value: `${avgHours}h`,
            detail: `Baseado em ${resolved?.length ?? 0} tickets resolvidos`,
          };
          break;
        }
        case "sla_violations": {
          const { count } = await adminClient
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .not("sla_due_at", "is", null)
            .lt("sla_due_at", now.toISOString())
            .in("status", ["open", "in_progress"])
            .gte("created_at", thirtyDaysAgo);
          metricsData.sla_violations = {
            value: count ?? 0,
            detail: "Chamados com SLA vencido (últimos 30 dias)",
          };
          break;
        }
        case "critical_assets": {
          const { count } = await adminClient
            .from("assets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "maintenance");
          const { count: inactiveCount } = await adminClient
            .from("assets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "inactive");
          metricsData.critical_assets = {
            value: (count ?? 0) + (inactiveCount ?? 0),
            detail: `Em manutenção: ${count ?? 0} | Inativos: ${inactiveCount ?? 0}`,
          };
          break;
        }
        case "technician_performance": {
          const { data: tickets } = await adminClient
            .from("tickets")
            .select("assigned_to")
            .eq("tenant_id", tenantId)
            .in("status", ["resolved", "closed"])
            .not("assigned_to", "is", null)
            .gte("created_at", thirtyDaysAgo);
          const countMap: Record<string, number> = {};
          for (const t of tickets || []) {
            countMap[t.assigned_to] = (countMap[t.assigned_to] || 0) + 1;
          }
          const sorted = Object.entries(countMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          // Get names
          const techIds = sorted.map(([id]) => id);
          const { data: profiles } = await adminClient
            .from("profiles")
            .select("id, full_name")
            .in("id", techIds.length > 0 ? techIds : ["__none__"]);
          const nameMap: Record<string, string> = {};
          for (const p of profiles || []) {
            nameMap[p.id] = p.full_name || "Sem nome";
          }
          const chartData = sorted.map(([id, count]) => ({
            name: nameMap[id] || "Desconhecido",
            value: count,
          }));
          metricsData.technician_performance = {
            value: `${tickets?.length ?? 0} resolvidos`,
            detail: `Top ${sorted.length} técnicos`,
          };
          metricsData.chart_data = chartData;
          break;
        }
        case "top_requesters": {
          const { data: tickets } = await adminClient
            .from("tickets")
            .select("requester_id")
            .eq("tenant_id", tenantId)
            .gte("created_at", thirtyDaysAgo);
          const countMap: Record<string, number> = {};
          for (const t of tickets || []) {
            countMap[t.requester_id] = (countMap[t.requester_id] || 0) + 1;
          }
          const sorted = Object.entries(countMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          const reqIds = sorted.map(([id]) => id);
          const { data: profiles } = await adminClient
            .from("profiles")
            .select("id, full_name")
            .in("id", reqIds.length > 0 ? reqIds : ["__none__"]);
          const nameMap: Record<string, string> = {};
          for (const p of profiles || []) {
            nameMap[p.id] = p.full_name || "Sem nome";
          }
          metricsData.top_requesters = {
            value: `${tickets?.length ?? 0} chamados`,
            detail: sorted.map(([id, c]) => `${nameMap[id] || "?"}: ${c}`).join(", "),
          };
          break;
        }
      }
    }

    // Build prompt for Lyra
    const metricLabels: Record<string, string> = {
      tickets_open_closed: "Chamados Abertos vs Fechados",
      avg_resolution_time: "Tempo Médio de Resolução",
      sla_violations: "Violações de SLA",
      critical_assets: "Ativos Críticos",
      technician_performance: "Desempenho por Técnico",
      top_requesters: "Top Solicitantes",
    };

    let metricsText = "Métricas coletadas (últimos 30 dias):\n\n";
    for (const metric of targetMetrics) {
      const data = metricsData[metric];
      if (data) {
        metricsText += `**${metricLabels[metric] || metric}**: ${data.value}\n`;
        if (data.detail) metricsText += `  → ${data.detail}\n`;
      }
    }
    if (metricsData.chart_data) {
      metricsText += `\nDesempenho detalhado:\n`;
      for (const item of metricsData.chart_data) {
        metricsText += `- ${item.name}: ${item.value} tickets\n`;
      }
    }

    // Call Lovable AI
    let lyraAnalysis: string | null = null;
    try {
      const aiResult = await callTenantAI(tenantId, {
        messages: [
          { role: "system", content: LYRA_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analise as seguintes métricas do departamento de TI e forneça sua análise gerencial:\n\n${metricsText}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 1000,
      });
      lyraAnalysis = aiResult.content;
    } catch (e) {
      // Sem credencial de IA: o relatório é gerado apenas com os números.
      if (e instanceof AIError && e.code === "no_ai_credentials") {
        lyraAnalysis = null;
      } else {
        console.error("AI call failed:", e);
      }
    }

    // Save snapshot
    const { data: snapshot, error: snapError } = await adminClient
      .from("ti_insight_snapshots")
      .insert({
        report_id,
        tenant_id: tenantId,
        metrics_data: metricsData,
        lyra_analysis: lyraAnalysis,
      })
      .select()
      .single();

    if (snapError) {
      console.error("Snapshot insert error:", snapError);
      return new Response(JSON.stringify({ error: "Failed to save snapshot" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_generated_at
    await adminClient
      .from("ti_insight_reports")
      .update({ last_generated_at: new Date().toISOString() })
      .eq("id", report_id);

    return new Response(JSON.stringify({ success: true, snapshot }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
