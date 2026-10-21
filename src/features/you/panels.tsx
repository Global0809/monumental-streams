/** My World tab panels (everything except Settings). */
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import { activeInterests, activeJourneys, continueWatching, savedIds, savedPlaceIds, visibleHistory } from '../../../shared/library.ts';
import { becauseYouWatched, recommend } from '../../../shared/recommend.ts';
import type { HistoryEntry, ID, Journey, Library, Place, Video } from '../../../shared/types.ts';
import { dateLabel, plural, runtimeLabel, timecode } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { useSession } from '../../state/session.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, Chip, IconButton } from '../../ui/controls.tsx';
import { Dialog, EmptyState, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, SectionHeader, VideoPod } from '../../ui/Pod.tsx';
import { BILLING_LABEL, STATUS_LABEL } from '../membership/status.ts';
import { groupHistoryByDay, historyKey, idTail, journeyHref } from './helpers.ts';
import { dropPendingHistory, removeHistoryLater, usePendingHistory } from './pending.ts';

const asVideo = (cat: ReturnType<typeof useCatalogue>, id: ID) => (kindOf(id) === 'video' ? (cat.get(id) as Video | undefined) : undefined);
const asPlace = (cat: ReturnType<typeof useCatalogue>, id: ID) => (kindOf(id) === 'place' ? (cat.get(id) as Place | undefined) : undefined);

/* ───────────── Continue ───────────── */

export function ContinuePanel() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const items = continueWatching(lib).flatMap(({ video, entry }) => {
    const v = asVideo(cat, video);
    return v ? [{ v, entry }] : [];
  });

  const remove = (v: Video, pos: number, dur: number) => {
    libraryActions.clearProgress(v.id);
    sound.play('unsave');
    toast(`Removed “${v.title}” from Continue watching`, {
      tone: 'success',
      action: { label: 'Undo', run: () => libraryActions.setProgress(v.id, pos, dur) },
    });
  };

  return (
    <>
      <SectionHeader title="Pick up where you left off" id="you-continue-h">
        Stories you started and haven&rsquo;t finished, most recent first. Removing one keeps it in your history.
      </SectionHeader>
      {items.length ? (
        <ul className="grid-pods you-grid">
          {items.map(({ v, entry }) => (
            <li key={v.id}>
              <VideoPod
                video={v}
                footer={
                  <div className="you-pod-foot">
                    <p className="you-pod-progress">
                      <span>
                        <span className="you-tc">
                          {timecode(entry.pos)} / {timecode(entry.dur)}
                        </span>{' '}
                        · {runtimeLabel(Math.max(0, entry.dur - entry.pos))} left
                      </span>
                    </p>
                    <div className="you-pod-actions">
                      <ButtonLink
                        to={`${cat.href(v.id)}?t=${Math.floor(entry.pos)}`}
                        variant="chrome"
                        icon="play"
                        aria-label={`Resume ${v.title} at ${timecode(entry.pos)}`}
                        data-cursor="play"
                        data-cursor-label="Resume"
                      >
                        Resume
                      </ButtonLink>
                      <Button icon="close" variant="quiet" onClick={() => remove(v, entry.pos, entry.dur)} aria-label={`Remove ${v.title} from Continue watching`}>
                        Remove
                      </Button>
                    </div>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon="play"
          title="Nothing in progress"
          actions={
            <>
              <ButtonLink to="/catalogue" variant="chrome" icon="search">
                Browse the catalogue
              </ButtonLink>
              <ButtonLink to="/somewhere" icon="compass">
                Take me somewhere
              </ButtonLink>
            </>
          }
        >
          <p>Start any story and stop partway — it waits for you here.</p>
        </EmptyState>
      )}
    </>
  );
}

/* ───────────── Saved ───────────── */

export function SavedPanel({ onPlaces }: { onPlaces: () => void }) {
  const cat = useCatalogue();
  const lib = useLibrary();
  const videos = savedIds(lib).flatMap((id) => {
    const v = asVideo(cat, id);
    return v ? [v] : [];
  });
  const placeCount = savedPlaceIds(lib).filter((id) => asPlace(cat, id)).length;

  const unsaveVideo = (v: Video) => {
    libraryActions.toggleSave(v.id);
    sound.play('unsave');
    toast(`Removed “${v.title}” from saved`, { tone: 'success', action: { label: 'Undo', run: () => libraryActions.toggleSave(v.id) } });
  };

  return (
    <>
      <SectionHeader title="Saved stories" id="you-saved-h">
        {videos.length ? `${plural(videos.length, 'story', 'stories')}, most recently saved first.` : 'Use the bookmark on any story to keep it here.'}
      </SectionHeader>
      {videos.length ? (
        <ul className="grid-pods you-grid">
          {videos.map((v) => (
            <li key={v.id}>
              <VideoPod
                video={v}
                footer={
                  <div className="you-pod-foot">
                    <div className="you-pod-actions">
                      <Button icon="close" variant="quiet" onClick={() => unsaveVideo(v)} aria-label={`Remove ${v.title} from saved`}>
                        Remove
                      </Button>
                    </div>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="save" tone="aurum" title="No saved stories yet" actions={<ButtonLink to="/catalogue" variant="chrome" icon="search">Find something to save</ButtonLink>}>
          <p>Saved stories stay here until you remove them, and on every device once you have an account.</p>
        </EmptyState>
      )}
      {placeCount ? (
        <p className="you-foot-note">
          <Icon name="globe" size={16} />
          <span>
            You also saved {plural(placeCount, 'place')}.{' '}
            <button type="button" className="you-inline-btn" onClick={onPlaces}>
              Show places
            </button>
          </span>
        </p>
      ) : null}
    </>
  );
}

/* ───────────── Places: saved places and passport stamps ───────────── */

export function PlacesPanel() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const places = savedPlaceIds(lib).flatMap((id) => {
    const p = asPlace(cat, id);
    return p ? [p] : [];
  });
  const stamps = Object.entries(lib.stamps)
    .flatMap(([id, s]) => {
      const p = asPlace(cat, id);
      return p ? [{ p, s }] : [];
    })
    .sort((a, b) => b.s.at - a.s.at);

  const unsavePlace = (p: Place) => {
    libraryActions.toggleSavePlace(p.id);
    sound.play('unsave');
    toast(`Removed ${p.name} from saved places`, { tone: 'success', action: { label: 'Undo', run: () => libraryActions.toggleSavePlace(p.id) } });
  };

  return (
    <>
      <div className="you-sub">
        <SectionHeader title="Saved places" id="you-places-h">
          {places.length ? `${plural(places.length, 'place')}. Open one to return to it on the World globe, exactly where you left it.` : 'Save a place in World to return to it.'}
        </SectionHeader>
        {places.length ? (
          <ul className="you-cards">
            {places.map((p) => {
              const chain = cat
                .placeAncestors(p.id)
                .slice(0, 2)
                .map((a) => a.name)
                .join(' · ');
              const stories = cat.videosForPlace(p.id, true);
              const n = stories.length;
              return (
                <li key={p.id} className="you-card you-place">
                  <Art art={stories[0]?.art ?? 'art:living-atlas'} alt="" className="you-card-art" />
                  <div className="you-card-body">
                    <h3 className="you-card-title">
                      <Link to={cat.href(p.id)} data-cursor-label="World">
                        {p.name}
                      </Link>
                    </h3>
                    <p className="you-card-meta">
                      <span>{p.kind.replace('-', ' ')}</span>
                      {chain ? <span>{chain}</span> : null}
                      <span>{n ? plural(n, 'story', 'stories') : p.status === 'expanding' ? 'Expanding · no stories yet' : 'No stories yet'}</span>
                      {lib.stamps[p.id] ? <span className="you-stamped">Stamped</span> : null}
                    </p>
                  </div>
                  <div className="you-card-actions">
                    <ButtonLink to={cat.href(p.id)} icon="globe" aria-label={`Open ${p.name} in World`}>
                      World
                    </ButtonLink>
                    <ButtonLink to={`/synapse/place/${p.slug}`} variant="quiet" icon="synapse" aria-label={`Connections from ${p.name}`}>
                      Connections
                    </ButtonLink>
                    <IconButton icon="close" label={`Remove ${p.name} from saved places`} onClick={() => unsavePlace(p)} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="globe" title="No saved places yet" actions={<ButtonLink to="/world" variant="chrome" icon="globe">Explore World</ButtonLink>}>
            <p>Choose a place on the globe and press &ldquo;Save place&rdquo;. It appears here at once.</p>
          </EmptyState>
        )}
      </div>

      <div className="you-sub">
        <SectionHeader title="Passport stamps" id="you-stamps-h" action={<ButtonLink to="/passport" variant="quiet" icon="passport">Culture Passport</ButtonLink>}>
          {stamps.length
            ? `${plural(stamps.length, 'stamp')}. A place is stamped when you watch most of a story set there.`
            : 'Watch most of a story set in a place and the Culture Passport stamps it here.'}
        </SectionHeader>
        {stamps.length ? (
          <ul className="you-stamps">
            {stamps.map(({ p, s }) => {
              const v = asVideo(cat, s.video);
              return (
                <li key={p.id} className="you-stamp">
                  <span className="you-stamp-seal" aria-hidden="true">
                    <Icon name="passport" size={20} />
                  </span>
                  <div className="you-stamp-body">
                    <h3 className="you-stamp-place">
                      <Link to={cat.href(p.id)}>{p.name}</Link>
                    </h3>
                    <p className="you-card-meta">
                      <span>
                        Stamped <time dateTime={new Date(s.at).toISOString()}>{dateLabel(new Date(s.at).toISOString())}</time>
                      </span>
                      {v ? <span>for {v.title}</span> : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </>
  );
}

/* ───────────── Journeys ───────────── */

export function JourneysPanel() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const journeys = activeJourneys(lib);
  const slugOf = (id: ID) => {
    const e = cat.get(id);
    return e && 'slug' in e ? e.slug : idTail(id);
  };

  const remove = (j: Journey) => {
    libraryActions.removeJourney(j.id);
    sound.play('unsave');
    const { id, title, kind, stops, params } = j;
    toast(`Removed the journey “${j.title || 'Untitled'}”`, {
      tone: 'success',
      action: { label: 'Undo', run: () => libraryActions.saveJourney({ id, title, kind, stops, ...(params ? { params } : {}) }) },
    });
  };

  return (
    <>
      <SectionHeader title="Routes you kept" id="you-journeys-h">
        Culture Passport routes and Take Me Somewhere sets you saved. Open one to travel it again.
      </SectionHeader>
      {journeys.length ? (
        <ul className="you-cards you-journeys">
          {journeys.map((j) => {
            const href = journeyHref(j, slugOf);
            const seconds = j.kind === 'somewhere' ? j.stops.reduce((s, id) => s + (asVideo(cat, id) ? cat.runtime(asVideo(cat, id)!) ?? 0 : 0), 0) : 0;
            const cover =
              j.stops
                .map((id) => asVideo(cat, id)?.art ?? (asPlace(cat, id) ? cat.videosForPlace(id, true)[0]?.art : undefined))
                .find(Boolean) ?? (j.kind === 'passport' ? 'art:culture-passport' : 'art:take-me-somewhere');
            return (
              <li key={j.id} className={`you-card you-journey you-journey-${j.kind}`}>
                <div className="you-card-media">
                  <Art art={cover} alt="" className="you-card-art" />
                  <span className="you-journey-kind">
                    <Icon name={j.kind === 'passport' ? 'passport' : 'compass'} size={14} /> {j.kind === 'passport' ? 'Culture Passport' : 'Take Me Somewhere'}
                  </span>
                </div>
                <h3 className="you-card-title">
                  <Link to={href}>{j.title || 'Untitled journey'}</Link>
                </h3>
                <p className="you-card-meta">
                  <span>{plural(j.stops.length, 'stop')}</span>
                  {seconds ? <span>{runtimeLabel(seconds)}</span> : null}
                  <span>Saved {dateLabel(new Date(j.at).toISOString())}</span>
                </p>
                <ol className="you-route" aria-label={`${plural(j.stops.length, 'stop')}${seconds ? `, ${runtimeLabel(seconds)} in total` : ''}`}>
                  {j.stops.map((id, i) => (
                    <li key={`${id}-${i}`}>
                      <span className="you-route-node" aria-hidden="true" />
                      <span>{cat.get(id) ? cat.label(id) : `${idTail(id)} (no longer in the catalogue)`}</span>
                    </li>
                  ))}
                </ol>
                <div className="you-pod-actions">
                  <ButtonLink to={href} variant="chrome" icon="arrow">
                    Open journey
                  </ButtonLink>
                  <Button icon="close" variant="quiet" onClick={() => remove(j)} aria-label={`Remove the journey ${j.title || 'Untitled journey'}`}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon="passport"
          tone="plasma"
          title="No journeys saved"
          actions={
            <>
              <ButtonLink to="/passport" variant="chrome" icon="passport">
                Plan a Culture Passport
              </ButtonLink>
              <ButtonLink to="/somewhere" icon="compass">
                Take me somewhere
              </ButtonLink>
            </>
          }
        >
          <p>Save a route from the Culture Passport or a set from Take Me Somewhere and it appears here.</p>
        </EmptyState>
      )}
    </>
  );
}

/* ───────────── History ───────────── */

export function HistoryPanel() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const { session } = useSession();
  const pending = usePendingHistory();
  const [confirm, setConfirm] = useState(false);
  const close = useCallback(() => setConfirm(false), []);
  const entries = visibleHistory(lib).filter((h) => !pending.has(historyKey(h)));
  const days = groupHistoryByDay(entries);

  const remove = (h: HistoryEntry, title: string) => {
    const undo = removeHistoryLater(h);
    sound.play('unsave');
    toast(`Removed “${title}” from history`, { tone: 'success', action: { label: 'Undo', run: undo } });
  };

  const clearAll = () => {
    dropPendingHistory();
    libraryActions.clearHistory();
    sound.play('unsave');
    setConfirm(false);
    toast('Watch history cleared', { tone: 'success' });
  };

  return (
    <>
      <SectionHeader
        title="What you watched"
        id="you-history-h"
        action={
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)} disabled={!entries.length}>
            Clear history
          </Button>
        }
      >
        {entries.length ? `${plural(entries.length, 'viewing')} · newest first` : 'Stories you open are listed here by day.'}
      </SectionHeader>
      {days.length ? (
        <div className="you-history">
          {days.map((d) => (
            <section key={d.key} className="you-day" aria-labelledby={`you-day-${d.key}`}>
              <h3 id={`you-day-${d.key}`} className="you-day-label">
                {d.label}
              </h3>
              <ul className="you-hist-list">
                {d.entries.map((h) => {
                  const v = asVideo(cat, h.video);
                  const title = v?.title ?? idTail(h.video);
                  const p = lib.progress[h.video];
                  const state = p?.done ? 'Finished' : p && p.dur && p.pos > 5 ? `${Math.round((p.pos / p.dur) * 100)}% watched` : null;
                  return (
                    <li key={historyKey(h)} className="you-hist">
                      {v ? <Art art={v.art} alt="" className="you-hist-thumb" /> : <span className="you-hist-thumb art-missing" aria-hidden="true" />}
                      <div className="you-hist-body">
                        {v ? (
                          <Link to={cat.href(v.id)} className="you-hist-title">
                            {title}
                          </Link>
                        ) : (
                          <span className="you-hist-title">{title}</span>
                        )}
                        <p className="you-hist-meta">
                          <time dateTime={new Date(h.at).toISOString()}>{new Date(h.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
                          {state ? <span>{state}</span> : null}
                          {!v ? <span>No longer in the catalogue</span> : null}
                        </p>
                      </div>
                      <IconButton icon="close" label={`Remove ${title} from history`} onClick={() => remove(h, title)} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon="time" tone="plasma" title="No watch history" actions={<ButtonLink to="/" variant="chrome" icon="stream">Back to Home</ButtonLink>}>
          <p>{lib.historyClearedAt ? `History was cleared ${dateLabel(new Date(lib.historyClearedAt).toISOString())}.` : 'Nothing watched yet.'}</p>
        </EmptyState>
      )}

      <Dialog open={confirm} onClose={close} title="Clear watch history?" labelledBy="you-clear-title">
        <div className="you-dialog">
          <p>
            {session.user
              ? 'This removes every entry from your watch history on all devices signed in to your account.'
              : 'This removes every entry from the watch history saved in this browser.'}{' '}
            Continue watching, saved stories, places and journeys are kept. This can&rsquo;t be undone.
          </p>
          <div className="you-dialog-actions">
            <Button onClick={close}>Keep history</Button>
            <Button variant="danger" icon="trash" onClick={clearAll}>
              Clear history
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/* ───────────── Interests ───────────── */

export function InterestsPanel() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const on = new Set(activeInterests(lib));
  const followed = cat.categories.filter((c) => on.has(c.id));

  return (
    <>
      <SectionHeader title="What you follow" id="you-interests-h">
        Followed interests are one of the signals behind <Link to="/my-world?tab=foryou">For you</Link>, alongside what you watch and save. Change them any time — the
        recommendations re-form at once.
      </SectionHeader>
      <ul className="you-chips" aria-label="Interests">
        {cat.categories.map((c) => (
          <li key={c.id}>
            <Chip selected={on.has(c.id)} onToggle={() => libraryActions.toggleInterest(c.id)} count={cat.videosForCategory(c.id).length}>
              {c.name}
            </Chip>
          </li>
        ))}
      </ul>
      <p className="you-live" role="status" aria-live="polite">
        {followed.length ? `Following ${plural(followed.length, 'interest')}` : 'Not following any interests yet'}
      </p>
      {followed.length ? (
        <ul className="you-cards you-followed">
          {followed.map((c) => (
            <li key={c.id} className="you-card">
              <Art art={cat.videosForCategory(c.id)[0]?.art ?? 'art:bauhaus-categories'} alt="" className="you-card-art" />
              <h3 className="you-card-title">
                <Link to={cat.href(c.id)}>{c.name}</Link>
              </h3>
              <p className="you-card-text">{c.summary}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/* ───────────── For you ───────────── */

export function ForYouPanel() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const { session } = useSession();
  const premium = session.membership.premium;
  // Removed history entries are tombstones; recommendations should not see them.
  const visible = useMemo<Library>(() => ({ ...lib, history: visibleHistory(lib) }), [lib]);
  const recs = useMemo(() => recommend(cat, { library: visible, premium, limit: 12 }), [cat, visible, premium]);
  const because = useMemo(() => becauseYouWatched(cat, visible, 8), [cat, visible]);
  const signals = {
    watched: new Set(visible.history.map((h) => h.video)).size,
    saved: savedIds(lib).length,
    interests: activeInterests(lib).length,
    places: savedPlaceIds(lib).length,
    stamps: Object.keys(lib.stamps).length,
  };
  const warm = signals.watched + signals.saved + signals.interests + signals.places + signals.stamps > 0;

  return (
    <>
      <SectionHeader title="Grown from what you love" id="you-foryou-h">
        {warm
          ? `Built from ${[
              signals.watched ? plural(signals.watched, 'story watched', 'stories watched') : '',
              signals.saved ? `${signals.saved} saved` : '',
              signals.interests ? plural(signals.interests, 'interest') : '',
              signals.places ? plural(signals.places, 'saved place') : '',
              signals.stamps ? plural(signals.stamps, 'passport stamp') : '',
            ]
              .filter(Boolean)
              .join(', ')}. Every pod says why it is here.`
          : 'You haven’t watched, saved or followed anything yet, so these are starting points. Each pod says why it is here.'}
      </SectionHeader>
      {recs.length ? (
        <ul className="grid-pods you-grid">
          {recs.map((r) => (
            <li key={r.video.id}>
              <VideoPod video={r.video} reasons={r.reasons} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="spark" title="Nothing new to suggest" actions={<ButtonLink to="/catalogue" variant="chrome" icon="search">Browse everything</ButtonLink>}>
          <p>You&rsquo;ve seen or started everything we could connect to your interests. New stories will appear here as the catalogue grows.</p>
        </EmptyState>
      )}

      {because ? (
        <div className="you-sub">
          <SectionHeader kicker="Because you watched" title={<>Connected to &ldquo;{because.seed.title}&rdquo;</>} id="you-because-h" />
          <ul className="grid-pods you-grid">
            {because.items.map((r) => (
              <li key={r.video.id}>
                <VideoPod video={r.video} reasons={r.reasons} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="you-foot-note muted">
        <Icon name="info" size={16} /> Follow interests in the <Link to="/my-world?tab=interests">Interests</Link> tab to steer this.
      </p>
    </>
  );
}

/* ───────────── Membership summary ───────────── */

export function MembershipSummary() {
  const cat = useCatalogue();
  const { session, status, config } = useSession();
  const tier = cat.payload.content.membership.tierName;
  const m = session.membership;
  const signedIn = !!session.user;
  const statusText = status === 'loading' ? 'Checking…' : !signedIn ? 'Guest — no account' : STATUS_LABEL[m.status];

  return (
    <>
      <SectionHeader title={tier} id="you-membership-h" />
      <div className={`you-member panel ${m.premium ? 'is-premium' : ''}`}>
        <div className="you-member-media" aria-hidden="true">
          <Art art="art:premium-vault" alt="" className="you-member-art" />
          <span className="you-member-seal">
            <Icon name={m.premium ? 'diamond' : 'lock'} size={22} />
          </span>
        </div>
        <div className="you-member-body">
          <dl className="you-member-facts">
            <div>
              <dt className="you-fact-label">Status</dt>
              <dd>{statusText}</dd>
            </div>
            <div>
              <dt className="you-fact-label">Premium access now</dt>
              <dd>{status === 'loading' ? '…' : m.premium ? 'Unlocked (confirmed by the server)' : 'Locked'}</dd>
            </div>
            {m.periodEnd ? (
              <div>
                <dt className="you-fact-label">{m.status === 'cancelled' ? 'Access until' : m.status === 'expired' ? 'Ended' : 'Current period ends'}</dt>
                <dd>{dateLabel(m.periodEnd)}</dd>
              </div>
            ) : null}
            {config ? (
              <div>
                <dt className="you-fact-label">Payments</dt>
                <dd>{BILLING_LABEL[config.billing.mode]}</dd>
              </div>
            ) : null}
          </dl>
          {m.status === 'dev_preview' ? <p className="notice">Development preview — no payment taken.</p> : null}
          <div className="you-pod-actions">
            <ButtonLink to="/membership" variant="chrome" icon="diamond">
              {m.premium ? 'Manage membership' : signedIn ? 'See what Premium unlocks' : 'About Premium'}
            </ButtonLink>
            {!signedIn ? (
              <ButtonLink to="/account?mode=register&next=/membership" icon="user">
                Create an account
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
