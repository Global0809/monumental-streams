/**
 * The control bar: tendon scrubber, transport, volume, time, chapters, captions,
 * settings (speed, quality, player options), picture-in-picture and full screen.
 */
import { type RefObject } from 'react';
import type { CaptionTrack } from '../../../../shared/types.ts';
import { timecode } from '../../../lib/format.ts';
import { sound } from '../../../systems/sound/engine.ts';
import { Icon } from '../../../ui/Icon.tsx';
import type { EngineKind, QualityLevel } from './engine.ts';
import { MenuButton, type MenuGroup } from './Menu.tsx';
import { Scrubber } from './Scrubber.tsx';
import { JUMP_STEP, rateLabel, SPEEDS } from './time.ts';
import { chapterAt, type Cue, type ThumbCue } from './vtt.ts';

export interface MediaState {
  paused: boolean;
  ended: boolean;
  time: number;
  duration: number;
  buffered: { start: number; end: number }[];
  volume: number;
  muted: boolean;
  rate: number;
  waiting: boolean;
  pip: boolean;
  fullscreen: boolean;
}

export interface ControlsApi {
  togglePlay(): void;
  seekTo(t: number): void;
  seekBy(by: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  setRate(r: number): void;
  setCaption(track: CaptionTrack | null): void;
  setCaptionSize(size: 'm' | 'l' | 'xl'): void;
  setLevel(index: number): void;
  toggleFullscreen(): void;
  togglePip(): void;
  switchToNative(): void;
  setAutoplayNext(on: boolean): void;
  openHelp(): void;
  onScrub(active: boolean): void;
}

export const trackKey = (t: Pick<CaptionTrack, 'lang' | 'kind'>) => `${t.lang}:${t.kind}`;

const SIZE_LABEL = { m: 'Medium', l: 'Large', xl: 'Extra large' } as const;

export function Controls({
  m,
  api,
  videoRef,
  chapters,
  thumbs,
  tracks,
  activeTrack,
  captionSize,
  levels,
  engineKind,
  openMenu,
  setOpenMenu,
  canPip,
  canFullscreen,
  volumeSettable,
  autoplayNext,
  title,
}: {
  m: MediaState;
  api: ControlsApi;
  videoRef: RefObject<HTMLVideoElement | null>;
  chapters: Cue[];
  thumbs: ThumbCue[];
  tracks: CaptionTrack[];
  activeTrack: CaptionTrack | null;
  captionSize: 'm' | 'l' | 'xl';
  levels: { list: QualityLevel[]; selected: number; playing: number };
  engineKind: EngineKind | null;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  canPip: boolean;
  canFullscreen: boolean;
  volumeSettable: boolean;
  autoplayNext: boolean;
  title: string;
}) {
  const dur = m.duration;
  const chapter = chapterAt(chapters, m.time);
  const menu = (id: string) => ({ open: openMenu === id, onOpenChange: (o: boolean) => setOpenMenu(o ? id : null) });
  const playingLevel = levels.list.find((l) => l.index === levels.playing);

  const qualityGroup: MenuGroup =
    engineKind === 'hls.js' && levels.list.length > 0
      ? {
          label: 'Quality',
          items: [
            {
              key: 'auto',
              label: 'Auto',
              hint: levels.selected === -1 && playingLevel ? playingLevel.label : undefined,
              checked: levels.selected === -1,
              onSelect: () => api.setLevel(-1),
            },
            ...levels.list.map((l) => ({ key: `q${l.index}`, label: l.label, checked: levels.selected === l.index, onSelect: () => api.setLevel(l.index) })),
          ],
        }
      : {
          label: 'Quality',
          items: [{ key: 'auto', label: 'Auto', checked: true, disabled: true, onSelect: () => undefined }],
          note:
            engineKind === 'native-hls'
              ? 'Your browser picks the quality for this stream automatically.'
              : engineKind === 'mp4'
                ? 'This device is playing a single progressive file, so there is nothing to switch between.'
                : 'Quality choices appear once the stream has loaded.',
        };

  const settingsGroups: MenuGroup[] = [
    {
      label: 'Speed',
      items: SPEEDS.map((s) => ({ key: `r${s}`, label: s === 1 ? 'Normal' : rateLabel(s), hint: s === 1 ? '1×' : undefined, checked: Math.abs(m.rate - s) < 0.01, onSelect: () => api.setRate(s) })),
    },
    qualityGroup,
    {
      label: 'Player',
      items: [
        { key: 'autonext', kind: 'checkbox', label: 'Autoplay next', checked: autoplayNext, keepOpen: true, onSelect: () => api.setAutoplayNext(!autoplayNext) },
        { key: 'native', kind: 'checkbox', label: 'Native controls', hint: 'Browser player', checked: false, onSelect: () => api.switchToNative() },
        { key: 'help', kind: 'action', label: 'Keyboard shortcuts', hint: '?', onSelect: () => api.openHelp() },
      ],
    },
  ];

  return (
    <div className="pl-bar">
      <Scrubber
        videoRef={videoRef}
        time={m.time}
        duration={dur}
        playing={!m.paused}
        buffered={m.buffered}
        chapters={chapters}
        thumbs={thumbs}
        onSeek={(t) => {
          sound.play('tick');
          api.seekTo(t);
        }}
        onScrub={api.onScrub}
      />
      <div className="pl-row">
        <div className="pl-cluster">
          <button
            type="button"
            className="pl-btn pl-btn-main"
            data-pl-primary=""
            aria-label={m.paused ? `Play ${title}` : `Pause ${title}`}
            title={m.paused ? 'Play (K)' : 'Pause (K)'}
            data-cursor="play"
            data-cursor-label={m.paused ? 'Play' : 'Pause'}
            onClick={api.togglePlay}
          >
            <Icon name={m.paused ? 'play' : 'pause'} size={22} />
          </button>
          <button type="button" className="pl-btn pl-hide-sm" aria-label={`Back ${JUMP_STEP} seconds`} title="Back 10 s (J)" onClick={() => api.seekBy(-JUMP_STEP)}>
            <Icon name="skipBack" size={20} />
          </button>
          <button type="button" className="pl-btn pl-hide-sm" aria-label={`Forward ${JUMP_STEP} seconds`} title="Forward 10 s (L)" onClick={() => api.seekBy(JUMP_STEP)}>
            <Icon name="skipFwd" size={20} />
          </button>
          <div className="pl-volume">
            <button
              type="button"
              className="pl-btn"
              aria-label={m.muted || m.volume === 0 ? 'Unmute' : 'Mute'}
              aria-pressed={m.muted || m.volume === 0}
              title={m.muted ? 'Unmute (M)' : 'Mute (M)'}
              onClick={api.toggleMute}
            >
              <Icon name={m.muted || m.volume === 0 ? 'mute' : 'volume'} size={20} />
            </button>
            {volumeSettable ? (
              <input
                type="range"
                className="pl-volume-range"
                aria-label="Volume"
                min={0}
                max={1}
                step={0.05}
                value={m.muted ? 0 : m.volume}
                aria-valuetext={`${Math.round((m.muted ? 0 : m.volume) * 100)}%`}
                style={{ ['--pl-v' as string]: `${(m.muted ? 0 : m.volume) * 100}%` }}
                onChange={(e) => api.setVolume(Number(e.target.value))}
              />
            ) : null}
          </div>
          <p className="pl-time mono">
            <span>{timecode(m.time)}</span>
            <span className="pl-time-sep" aria-hidden="true">
              /
            </span>
            <span className="sr-only"> of </span>
            <span>{dur > 0 ? timecode(dur) : '–:––'}</span>
          </p>
          {chapter ? (
            <p className="pl-chapter-now" title={chapter.text}>
              <span className="sr-only">Chapter: </span>
              {chapter.text}
            </p>
          ) : null}
        </div>
        <div className="pl-cluster pl-cluster-end">
          {chapters.length > 1 ? (
            <MenuButton
              id="pl-chapters"
              label="Chapters"
              icon="list"
              {...menu('chapters')}
              groups={[
                {
                  items: chapters.map((c, i) => ({
                    key: `c${i}`,
                    label: c.text,
                    hint: timecode(c.start),
                    checked: chapter === c,
                    onSelect: () => api.seekTo(c.start),
                  })),
                },
              ]}
            />
          ) : null}
          {tracks.length ? (
            <MenuButton
              id="pl-captions"
              label="Captions"
              icon="captions"
              title="Captions (C)"
              pressed={!!activeTrack}
              {...menu('captions')}
              groups={[
                {
                  label: 'Track',
                  items: [
                    { key: 'off', label: 'Off', checked: !activeTrack, onSelect: () => api.setCaption(null) },
                    ...tracks.map((t) => ({ key: trackKey(t), label: t.label, checked: !!activeTrack && trackKey(activeTrack) === trackKey(t), onSelect: () => api.setCaption(t) })),
                  ],
                },
                {
                  label: 'Text size',
                  items: (['m', 'l', 'xl'] as const).map((s) => ({ key: s, label: SIZE_LABEL[s], checked: captionSize === s, keepOpen: true, onSelect: () => api.setCaptionSize(s) })),
                },
              ]}
            />
          ) : null}
          <MenuButton id="pl-settings" label="Settings" icon="settings" text={m.rate !== 1 ? rateLabel(m.rate) : undefined} {...menu('settings')} groups={settingsGroups} />
          {canPip ? (
            <button type="button" className="pl-btn pl-hide-xs" aria-label={m.pip ? 'Exit picture-in-picture' : 'Picture-in-picture'} aria-pressed={m.pip} title="Picture-in-picture (I)" onClick={api.togglePip}>
              <Icon name="pip" size={20} />
            </button>
          ) : null}
          {canFullscreen ? (
            <button type="button" className="pl-btn" aria-label={m.fullscreen ? 'Exit full screen' : 'Full screen'} title={m.fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'} onClick={api.toggleFullscreen}>
              <Icon name={m.fullscreen ? 'exitFullscreen' : 'fullscreen'} size={20} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
