import { useEffect, useRef, useState } from 'react';
import { EMPTY_STATS, type Preferences, type SceneControls } from '../game/bridge';

function readPreferences(): Preferences {
  const defaults = { muted: false, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  try { const value = JSON.parse(localStorage.getItem('my-destroy:preferences') ?? '{}'); return { muted: typeof value.muted === 'boolean' ? value.muted : defaults.muted, reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : defaults.reducedMotion }; }
  catch { return defaults; }
}

function Icon({ name }: { name: 'sound' | 'muted' | 'reset' | 'pause' | 'play' | 'effects' | 'cross' }) {
  const paths = {
    sound: <><path d="M3 9h4l5-4v14l-5-4H3z" /><path d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" /></>,
    muted: <><path d="M3 9h4l5-4v14l-5-4H3z" /><path d="m17 9 5 6m0-6-5 6" /></>,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m8 4 12 8-12 8z" />,
    effects: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" /></>,
    cross: <><path d="M12 3v5m0 8v5M3 12h5m8 0h5" /><circle cx="12" cy="12" r="5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter">{paths[name]}</svg>;
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<SceneControls | null>(null);
  const [prefs, setPrefs] = useState(readPreferences);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const [stats, setStats] = useState(EMPTY_STATS);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    Promise.all([import('../game/createGame'), document.fonts.load('16px Pixelify')]).then(([module]) => {
      if (cancelled || !host.current) return;
      const instance = module.createGame(host.current, prefsRef.current, {
        update: value => { if (!cancelled) setStats(value); },
        toggleMute: () => setPrefs(p => ({ ...p, muted: !p.muted })),
      });
      controls.current = instance.controls; destroy = instance.destroy;
    }).catch(() => { if (!cancelled) setError('No pudimos preparar la escena. Vuelve a cargar para intentarlo de nuevo.'); });
    return () => { cancelled = true; controls.current = null; destroy?.(); clearTimeout(resetTimer.current); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('my-destroy:preferences', JSON.stringify(prefs)); } catch { /* Session preferences still work. */ }
    controls.current?.preferences(prefs);
  }, [prefs]);

  function reset() {
    controls.current?.reset(); controls.current?.focus(); setResetMessage('Página restaurada. Empieza otra vez.');
    clearTimeout(resetTimer.current); resetTimer.current = setTimeout(() => setResetMessage(''), 2400);
  }
  function resume() { controls.current?.pause(false); controls.current?.focus(); }

  return <main>
    <header className="topbar">
      <a className="brand" href="/" aria-label="My-Destroy, inicio"><span className="brand-mark">✦</span>my-destroy<span className="brand-dot">.</span></a>
      <div className="edition"><span className="status-dot" /> LABORATORIO DE DEMOLICIÓN <span className="edition-number">VOL. 001</span></div>
    </header>

    <section className="intro" aria-labelledby="title">
      <div><p className="eyebrow"><span /> UN PEQUEÑO ACTO DE DESTRUCCIÓN</p><h1 id="title">Rompe la página.<br /><span>Descubre otro mundo.</span></h1></div>
      <div className="intro-aside"><span className="aside-number">01 /</span><p>Todo parece estar en su sitio.<br />Apunta. Dispara. Mira al otro lado.</p><span className="local-note">ESCENA LOCAL · MUNICIÓN INFINITA</span></div>
    </section>

    <section className="game-shell" aria-label="Primera escena jugable">
      <div className="browser-bar">
        <div className="page-address"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>the-everyday-internet<span className="address-suffix">.demo</span></span><span className="fixture-tag">PÁGINA FICTICIA</span></div>
        <div className="damage-readout"><span>DESTRUCCIÓN</span><strong data-testid="percent">{stats.percent.toFixed(1)}<small>%</small></strong><div className="meter" role="progressbar" aria-label="Área destructible destruida" aria-valuenow={Number(stats.percent.toFixed(1))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${stats.percent}%` }} /></div></div>
      </div>
      <div className={`stage ${stats.paused ? 'is-paused' : ''}`}>
        <div ref={host} className="game-host" data-testid="game-host" />
        {!stats.ready && <div className="stage-overlay"><span className="overlay-symbol">✦</span><h2>{error ? 'Algo no salió bien' : 'Preparando el otro lado…'}</h2><p>{error || 'Construyendo tu pequeña zona de destrucción.'}</p>{error && <button onClick={() => location.reload()}>Volver a cargar</button>}</div>}
        {stats.ready && stats.paused && <div className="stage-overlay paused-overlay"><span className="overlay-symbol">Ⅱ</span><p className="eyebrow">TÓMATE UN RESPIRO</p><h2>El caos puede esperar.</h2><button className="primary-button" onClick={resume}><Icon name="play" />Continuar</button><p className="pause-note">Tu página sigue como la dejaste.</p></div>}
        {stats.ready && !stats.paused && stats.shots === 0 && <div className="first-shot-hint" aria-hidden="true"><Icon name="cross" /><span>El primer disparo es tuyo.</span></div>}
        <div className={`restore-toast ${resetMessage ? 'visible' : ''}`} role="status">{resetMessage}</div>
      </div>

      <div className="control-deck">
        <div className="weapon"><span className="weapon-key">01</span><svg className="pistol-icon" viewBox="0 0 48 32" aria-hidden="true"><path fill="currentColor" d="M5 5h32v3h7v10H23v3h-4v10H9V20H5z" /><path fill="#79e3d8" d="M14 9h22v3H14z" /><path fill="#101923" d="M12 21h4v6h-4z" /></svg><div><strong>Pistola</strong><span>SEMIAUTOMÁTICA</span></div><span className="infinite" title="Munición infinita">∞</span></div>
        <div className="shortcuts"><span><kbd>A</kbd><kbd>D</kbd> Mover</span><span><Icon name="cross" /> Apuntar y disparar</span></div>
        <div className="game-actions"><button className="icon-button" onClick={() => controls.current?.pause(!stats.paused)} disabled={!stats.ready} aria-label={stats.paused ? 'Continuar' : 'Pausar'} title="Pausa · Escape"><Icon name={stats.paused ? 'play' : 'pause'} /></button><button className="reset-button" onClick={reset} disabled={!stats.ready}><Icon name="reset" /><span>Reiniciar</span><kbd>R</kbd></button></div>
      </div>
    </section>

    <div className="below-scene">
      <p className="session-status" aria-live="polite"><span className="status-dot" />{stats.shots ? `${stats.shots} disparos · ${stats.hits} impactos` : 'Todo listo para hacer un poco de ruido.'}</p>
      <div className="preferences"><button aria-pressed={prefs.reducedMotion} onClick={() => setPrefs(p => ({ ...p, reducedMotion: !p.reducedMotion }))}><Icon name="effects" />Efectos suaves<span className={`toggle ${prefs.reducedMotion ? 'on' : ''}`} /></button><button aria-pressed={prefs.muted} onClick={() => setPrefs(p => ({ ...p, muted: !p.muted }))}><Icon name={prefs.muted ? 'muted' : 'sound'} />{prefs.muted ? 'Sonido apagado' : 'Sonido activado'}<kbd>M</kbd></button></div>
    </div>
    <p className="mobile-note">Esta primera escena se disfruta con ratón y teclado. Los controles táctiles llegarán más adelante.</p>

    <section className="field-notes" aria-label="Sobre la escena"><article><span className="note-index">01 — SUPERFICIE</span><h2>Una web reconocible.</h2><p>Texto, imágenes y un poco de orden. <br />Todo está esperando su primer agujero.</p></article><article><span className="note-index">02 — IMPACTO</span><h2>Cada disparo deja huella.</h2><p>Fragmentos de la página, un destello breve. <br />El daño se queda. Tú decides cuándo reiniciar.</p></article><article><span className="note-index cyan">03 — AL OTRO LADO</span><h2>Hay otro mundo debajo.</h2><p>Acero, circuitos y luces de emergencia. <br />Rompe la superficie para descubrirlo.</p></article></section>
    <footer><span>MY-DESTROY <span className="footer-cross">✦</span> HECHO PARA ROMPERSE.</span><a href="/reference/art-direction.html" target="_blank" rel="noreferrer">Ver dirección visual original ↗</a><span>PROTOTIPO 0.1 / ESCENA LOCAL</span></footer>
  </main>;
}
