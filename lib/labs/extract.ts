import { anthropic, SONNET, estimateCostUsd } from '@/lib/anthropic';
import { extractJson } from '@/lib/json';
import type { LabExtraction } from './types';

// Sonnet for lab extraction — tabular PDFs and screenshots of lab reports
// need decent vision + structure recall. Haiku misses ref ranges on
// crowded layouts; the marginal cost (~$0.01 per typical 3-page panel)
// is fine for a once-per-quarter operation.
//
// Prompt is intentionally conservative: copy what's printed, don't
// canonicalize, don't interpret. Canonicalization is a separate pass
// against a curated catalog (PR #2).
const SYSTEM = `You extract structured data from health/lab test documents (blood panels, hormone panels, gut microbiome reports, DEXA scans, body composition, etc.). The user uploads a PDF or screenshot; you return JSON.

Hard rules:

1. FAITHFUL TRANSCRIPTION ONLY. Copy what's printed. Do NOT canonicalize names ("FERRITIN, S" stays "FERRITIN, S", not "ferritin"). Do NOT convert units. Do NOT compute or impute values. Canonicalization is a separate pass.

2. PANELS. One document may contain multiple panel dates (some labs print 3 months of trend data). Emit one "panels" entry per (date, panel_type) tuple. If a single page mixes thyroid + lipids, that's two panels.

3. ANALYTES. Each row on the report is one analyte. Include ALL of them, even unfamiliar ones — we'll handle canonical naming later. If a row has no value but is listed, include it with value_num/value_text null.

4. VALUES. Prefer numeric (value_num). Use value_text ONLY when the printed value is non-numeric: "<5", "Detected", "Positive", "Negative", a textual scale, etc.

5. REFERENCE RANGES. Parse "0.4-4.5" into ref_low=0.4, ref_high=4.5. For ">200" leave ref_low null, ref_high=200 (or vice versa). For non-numeric ranges ("Negative", "Normal flora") use ref_text.

6. FLAGS. Capture the lab's own flag column if present: H, L, HH, LL, or 'abnormal'. Do NOT infer from value vs. range — only copy what's printed.

7. PANEL_TYPE — categorize using only:
   blood (catch-all for serum panels not otherwise specified),
   lipid, thyroid, cbc, metabolic_panel,
   hormones, micronutrients, inflammation,
   gut_microbiome, dexa, inbody,
   other.
   Use null if you genuinely can't tell.

8. PROVIDER + LAB_NAME. Read off the document header. "Quest Diagnostics" -> provider="Quest Diagnostics". The internal test name ("Comprehensive Metabolic Panel") goes in lab_name.

9. CONFIDENCE. "high" if you read clean printed values from a real lab report; "medium" if it's a screenshot of a chart or partially clipped; "low" if the document is unclear, rotated, faded, or mostly handwritten.

10. WARNINGS. Use the "warnings" array for things the UI should flag: "page 2 is rotated 90°", "ref ranges missing on hormones panel", "value for TSH is illegible". Be specific.

Return JSON ONLY. Schema:

{
  "panels": [
    {
      "panel_date": "YYYY-MM-DD or null",
      "panel_type": "blood | lipid | thyroid | cbc | metabolic_panel | hormones | micronutrients | inflammation | gut_microbiome | dexa | inbody | other | null",
      "provider": string | null,
      "lab_name": string | null,
      "analytes": [
        {
          "name_raw": string,
          "value_num": number | null,
          "value_text": string | null,
          "unit": string | null,
          "ref_low": number | null,
          "ref_high": number | null,
          "ref_text": string | null,
          "flag": "H" | "L" | "HH" | "LL" | "abnormal" | null,
          "notes": string | null
        }
      ]
    }
  ],
  "warnings": string[],
  "confidence": "high" | "medium" | "low"
}`;

export interface ExtractInput {
  base64: string;
  mime: string;
  source: 'pdf' | 'image';
  filename?: string;
}

export interface ExtractResult {
  extraction: LabExtraction;
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export async function extractLabDocument(input: ExtractInput): Promise<ExtractResult> {
  const client = anthropic();
  const model = SONNET;

  // PDFs use document blocks; images use image blocks. We go through the
  // beta.messages namespace because the document block type only lives
  // there in the SDK version pinned to this project. PDF support itself
  // is GA — no beta header needed.
  const pdfContent = [
    {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: input.base64,
      },
      ...(input.filename ? { title: input.filename } : {}),
    },
    { type: 'text' as const, text: 'Extract every analyte. Return JSON only.' },
  ];
  const imageContent = [
    {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: input.mime as 'image/png' | 'image/jpeg' | 'image/webp',
        data: input.base64,
      },
    },
    { type: 'text' as const, text: 'Extract every analyte. Return JSON only.' },
  ];

  const response = await client.beta.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: input.source === 'pdf' ? pdfContent : imageContent,
      },
    ],
  });

  const text = response.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('\n');
  const extraction = extractJson<LabExtraction>(text);
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    extraction,
    usage: {
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
    },
  };
}
