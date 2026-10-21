/**
 * ABOUT — an editorial long-read: the platform, the concept, honesty notes, live integration
 * status, maintained activity, credits & licences, content counts and the accessibility
 * statement. Every number and credit on this page is derived from the catalogue or the server.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ActivityItem, ExternalAvailability, Programme } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { api } from '../../lib/api.ts';
import { dateLabel, FOOTAGE_LABEL, plural, PROVENANCE_LABEL } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { refreshSession, useSession } from '../../state/session.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Pulse } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import { SECTIONS } from '../../../shared/sections.ts';
import type { IconName } from '../../ui/Icon.tsx';
import { BILLING_LABEL } from '../membership/status.ts';
import { artStatus, contentCounts, creditsFrom, FOOTAGE_NOTE, FOOTAGE_ORDER, footageCounts, PROVENANCE_ORDER, provenanceCounts, safeHttpUrl } from './data.ts';
import './about.css';

const CHAPTERS = [
  { id: 'about-concept', label: 'The concept' },
  { id: 'about-map', label: 'Finding your way' },
  { id: 'about-honesty', label: 'Honesty notes' },
  { id: 'about-integrations', label: 'Integrations' },
  { id: 'about-activity', label: 'Activity' },
  { id: 'about-credits', label: 'Credits' },
  { id: 'about-counts', label: 'In the catalogue' },
  { id: 'about-access', label: 'Accessibility' },
];

const STATUS_WORD: Record<Programme['status'], string> = {
  available: 'Available',
  announced: 'Announced',
  'in-development': 'In development',
  planned: 'Planned',
};

export default function AboutPage() {
  const cat = useCatalogue();
  useChapters(CHAPTERS);

  useEffect(() => {
    document.title = 'About · Monumental Streams';
    // Arriving at /about#section: the page mounts after the router, so scroll once it exists.
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, []);

  const gateway = cat.places.find((p) => p.gateway);
  const heroArt = cat.artFor('art:living-membrane');

  return (
    <div className="page about">
      <header className="about-hero">
        <div className="about-backdrop" aria-hidden="true">
          <Art art="art:living-membrane" alt="" sizes="large" eager className="about-backdrop-art" />
          <span className="about-backdrop-shade" />
          {heroArt?.provisional ? <span className="about-art-note">Provisional art · studio concept loop</span> : null}
        </div>
        <div className="wrap about-hero-inner">
          <p className="kicker">About</p>
          <h1 className="page-title about-title">
            Stream the <em>world</em>.
          </h1>
          <p className="about-lines">
            <span>Explore what you love. Discover where it lives.</span>
            <span>All lives. All stories. One platform.</span>
          </p>
          <p className="page-lede">
            A streaming and cultural-discovery platform. Watch stories, then follow the connections they open — across people, places, disciplines, movements and
            time.{gateway ? ` ${gateway.name} is the launch gateway.` : ''}
          </p>
        </div>
      </header>

      <div className="wrap about-body">
        <Section id="about-concept" kicker="The concept" title={<>A living <em>cultural machine</em></>}>
          <div className="about-columns">
            <p>
              Every story is an image that wakes when you reach for it &mdash; a preview loop stirs on hover or focus &mdash; and the links between stories are
              explained Connections that carry you from one place, person or era to the next. World places each story on a living globe; Time Machine places it
              in the decade it happens.
            </p>
            <p>
              The system breathes with you: calm while you browse, stepping back while a programme plays, so the story always comes first. Nothing here is
              decoration for its own sake: every connection is explained, every label says what something is, and the platform grows as the catalogue does.
            </p>
          </div>
        </Section>

        <Wayfinding />

        <Honesty />
        <Integrations />
        <Activity />
        <Credits />
        <Counts />
        <AccessStatement />
      </div>
    </div>
  );
}

/* ───────────── Section frame: heading in the left rail, the read on the right ───────────── */

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="about-section" aria-labelledby={`${id}-h`}>
      <header className="about-sec-head">
        <p className="kicker">{kicker}</p>
        <h2 id={`${id}-h`} className="about-h2">
          {title}
        </h2>
      </header>
      <div className="about-sec-body">{children}</div>
    </section>
  );
}

/* ───────────── Finding your way: every destination, from the navigation itself ───────────── */

const UTILITIES: { icon: IconName; label: string; to: string; what: string }[] = [
  { icon: 'search', label: 'Search', to: '/search', what: 'Every story, place, person, period and movement. Press / anywhere to start typing.' },
  { icon: 'settings', label: 'Settings', to: '/my-world?tab=settings', what: 'Sound, motion, preview loops, captions and playback — kept in My World.' },
  { icon: 'user', label: 'Profile', to: '/account', what: 'Sign in, create an account, membership and sync.' },
];

function Wayfinding() {
  return (
    <Section id="about-map" kicker="The navigation" title={<>Finding your <em>way</em></>}>
      <p className="about-lede">
        {SECTIONS.length} destinations, always in the same order, plus three tools that are there wherever you are. Each one has a single purpose.
      </p>
      <ol className="about-map">
        {SECTIONS.map((s, i) => (
          <li key={s.id} className="about-map-item">
            <span className="about-map-n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="about-map-icon" aria-hidden="true">
              <Icon name={s.icon as IconName} size={18} />
            </span>
            <div className="about-map-body">
              <h3 className="about-h3">
                <Link to={s.path}>{s.label}</Link>
              </h3>
              <p className="muted">{s.promise}</p>
            </div>
          </li>
        ))}
      </ol>
      <ul className="about-utils" aria-label="Tools">
        {UTILITIES.map((u) => (
          <li key={u.label}>
            <Icon name={u.icon} size={18} />
            <div>
              <h3 className="about-h3">
                <Link to={u.to}>{u.label}</Link>
              </h3>
              <p className="muted">{u.what}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ───────────── Honesty ───────────── */

function Honesty() {
  const cat = useCatalogue();
  const prov = useMemo(() => provenanceCounts(cat), [cat]);
  const foot = useMemo(() => footageCounts(cat), [cat]);
  const art = useMemo(() => artStatus(cat), [cat]);
  const originals = cat.programmes.filter((p) => p.original);
  const playableOriginals = cat.videos.filter((v) => v.provenance === 'monumental-original' && cat.isPlayable(v)).length;
  const plans = cat.payload.content.membership.plans;
  const provisionalPrices = plans.filter((p) => p.provisional).length;

  return (
    <Section id="about-honesty" kicker="Honesty notes" title={<>What is real, what is <em>demonstration</em></>}>
      <p className="about-lede">
        This is a preview build. {playableOriginals ? plural(playableOriginals, 'Monumental Original is', 'Monumental Originals are') + ' playable today.' : 'No Monumental Original episodes are published yet.'}{' '}
        Everything playable is labelled with where it comes from and what kind of footage it is.
      </p>

      <div className="about-grid-2">
        <div className="about-card">
          <h3 className="about-h3">Monumental Originals</h3>
          {originals.length ? (
            <ul className="about-list">
              {originals.map((p) => (
                <li key={p.id}>
                  <div className="about-row">
                    <Link to={cat.href(p.id)} className="about-link-strong">
                      {p.title}
                    </Link>
                    <span className={`badge ${p.status === 'available' ? 'badge-free' : 'badge-planned'}`}>{STATUS_WORD[p.status]}</span>
                  </div>
                  <p className="muted">{p.statusNote}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No Original programmes are listed yet.</p>
          )}
        </div>

        <div className="about-card">
          <h3 className="about-h3">Where each video comes from</h3>
          <ul className="about-list about-tally-list">
            {PROVENANCE_ORDER.map((k) => (
              <li key={k} className="about-row">
                <span>{PROVENANCE_LABEL[k]}</span>
                <span className="about-count">{prov[k] ?? 0}</span>
              </li>
            ))}
          </ul>
          <p className="muted about-small">
            Demonstration media stands in while Originals are made: studio motion concepts, public-domain archive films and Creative Commons films, each credited
            below where a credit applies.
          </p>
        </div>

        <div className="about-card">
          <h3 className="about-h3">Footage labels</h3>
          <dl className="about-legend">
            {FOOTAGE_ORDER.map((k) => (
              <div key={k}>
                <dt>
                  <span className={`badge badge-footage badge-f-${k}`}>{FOOTAGE_LABEL[k]}</span>
                  <span className="about-count">{plural(foot[k] ?? 0, 'video')}</span>
                </dt>
                <dd className="muted">{FOOTAGE_NOTE[k]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="about-card">
          <h3 className="about-h3">Provisional art &amp; prices</h3>
          <p>
            <b className="about-num">{art.provisional}</b> of {plural(art.total, 'artwork')} {art.provisional === 1 ? 'is' : 'are'} provisional — studio motion loops
            standing in until approved imagery replaces them. They carry a &ldquo;Provisional art&rdquo; label.
          </p>
          <p>
            {provisionalPrices
              ? `${plural(provisionalPrices, 'membership price is a development example', 'membership prices are development examples')} — pricing is not approved.`
              : 'Membership prices are approved.'}{' '}
            <Link to="/membership">See membership</Link>.
          </p>
          <p className="muted about-small">Places marked &ldquo;expanding&rdquo; are mapped so World can grow; they have no stories yet.</p>
        </div>
      </div>
    </Section>
  );
}

/* ───────────── Integrations ───────────── */

const INTEGRATION_WORD = { connected: 'Connected', 'not-configured': 'Not configured', 'not-connected': 'Not connected' } as const;

function Integrations() {
  const { config, status } = useSession();
  return (
    <Section id="about-integrations" kicker="Live from the server" title={<>What is <em>wired in</em></>}>
      {!config ? (
        status === 'offline' ? (
          <p className="notice about-notice-attn">
            <Icon name="info" size={18} />
            <span>
              The server couldn&rsquo;t be reached, so integration status is unknown.{' '}
              <button type="button" className="about-inline-btn" onClick={() => void refreshSession()}>
                Try again
              </button>
            </span>
          </p>
        ) : (
          <Pulse label="Reading the server" />
        )
      ) : (
        <>
          <dl className="about-systems">
            <div>
              <dt className="about-label">Payments</dt>
              <dd>{BILLING_LABEL[config.billing.mode]}</dd>
            </div>
            <div>
              <dt className="about-label">Library sync</dt>
              <dd>{config.sync.mode === 'server' ? 'Accounts sync to the Monumental server · guests keep a library in their browser' : config.sync.mode}</dd>
            </div>
            <div>
              <dt className="about-label">Environment</dt>
              <dd>
                {config.environment === 'development' ? 'Development' : 'Production'}
                {config.billing.devPreviewEnabled && config.environment === 'development' ? ' · membership dev preview on' : ''}
              </dd>
            </div>
          </dl>
          <ul className="about-integrations">
            {config.integrations.map((i) => (
              <li key={i.id} className={`about-int about-int-${i.status}`}>
                <div className="about-row">
                  <h3 className="about-h3">{i.name}</h3>
                  <span className="about-int-status">
                    <span className="about-int-dot" aria-hidden="true" />
                    {INTEGRATION_WORD[i.status]}
                  </span>
                </div>
                <p className="muted">{i.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/* ───────────── Activity ───────────── */

function Activity() {
  const cat = useCatalogue();
  const [state, setState] = useState<{ phase: 'loading' | 'ready' | 'error'; items: ActivityItem[]; external: ExternalAvailability[] }>({
    phase: 'loading',
    items: [],
    external: [],
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, phase: 'loading' }));
    api<{ items: ActivityItem[]; external: ExternalAvailability[] }>('/api/activity', { signal: ctl.signal })
      .then((r) => setState({ phase: 'ready', items: r.items ?? [], external: r.external ?? [] }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ phase: 'error', items: [], external: [] });
      });
    return () => ctl.abort();
  }, [attempt]);

  return (
    <Section id="about-activity" kicker="Maintained data only" title={<>What is <em>happening</em></>}>
      <div aria-live="polite">
        {state.phase === 'loading' ? (
          <Pulse label="Checking the activity feed" />
        ) : state.phase === 'error' ? (
          <p className="notice about-notice-attn">
            <Icon name="info" size={18} />
            <span>
              The activity feed couldn&rsquo;t be loaded.{' '}
              <button type="button" className="about-inline-btn" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </span>
          </p>
        ) : state.items.length ? (
          <ul className="about-activity">
            {state.items.map((a) => {
              const url = safeHttpUrl(a.url);
              return (
                <li key={a.id} className="about-card">
                  <p className="about-meta">
                    <span className="about-meta-kind">{a.kind}</span>
                    {a.place ? ` · ${cat.label(a.place)}` : ''}
                    {a.starts ? ` · ${dateLabel(a.starts)}${a.ends ? ` – ${dateLabel(a.ends)}` : ''}` : ''}
                  </p>
                  <h3 className="about-h3">{url ? <a href={url} rel="noopener noreferrer" target="_blank">{a.title}</a> : a.title}</h3>
                  <p className="muted">{a.summary}</p>
                  <p className="about-small about-dim">
                    Source: {a.source} · verified {dateLabel(a.verifiedAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="about-empty">
            <Icon name="wave" size={20} />
            <span>
              No maintained activity is in date, so nothing is shown &mdash; Monumental never invents events or live conditions. <Link to="/live">Live</Link> shows
              what is actually scheduled.
            </span>
          </p>
        )}
        {state.phase === 'ready' && state.external.length ? (
          <div className="about-sub">
            <h3 className="about-h3">Also available elsewhere</h3>
            <ul className="about-list">
              {state.external.map((x) => {
                const url = safeHttpUrl(x.url);
                return (
                  <li key={`${x.video}-${x.service}`} className="about-row">
                    <Link to={cat.href(x.video)}>{cat.label(x.video)}</Link>
                    <span className="muted">
                      {url ? (
                        <a href={url} rel="noopener noreferrer" target="_blank">
                          {x.service}
                        </a>
                      ) : (
                        x.service
                      )}{' '}
                      · verified {dateLabel(x.verifiedAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ───────────── Credits: a clean table ───────────── */

function Credits() {
  const cat = useCatalogue();
  const credits = useMemo(() => creditsFrom(cat), [cat]);
  return (
    <Section id="about-credits" kicker="From the catalogue" title={<>Whose <em>work</em> this is</>}>
      {credits.length ? (
        <>
          <p className="about-lede">{plural(credits.length, 'credited work')}. Attribution is reproduced exactly as the licence requires.</p>
          {/* explicit roles keep the table semantics when phones restack the rows */}
          <table className="about-credits" role="table">
            <caption className="sr-only">Credits and licences</caption>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  Work
                </th>
                <th scope="col" role="columnheader">
                  Licence
                </th>
                <th scope="col" role="columnheader">
                  Attribution
                </th>
                <th scope="col" role="columnheader">
                  Source
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {credits.map(({ video, credit }) => {
                const url = safeHttpUrl(credit.sourceUrl);
                return (
                  <tr key={video.id} role="row">
                    <th scope="row" role="rowheader" className="about-credit-work">
                      <Link to={cat.href(video.id)}>{video.title}</Link>
                      {video.made ? <span className="about-made">{video.made}</span> : null}
                    </th>
                    <td role="cell" data-label="Licence">
                      {credit.licence}
                    </td>
                    <td role="cell" data-label="Attribution" className="about-attrib">
                      {credit.attribution}
                    </td>
                    <td role="cell" data-label="Source">
                      {credit.sourceUrl ? (
                        url ? (
                          <a href={url} rel="noopener noreferrer" target="_blank" className="about-source">
                            {new URL(url).host}
                            <Icon name="link" size={14} />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        ) : (
                          credit.sourceUrl
                        )
                      ) : (
                        <span className="about-dim">Not listed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="about-empty">
          <Icon name="info" size={20} />
          <span>No third-party works with credits are in the catalogue yet. Studio concept loops are Monumental&rsquo;s own work.</span>
        </p>
      )}
      <p className="muted about-small about-fonts">Typefaces: Archivo and Archivo Expanded, with JetBrains Mono for timecodes, all under the SIL Open Font License.</p>
    </Section>
  );
}

/* ───────────── Counts ───────────── */

function Counts() {
  const cat = useCatalogue();
  const rows = useMemo(() => contentCounts(cat), [cat]);
  return (
    <Section id="about-counts" kicker="Counted right now" title={<>In the <em>catalogue</em></>}>
      <dl className="about-counts">
        {rows.map((r) => (
          <div key={r.key} className="about-tally">
            <dt className="about-label">{r.label}</dt>
            <dd>
              <span className="about-tally-n">{r.value}</span>
              {r.detail ? <span className="about-tally-d">{r.detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="muted about-small">
        Catalogue version <code className="about-code">{cat.version.slice(0, 12)}</code>. These numbers change as stories are added.
      </p>
    </Section>
  );
}

/* ───────────── Accessibility ───────────── */

const KEYS: { keys: string[]; action: string }[] = [
  { keys: ['/'], action: 'Jump to search from anywhere (except while typing)' },
  { keys: ['Tab', 'Shift + Tab'], action: 'Move between controls — the first stop is “Skip to content”' },
  { keys: ['Enter', 'Space'], action: 'Activate links, buttons, chips and switches' },
  { keys: ['←', '→'], action: 'Move within tabs and segmented choices' },
  { keys: ['Esc'], action: 'Close dialogs, menus and the sound panel' },
];

const PLAYER_KEYS: { keys: string[]; action: string }[] = [
  { keys: ['Space', 'K'], action: 'Play or pause' },
  { keys: ['J', 'L'], action: 'Back or forward 10 seconds' },
  { keys: ['←', '→'], action: 'Back or forward 5 seconds' },
  { keys: ['↑', '↓'], action: 'Volume up or down' },
  { keys: ['M'], action: 'Mute' },
  { keys: ['C'], action: 'Captions on or off' },
  { keys: ['F'], action: 'Fullscreen' },
  { keys: ['I'], action: 'Picture-in-picture' },
  { keys: ['<', '>'], action: 'Slower or faster' },
  { keys: ['0–9'], action: 'Jump to 0–90%' },
  { keys: ['?'], action: 'Show all shortcuts' },
];

function KeyTable({ caption, rows }: { caption: string; rows: typeof KEYS }) {
  return (
    <table className="about-keys">
      <caption className="about-h3">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Keys</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.action}>
            <td>
              {r.keys.map((k, i) => (
                <span key={k}>
                  {i ? <span className="muted"> or </span> : null}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </td>
            <td>{r.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccessStatement() {
  return (
    <Section id="about-access" kicker="Accessibility statement" title={<>Built to be <em>used</em></>}>
      <ul className="about-points">
        <li>
          <b>Keyboard first.</b> Everything works without a mouse, focus is always visible, and dialogs trap and return focus.
        </li>
        <li>
          <b>Reduced motion.</b> Your device&rsquo;s setting is followed by default; you can force reduced or full motion in <Link to="/my-world?tab=settings">Settings</Link>.
          Reduced motion stills every transition and stops preview loops from playing on their own.
        </li>
        <li>
          <b>Sound is off by default.</b> Nothing plays until you switch it on, levels are adjustable, and every feature works in silence.
        </li>
        <li>
          <b>Native cursor option.</b> The organic cursor can be swapped for your system pointer; touch screens never show it.
        </li>
        <li>
          <b>Captions and previews.</b> Captions can be on by default at three sizes; preview loops can be limited to hover or switched off.
        </li>
        <li>
          <b>Real text.</b> Titles, labels and credits are real, selectable text, and controls are sized for touch.
        </li>
      </ul>
      <ButtonLink to="/my-world?tab=settings" icon="settings" className="about-access-btn">
        Open accessibility settings
      </ButtonLink>
      <div className="about-key-tables">
        <KeyTable caption="Everywhere" rows={KEYS} />
        <KeyTable caption="In the player" rows={PLAYER_KEYS} />
      </div>
    </Section>
  );
}
