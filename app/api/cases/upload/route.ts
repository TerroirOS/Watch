import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processWatchCaseDocuments } from '@/lib/openai';
import { PDFParse } from 'pdf-parse';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('documents') as File[];
        const title = formData.get('title') as string || 'New Watch Case';
        const description = formData.get('description') as string || '';

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        // 1. Create Case (ai_summary added after analysis)
        const caseResult = await db.query(
            'INSERT INTO cases (title, description) VALUES ($1, $2) RETURNING id',
            [title, description]
        );
        const caseId = caseResult.rows[0].id;

        const documentTexts: string[] = [];
        const documentIds: string[] = [];

        // 2. Process Files & Create Document Records
        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            let extractedText = '';

            if (file.type === 'application/pdf') {
                const parser = new PDFParse({ data: buffer });
                const result = await parser.getText();
                extractedText = result.text;
            } else if (file.type === 'application/json') {
                extractedText = buffer.toString('utf-8');
            } else {
                // Fallback or skip for images if OCR isn't set up yet
                extractedText = `[Unparsable file type: ${file.type}]`;
      }

      documentTexts.push(extractedText);

      // In a real app, upload buffer to S3/Supabase Storage and get URL
      const dummyUrl = `/uploads/${caseId}/${file.name}`;

      const docResult = await db.query(
        'INSERT INTO documents (case_id, filename, file_url, file_type, extracted_text) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [caseId, file.name, dummyUrl, file.type, extractedText]
      );
      documentIds.push(docResult.rows[0].id);
    }

    // 3. AI Extraction & Summarization
    const aiResult = await processWatchCaseDocuments(documentTexts);

    // 3b. Persist AI summary back to the case record
    await db.query(
      'UPDATE cases SET ai_summary = $1 WHERE id = $2',
      [aiResult.summary, caseId]
    );

    // 4. Save Extracted Entities
    for (const entity of aiResult.entities) {
      // Simplification: attributing to first document for MVP
      const docId = documentIds[0] || null;
      await db.query(
        'INSERT INTO extracted_claims (case_id, document_id, claim_type, claim_value, confidence_score) VALUES ($1, $2, $3, $4, $5)',
        [caseId, docId, entity.claim_type, entity.claim_value, entity.confidence]
      );
    }

    // 5. Save Discrepancies
    for (const disc of aiResult.discrepancies) {
      await db.query(
        'INSERT INTO discrepancies (case_id, title, plain_language_summary, severity) VALUES ($1, $2, $3, $4)',
        [caseId, disc.title, disc.description, disc.severity || 'medium']
      );
    }

    return NextResponse.json({ success: true, caseId });
  } catch (error: any) {
    console.error('Error processing upload:', error);
    return NextResponse.json({ error: error.message || 'Failed to process files' }, { status: 500 });
  }
}
