import OpenAI from 'openai';
import { shouldUseMockAi } from '@/lib/env';

export interface ExtractionResult {
    summary: string;
    entities: {
        claim_type: string;
        claim_value: string;
        confidence: number;
    }[];
    discrepancies: {
        title: string;
        description: string;
        severity: 'low' | 'medium' | 'high';
    }[];
}

function generateMockResult(documentTexts: string[]): ExtractionResult {
    // Extract some keywords from the document text for realistic-looking mock data
    const allText = documentTexts.join(' ').toLowerCase();
    const hasWine = allText.includes('wine') || allText.includes('varietal') || allText.includes('vintage');
    const hasOil = allText.includes('oil') || allText.includes('olive');

    const productType = hasWine ? 'wine' : hasOil ? 'olive oil' : 'agricultural product';

    return {
        summary: `[MOCK] Analysis of ${documentTexts.length} document(s) related to ${productType} origin claims. The documents contain various provenance assertions including producer identity, geographic origin, and production dates. This is a simulated analysis for local development - connect an OpenAI API key for real AI-powered extraction.`,
        entities: [
            { claim_type: 'producer_name', claim_value: 'Example Producer Co.', confidence: 0.92 },
            { claim_type: 'pdo_region', claim_value: 'Kakheti, Georgia', confidence: 0.88 },
            { claim_type: 'varietal', claim_value: 'Saperavi', confidence: 0.85 },
            { claim_type: 'bottling_date', claim_value: '2024-03-15', confidence: 0.78 },
            { claim_type: 'batch_id', claim_value: 'BATCH-2024-0042', confidence: 0.95 },
            { claim_type: 'harvest_year', claim_value: '2023', confidence: 0.90 },
        ],
        discrepancies: documentTexts.length > 1 ? [
            {
                title: 'Bottling date inconsistency',
                description: 'Document 1 states bottling date as March 2024, while Document 2 references February 2024. A one-month discrepancy may indicate a clerical error or a mismatch between production and certification records.',
                severity: 'medium',
            },
            {
                title: 'Missing PDO certification reference',
                description: 'The export declaration (Document 2) does not include a PDO/GI certification number, which is typically required for products claiming protected designation of origin.',
                severity: 'high',
            },
        ] : [
            {
                title: 'Single document - no cross-reference possible',
                description: 'Only one document was provided. Upload additional documents (certificates, labels, export records) to enable cross-document discrepancy detection.',
                severity: 'low',
            },
        ],
    };
}

export async function processWatchCaseDocuments(documentTexts: string[]): Promise<ExtractionResult> {
    if (shouldUseMockAi()) {
        console.log('[Watch] No OPENAI_API_KEY set - using mock AI analysis');
        // Simulate a short delay like a real API call
        await new Promise((r) => setTimeout(r, 800));
        return generateMockResult(documentTexts);
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const combinedText = documentTexts.map((text, i) => `--- Document ${i + 1} ---\n${text}`).join('\n\n');

    const systemPrompt = `
    You are an AI transparency engine for agricultural origin claims (Terroir Watch).
    Your task is to analyze the provided documents (certificates, labels, JSON records).

    1. Summarize what these documents claim (e.g., origin, varietals, dates).
    2. Extract key entities (producer name, bottling date, PDO region, varietal, batch identifiers).
    3. Identify any logical discrepancies, missing fields, or mismatches between the documents.

    Respond in strict JSON format matching this schema:
    {
      "summary": "Plain language summary of the claims",
      "entities": [
        { "claim_type": "string", "claim_value": "string", "confidence": 0.0 to 1.0 }
      ],
      "discrepancies": [
        { "title": "string", "description": "string", "severity": "low|medium|high" }
      ]
    }
  `;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze the following documents:\n\n${combinedText}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
    });

    const resultText = response.choices[0].message.content || '{}';
    return JSON.parse(resultText) as ExtractionResult;
}
