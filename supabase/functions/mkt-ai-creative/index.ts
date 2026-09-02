import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAssistantName } from "../_shared/assistant-name.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GenerateRequest {
  type: 'caption' | 'idea' | 'image' | 'image-edit' | 'reminder';
  prompt: string;
  source_image?: string; // base64 data URL for image editing
  context?: {
    platform?: string;
    brand_voice?: string;
    hashtags?: string[];
    event_name?: string;
  };
  post_id?: string;
  event_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { type, prompt, source_image, context, post_id, event_id }: GenerateRequest = await req.json();
    
    if (!type || !prompt) {
      return new Response(JSON.stringify({ error: 'type and prompt are required' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', authData.user.id)
      .single();
    const assistantName = await getAssistantName(creatorProfile?.tenant_id ?? null);

    let systemPrompt = '';
    let model = 'google/gemini-3-flash-preview';
    let generateImage = false;
    let isImageEdit = false;

    switch (type) {
      case 'caption':
        systemPrompt = `Você é ${assistantName}, uma assistente criativa de marketing especializada em criar legendas envolventes para redes sociais.

Diretrizes:
- Crie legendas que geram engajamento (perguntas, CTAs, emojis estratégicos)
- Adapte o tom para a plataforma: Instagram (visual, emocional), LinkedIn (profissional), TikTok (casual, trendy)
- Use hashtags relevantes quando apropriado
- Mantenha o texto conciso mas impactante
- Inclua call-to-action quando fizer sentido

Plataforma: ${context?.platform || 'Instagram'}
Tom da marca: ${context?.brand_voice || 'Profissional mas acessível'}`;
        break;

      case 'idea':
        systemPrompt = `Você é ${assistantName}, uma assistente criativa de marketing que sugere ideias de conteúdo.

Forneça 3-5 ideias criativas e originais para posts de redes sociais baseadas no tema fornecido.
Para cada ideia, inclua:
- Título/conceito
- Formato sugerido (foto, carrossel, vídeo, reels)
- Gancho inicial
- Hashtags relevantes

Plataforma foco: ${context?.platform || 'Multi-plataforma'}`;
        break;

      case 'image':
        systemPrompt = `Você é um gerador de imagens profissional para marketing digital.
Crie uma imagem de alta qualidade e profissional para uso em redes sociais.
A imagem deve ser visualmente atraente, moderna e adequada para ${context?.platform || 'Instagram'}.`;
        model = 'google/gemini-2.5-flash-image';
        generateImage = true;
        break;

      case 'image-edit':
        systemPrompt = `Você é um editor de imagens profissional para marketing digital.
Edite e melhore a imagem fornecida de acordo com as instruções do usuário.
Mantenha o conteúdo principal da imagem mas aplique as melhorias solicitadas.
O resultado deve ser adequado para uso em redes sociais.`;
        model = 'google/gemini-2.5-flash-image';
        generateImage = true;
        isImageEdit = true;
        break;

      case 'reminder':
        systemPrompt = `Você é ${assistantName}, uma assistente de marketing que cria lembretes e textos de comunicação para eventos.

Evento: ${context?.event_name || 'Evento'}

Crie um texto de lembrete/convite engajante que:
- Destaque a data e local
- Crie senso de urgência
- Inclua um CTA claro
- Seja adequado para envio por email ou redes sociais`;
        break;
    }

    // Build request body
    const requestBody: any = {
      model,
    };

    // For image editing, use multipart message with image
    if (isImageEdit && source_image) {
      requestBody.messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${systemPrompt}\n\nInstruções: ${prompt}` },
            { type: 'image_url', image_url: { url: source_image } }
          ]
        }
      ];
      requestBody.modalities = ['image', 'text'];
    } else if (generateImage) {
      // For image generation (no source image)
      requestBody.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];
      requestBody.modalities = ['image', 'text'];
    } else {
      // For text generation
      requestBody.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];
    }

    // Texto: usa o provedor de IA do próprio tenant (BYOK).
    if (!generateImage) {
      const textResult = await callTenantAI(creatorProfile?.tenant_id ?? null, {
        messages: requestBody.messages,
        maxTokens: 1200,
        temperature: 0.7,
      });
      return new Response(JSON.stringify({
        result: textResult.content || '',
        type,
        model: textResult.model,
        image_url: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Geração/edição de imagem continua no gateway de imagens (BYOK não cobre imagem).
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        error: 'image_generation_unavailable',
        message: 'Geração de imagem indisponível nesta instalação.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Limite de requisições atingido. Tente novamente em alguns minutos.'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Payment required',
          message: 'Créditos insuficientes. Adicione créditos ao workspace.'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const result = aiResponse.choices?.[0]?.message?.content || '';

    // For image generation/editing, extract image data if present
    let imageUrl = null;
    if (generateImage && aiResponse.choices?.[0]?.message) {
      const message = aiResponse.choices[0].message;
      // Lovable AI returns images in message.images array
      if (message.images && message.images.length > 0) {
        imageUrl = message.images[0].image_url?.url || null;
      }
    }

    return new Response(JSON.stringify({ 
      result,
      type,
      model,
      image_url: imageUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const aiErr = aiErrorResponse(error, corsHeaders);
    if (aiErr) return aiErr;
    console.error('mkt-ai-creative error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
