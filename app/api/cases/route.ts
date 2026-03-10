import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const result = await db.query(`
            SELECT
                c.id,
                c.title,
                c.description,
                c.status,
                c.created_at,
                COUNT(DISTINCT d.id) AS document_count,
                COUNT(DISTINCT disc.id) AS discrepancy_count
            FROM cases c
            LEFT JOIN documents d ON d.case_id = c.id
            LEFT JOIN discrepancies disc ON disc.case_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);
        return NextResponse.json({ cases: result.rows });
    } catch (error: any) {
        console.error('Error fetching cases:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch cases' }, { status: 500 });
    }
}
