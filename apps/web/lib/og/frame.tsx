/** Layout for 1200x630 link previews. Satori supports flexbox only, so every multi-child div sets display: flex. */
export function OgFrame({ characterSrc, eyebrow, title, footer }: { characterSrc: string; eyebrow: string; title: string; footer?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: '#faf8f1', padding: 56 }}>
      <img src={characterSrc} width={300} height={450} style={{ objectFit: 'contain' }} />
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 48, flex: 1 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: '#b4532a' }}>{eyebrow.toUpperCase()}</div>
        <div style={{ fontSize: title.length > 70 ? 50 : 62, fontWeight: 800, lineHeight: 1.1, marginTop: 16, color: '#2f3a2c' }}>{title}</div>
        {footer ? <div style={{ fontSize: 28, marginTop: 24, color: '#4b5745' }}>{footer}</div> : null}
      </div>
    </div>
  );
}
