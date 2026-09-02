// Public SAC submission endpoint — no JWT required
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveSacTenant, isTenantError } from "../_shared/sac-tenant.ts";
import { validateUploadMeta } from "../_shared/upload-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubmitPayload {
  tenant_slug?: string;
  tenant_id?: string;
  customer_email: string;
  customer_password?: string;
  customer_name: string;
  customer_document?: string;
  customer_phone?: string;
  product_name?: string;
  product_batch?: string;
  quantity?: number;
  purchase_date?: string;
  order_number?: string;
  category_id?: string;
  description: string;
  attachments?: { name: string; path: string; size: number; mime: string }[];
  dynamic_fields?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as SubmitPayload;

    if (!body.customer_email || !body.customer_name || !body.description) {
      return jsonResp({ error: "Campos obrigatórios faltando" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve tenant (host > slug/id validados). Sem fallback "primeira empresa".
    const resolved = await resolveSacTenant(supabase, req, {
      tenant_id: body.tenant_id,
      tenant_slug: body.tenant_slug,
    });
    if (isTenantError(resolved)) return jsonResp({ error: resolved.error }, resolved.status);
    const tenantId = resolved.tenant.id;

    // Valida anexos no servidor (tipo, tamanho e nome)
    for (const a of body.attachments ?? []) {
      const v = validateUploadMeta({ name: a.name, size: a.size, mime: a.mime }, "attachment");
      if (!v.ok) return jsonResp({ error: v.error }, 400);
      if (!String(a.path || "").startsWith(`${tenantId}/`)) {
        return jsonResp({ error: "invalid_attachment_path" }, 400);
      }
    }

    const email = body.customer_email.trim().toLowerCase();

    // Check if customer already exists
    const { data: existingProfile } = await supabase
      .from("customer_profiles")
      .select("user_id, tenant_id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile && existingProfile.tenant_id !== tenantId) {
      return jsonResp({ error: "email_belongs_to_another_tenant" }, 403);
    }

    let userId: string | undefined = existingProfile?.user_id;

    if (!userId) {
      // Create auth user (admin createUser)
      const password = body.customer_password || crypto.randomUUID();
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: body.customer_name, customer: true },
      });
      if (createErr || !created.user) {
        // Maybe user exists in auth but not in customer_profiles — try to find them
        const { data: list } = await supabase.auth.admin.listUsers();
        const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!found) return jsonResp({ error: createErr?.message || "Falha ao criar conta" }, 400);
        userId = found.id;
      } else {
        userId = created.user.id;
      }

      // Insert customer_profiles
      await supabase.from("customer_profiles").insert({
        user_id: userId,
        tenant_id: tenantId,
        full_name: body.customer_name,
        document: body.customer_document,
        phone: body.customer_phone,
        email,
      });

      // Assign 'customer' role
      await supabase.from("user_roles").insert({ user_id: userId, role: "customer" });
    }

    // Insert ticket
    const subject = body.product_name
      ? `${body.product_name}${body.product_batch ? ` (lote ${body.product_batch})` : ""}`
      : body.description.slice(0, 80);

    const { data: ticket, error: ticketErr } = await supabase
      .from("sac_tickets")
      .insert({
        tenant_id: tenantId,
        customer_user_id: userId,
        customer_email: email,
        customer_name: body.customer_name,
        customer_document: body.customer_document,
        customer_phone: body.customer_phone,
        product_name: body.product_name,
        product_batch: body.product_batch,
        quantity: body.quantity,
        purchase_date: body.purchase_date,
        order_number: body.order_number,
        subject,
        description: body.description,
        category_id: body.category_id,
        dynamic_fields: body.dynamic_fields || {},
      })
      .select("id, ticket_number")
      .single();

    if (ticketErr) return jsonResp({ error: ticketErr.message }, 400);

    // Attachments
    if (body.attachments?.length) {
      await supabase.from("sac_ticket_attachments").insert(
        body.attachments.map((a) => ({
          tenant_id: tenantId,
          ticket_id: ticket.id,
          uploaded_by: userId,
          file_name: a.name,
          file_path: a.path,
          file_size: a.size,
          mime_type: a.mime,
        }))
      );
    }

    return jsonResp({
      success: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      protocol: `SAC-${String(ticket.ticket_number).padStart(5, "0")}`,
      user_id: userId,
    });
  } catch (e) {
    return jsonResp({ error: (e as Error).message }, 500);
  }
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
