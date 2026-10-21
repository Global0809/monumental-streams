import { describe, expect, it } from 'vitest';
import { chapterAt, cueAt, cueLines, lastStartedIndex, parseThumbnails, parseTimestamp, parseVtt } from '../../src/features/watch/player/vtt.ts';

describe('parseTimestamp', () => {
  it('reads hours, minutes, seconds and millis', () => {
    expect(parseTimestamp('00:00:07.700')).toBeCloseTo(7.7);
    expect(parseTimestamp('01:02:03.004')).toBeCloseTo(3723.004);
    expect(parseTimestamp('02:03.5')).toBeCloseTo(123.5);
    expect(parseTimestamp('1:02')).toBe(62);
    expect(parseTimestamp('00:00:01,250')).toBeCloseTo(1.25);
  });
  it('rejects malformed stamps', () => {
    expect(parseTimestamp('00:61.000')).toBeNull();
    expect(parseTimestamp('1:60:00.000')).toBeNull();
    expect(parseTimestamp('abc')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });
});

describe('parseVtt', () => {
  it('parses the chapter format the media pipeline writes', () => {
    const text = 'WEBVTT\n\n00:00:00.000 --> 00:00:07.700\nLiving Atlas\n\n00:00:07.700 --> 00:00:15.100\nMiami, up close\n';
    expect(parseVtt(text)).toEqual([
      { start: 0, end: 7.7, text: 'Living Atlas' },
      { start: 7.7, end: 15.1, text: 'Miami, up close' },
    ]);
  });

  it('handles BOM, CRLF, header metadata, NOTE/STYLE blocks, ids, settings and multi-line text', () => {
    const text =
      '﻿WEBVTT - captions\r\nKind: captions\r\n\r\nNOTE a comment\r\nspanning lines\r\n\r\nSTYLE\r\n::cue { color: red }\r\n\r\nintro\r\n00:01.000 --> 00:03.000 align:start line:90%\r\nFirst line\r\n<i>Second</i> line\r\n\r\n\r\n00:00.500 --> 00:00.900\r\nEarlier\r\n';
    const cues = parseVtt(text);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 0.5, end: 0.9, text: 'Earlier' });
    expect(cues[1]).toEqual({ start: 1, end: 3, text: 'First line\n<i>Second</i> line', id: 'intro' });
  });

  it('skips cues with broken timings and tolerates a header without a blank line', () => {
    expect(parseVtt('WEBVTT\n00:00:01.000 --> 00:00:02.000\nTight\n\n00:00:05.000 --> 00:00:04.000\nBackwards')).toEqual([{ start: 1, end: 2, text: 'Tight' }]);
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT\n')).toEqual([]);
  });
});

describe('parseThumbnails', () => {
  const base = 'http://localhost:5173/media/public/thumbs/reel.vtt';
  it('reads sprite regions and resolves root-relative and relative URLs', () => {
    const text =
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n/media/public/thumbs/reel.webp#xywh=0,0,160,90\n\n00:00:02.000 --> 00:00:04.000\nreel.webp#xywh=160,90,160,90\n\n00:00:04.000 --> 00:00:06.000\nframe-3.jpg';
    const t = parseThumbnails(text, base);
    expect(t[0]).toEqual({ start: 0, end: 2, url: 'http://localhost:5173/media/public/thumbs/reel.webp', x: 0, y: 0, w: 160, h: 90 });
    expect(t[1]).toMatchObject({ url: 'http://localhost:5173/media/public/thumbs/reel.webp', x: 160, y: 90 });
    expect(t[2]).toMatchObject({ url: 'http://localhost:5173/media/public/thumbs/frame-3.jpg', w: 0, h: 0 });
  });
  it('accepts the pixel: unit prefix', () => {
    const t = parseThumbnails('WEBVTT\n\n00:00.000 --> 00:02.000\nsprite.png#xywh=pixel:10,20,30,40', base);
    expect(t[0]).toMatchObject({ x: 10, y: 20, w: 30, h: 40 });
  });
});

describe('cue lookup', () => {
  const cues = [
    { start: 0, end: 7.7, text: 'A' },
    { start: 7.7, end: 15.1, text: 'B' },
    { start: 20, end: 30, text: 'C' },
  ];
  it('finds the last started cue', () => {
    expect(lastStartedIndex(cues, -1)).toBe(-1);
    expect(lastStartedIndex(cues, 0)).toBe(0);
    expect(lastStartedIndex(cues, 7.7)).toBe(1);
    expect(lastStartedIndex(cues, 99)).toBe(2);
    expect(lastStartedIndex([], 3)).toBe(-1);
  });
  it('cueAt respects end times; chapterAt carries across gaps', () => {
    expect(cueAt(cues, 16)?.text).toBeUndefined();
    expect(cueAt(cues, 10)?.text).toBe('B');
    expect(cueAt(cues, 15.1)).toBeNull();
    expect(chapterAt(cues, 16)?.text).toBe('B');
    expect(chapterAt(cues, 25)?.text).toBe('C');
  });
});

describe('cueLines', () => {
  it('strips markup, decodes entities and drops empty lines', () => {
    expect(cueLines('<v Narrator>Hello &amp; welcome</v>\n\n<c.yellow>[Low synth swell]</c>')).toEqual(['Hello & welcome', '[Low synth swell]']);
    expect(cueLines('5 &lt; 6 &gt; 4')).toEqual(['5 < 6 > 4']);
    expect(cueLines('&lt;b&gt;literal&lt;/b&gt;')).toEqual(['<b>literal</b>']);
    expect(cueLines('<00:00:01.000>karaoke <b>bold</b>')).toEqual(['karaoke bold']);
  });
});
