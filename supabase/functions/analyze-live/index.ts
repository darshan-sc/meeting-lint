import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type TranscriptRow = {
  id: number;
  text: string | null;
  user_id: string | null;
  created_at: string;
};

type DocumentMatch = {
  id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

type AnalyzeRequest = {
  top_k?: number;
  min_similarity?: number;
  max_rows?: number;
  user_id?: string;
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

const CONFLICT_RULES: Array<{ keyword: string; reason: string }> = [
  { keyword: "microservice", reason: "MVP expects modular monolith, not microservices." },
  { keyword: "kafka", reason: "MVP avoids external distributed queues in v1." },
  { keyword: "mongodb", reason: "MVP requires PostgreSQL + pgvector as primary DB." },
  { keyword: "zoom", reason: "Meeting provider integrations are out of v1 scope." },
  { keyword: "google meet", reason: "Meeting provider integrations are out of v1 scope." },
  { keyword: "video", reason: "Video processing is a non-goal in v1." },
  { keyword: "optional otp", reason: "FSD example says OTP is mandatory for email login." },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function createEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding response did not contain a valid vector.");
  }

  return embedding as number[];
}

function detectConflict(text: string): { detected: boolean; reasons: string[] } {
  const normalized = text.toLowerCase();
  const reasons = CONFLICT_RULES
    .filter((rule) => normalized.includes(rule.keyword))
    .map((rule) => rule.reason);

  return {
    detected: reasons.length > 0,
    reasons,
  };
}

async function fetchTranscripts(
  supabase: ReturnType<typeof createClient>,
  userId?: string,
  maxRows?: number,
): Promise<TranscriptRow[]> {
  const batchSize = 500;
  let from = 0;
  const rows: TranscriptRow[] = [];

  while (true) {
    let query = supabase
      .from("transcript")
      .select("id,text,user_id,created_at")
      .order("id", { ascending: true })
      .range(from, from + batchSize - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch transcript rows: ${error.message}`);
    }

    const chunk = (data ?? []) as TranscriptRow[];
    if (chunk.length === 0) {
      break;
    }

    rows.push(...chunk);

    if (maxRows && rows.length >= maxRows) {
      return rows.slice(0, maxRows);
    }

    if (chunk.length < batchSize) {
      break;
    }

    from += batchSize;
  }

  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST /analyze-live" }, 405);
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

    const body = (await req.json().catch(() => ({}))) as AnalyzeRequest;
    const topK = Math.min(Math.max(body.top_k ?? 5, 1), 20);
    const minSimilarity = Math.min(Math.max(body.min_similarity ?? 0, 0), 1);
    const maxRows = body.max_rows && body.max_rows > 0 ? body.max_rows : undefined;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const transcriptRows = await fetchTranscripts(supabase, body.user_id, maxRows);
    const results = [];

    for (const row of transcriptRows) {
      const transcriptText = (row.text ?? "").trim();
      if (!transcriptText) {
        continue;
      }

      const queryEmbedding = await createEmbedding(transcriptText, openAiKey);
      const { data: matches, error: rpcError } = await supabase.rpc("match_document", {
        query_embedding: queryEmbedding,
        match_count: topK,
        min_similarity: minSimilarity,
      });

      if (rpcError) {
        throw new Error(`match_document failed for transcript ${row.id}: ${rpcError.message}`);
      }

      const conflict = detectConflict(transcriptText);
      const typedMatches = (matches ?? []) as DocumentMatch[];
      const topScore = typedMatches.length > 0 ? typedMatches[0].similarity : null;

      let factCheckSummary = "No explicit contradiction markers detected.";
      if (conflict.detected) {
        factCheckSummary = "Potential contradiction detected. Review matched evidence.";
      } else if (!typedMatches.length) {
        factCheckSummary = "No supporting evidence found in document embeddings.";
      }

      results.push({
        transcript_id: row.id,
        user_id: row.user_id,
        created_at: row.created_at,
        text: transcriptText,
        conflict_detected: conflict.detected,
        conflict_reasons: conflict.reasons,
        fact_check_summary: factCheckSummary,
        best_similarity: topScore,
        matches: typedMatches,
      });
    }

    return jsonResponse({
      status: "ok",
      total_transcripts_read: transcriptRows.length,
      total_transcripts_processed: results.length,
      embed_model: EMBED_MODEL,
      top_k: topK,
      min_similarity: minSimilarity,
      results,
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
