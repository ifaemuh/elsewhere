import { headers } from 'next/headers';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

export default async function MobileTestPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3002';
  const hostname = host.split(':')[0];
  const apiUrl = `http://${host}`;
  const expoUrl = `exp://${hostname}:8081`;

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>Elsewhere Dev Harness</p>
        <h1 style={styles.title}>Mobile Preview Test</h1>
        <p style={styles.copy}>
          Use this page from your phone after running the mobile preview launcher script.
        </p>

        <div style={styles.status}>
          <div>
            <div style={styles.label}>API</div>
            <a href={`${apiUrl}/api/v1/health`} style={styles.link}>
              {apiUrl}
            </a>
          </div>
          <div>
            <div style={styles.label}>Expo Go</div>
            <a href={expoUrl} style={styles.link}>
              {expoUrl}
            </a>
          </div>
        </div>

        <a href={expoUrl} style={styles.button}>
          Open in Expo Go
        </a>

        <ol style={styles.steps}>
          <li>Confirm Discover says API connected.</li>
          <li>Pick a destination.</li>
          <li>Capture a clear selfie.</li>
          <li>Accept likeness consent.</li>
          <li>Generate a personalized preview.</li>
          <li>Judge whether the result looks like you and feels shareable.</li>
        </ol>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: '100vh',
    margin: 0,
    padding: 20,
    background: '#050505',
    color: '#fff',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 22,
    background: 'rgba(255,255,255,0.04)',
  },
  eyebrow: {
    margin: 0,
    color: '#f8c86b',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    margin: '8px 0 0',
    fontSize: 34,
    lineHeight: 1,
  },
  copy: {
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
  },
  status: {
    display: 'grid',
    gap: 12,
    margin: '22px 0',
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  link: {
    color: '#9ee7ff',
    overflowWrap: 'anywhere',
  },
  button: {
    display: 'block',
    marginTop: 18,
    padding: '15px 18px',
    borderRadius: 12,
    background: '#fff',
    color: '#050505',
    textAlign: 'center',
    textDecoration: 'none',
    fontWeight: 800,
  },
  steps: {
    margin: '22px 0 0',
    paddingLeft: 22,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 1.65,
  },
};
