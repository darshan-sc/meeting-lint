import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type IngestRequest = {
  documents?: Array<{
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  content?: string;
  metadata?: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMBED_MODEL = Deno.env.get("EMBED_MODEL") ?? "text-embedding-3-small";
const OPENAI_EMBEDDINGS_URL =
  Deno.env.get("OPENAI_EMBEDDINGS_URL") ??
  "https://api.openai.com/v1/embeddings";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function createEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const vectors = data?.data?.map((item: { embedding: number[] }) => item.embedding);
  if (!Array.isArray(vectors) || vectors.length !== inputs.length) {
    throw new Error("Embedding response shape mismatch.");
  }

  return vectors as number[][];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST /ingest-document" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !openAiKey) {
      return jsonResponse(
        {
          error:
            "Missing required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY",
        },
        500,
      );
    }

    const body = (await req.json().catch(() => ({}))) as IngestRequest;
    const docs = body.documents && body.documents.length
      ? body.documents
      : body.content
      ? [{ content: body.content, metadata: body.metadata ?? {} }]
      : [];

    if (!docs.length) {
      return jsonResponse(
        { error: "Provide `content` or `documents[{content, metadata}]`." },
        400,
      );
    }

    const texts = docs.map((d) => d.content.trim()).filter(Boolean);
    if (!texts.length) {
      return jsonResponse({ error: "All content values were empty." }, 400);
    }

    const vectors = await createEmbeddings(texts, openAiKey);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload = texts.map((content, idx) => ({
      content,
      metadata: docs[idx]?.metadata ?? {},
      embedding: vectors[idx],
    }));

    const { data, error } = await supabase
      .from("document")
      .insert(payload)
      .select("id, content, metadata, created_at");

    if (error) {
      throw new Error(`Failed to insert into document table: ${error.message}`);
    }

    return jsonResponse({
      status: "ok",
      inserted: data?.length ?? 0,
      embed_model: EMBED_MODEL,
      rows: data ?? [],
    });
  } catch (error) {
    return jsonResponse(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

