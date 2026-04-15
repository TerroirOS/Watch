'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCasePage() {
    const router = useRouter();
    const [files, setFiles] = useState<File[]>([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) {
            setError('Please upload at least one document.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        files.forEach(file => formData.append('documents', file));

        try {
            const res = await fetch('/api/cases/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            // Redirect to the newly created case report page
            router.push(`/cases/${data.caseId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ padding: '80px 0' }}>
      <header style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>Open a New Case</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.2rem', maxWidth: '600px' }}>
          Upload certificates, lab reports, export declarations, or product labels to cross-check origin claims against institutional records.
        </p>
      </header>

      <main>
        <form onSubmit={handleSubmit} style={{
          background: 'var(--color-bg-secondary)',
          padding: '40px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          maxWidth: '800px'
        }}>
          
          {error && (
            <div style={{ padding: '16px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 'var(--radius-sm)', marginBottom: '24px' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="title" style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Case Title</label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Saperavi 2024 Origin Check"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: '1rem',
                fontFamily: 'var(--font-sans)'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="description" style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Description & Context</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide background on why you are uploading these documents."
              rows={4}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: '1rem',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Upload Evidence Documents</label>
            <div style={{
              border: '2px dashed var(--color-accent-gold)',
              padding: '40px',
              textAlign: 'center',
              borderRadius: 'var(--radius-md)',
              background: '#FFFFFF',
              cursor: 'pointer'
            }}>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                accept=".pdf, .json, image/*"
                style={{ marginBottom: '16px' }}
              />
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Accepts PDF, JSON, and Image files.
              </p>
              {files.length > 0 && (
                <div style={{ marginTop: '16px', textAlign: 'left' }}>
                  <strong>Selected Files:</strong>
                  <ul style={{ paddingLeft: '20px', marginTop: '8px', fontSize: '0.9rem' }}>
                    {files.map((file, i) => (
                      <li key={i}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 32px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent-green)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '1rem',
              width: '100%',
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? 'not-allowed' : 'pointer'
            }}
          >
            {isSubmitting ? 'Processing Documents...' : 'Analyze Case'}
          </button>
        </form>
      </main>
    </div>
  );
}
