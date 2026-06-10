// Shape Claude returns when extracting a lab document. We hold whatever
// the model read off the page in `name_raw`; canonical analyte mapping
// happens in a later pass against a curated catalog (Huberman guest
// frameworks: Attia / Galpin / Norton / Lustig). Keep this prompt focused
// on faithful transcription, NOT interpretation.
export interface LabExtraction {
  panels: Array<{
    panel_date: string | null;            // YYYY-MM-DD if printed
    panel_type:
      | 'blood'
      | 'lipid'
      | 'thyroid'
      | 'cbc'
      | 'metabolic_panel'
      | 'hormones'
      | 'micronutrients'
      | 'inflammation'
      | 'gut_microbiome'
      | 'dexa'
      | 'inbody'
      | 'other'
      | null;
    provider: string | null;              // 'Quest', 'LabCorp', 'NewAlth'
    lab_name: string | null;              // 'Comprehensive Metabolic Panel'
    analytes: Array<{
      name_raw: string;                   // as printed
      value_num: number | null;
      value_text: string | null;          // for non-numeric: '<5', 'Detected', 'Positive'
      unit: string | null;
      ref_low: number | null;
      ref_high: number | null;
      ref_text: string | null;            // for non-numeric ranges
      flag: 'H' | 'L' | 'HH' | 'LL' | 'abnormal' | null;
      notes: string | null;
    }>;
  }>;
  warnings: string[];                     // extraction issues to surface in UI
  confidence: 'high' | 'medium' | 'low';
}
