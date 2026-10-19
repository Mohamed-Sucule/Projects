import { describe, expect, it } from 'vitest';
import {
  clampYear,
  formatOffset,
  formatWhen,
  fromNight,
  nightOf,
  parseLocal,
  shiftDate,
  toInstant,
  toLocal,
  zoneAt,
} from '../../src/sky/time';

const iso = (d: Date | null) => d?.toISOString().slice(0, 16);

describe('time zones from coordinates', () => {
  it('finds the zone a place keeps', () => {
    expect(zoneAt(48.8566, 2.3522)).toBe('Europe/Paris');
    expect(zoneAt(35.6762, 139.6503)).toBe('Asia/Tokyo');
    expect(zoneAt(-33.8688, 151.2093)).toBe('Australia/Sydney');
    expect(zoneAt(31.5017, 34.4668)).toBe('Asia/Gaza');
    expect(zoneAt(40.7128, -74.006)).toBe('America/New_York');
  });

  it('falls back to a nautical zone at sea, and to UTC for nonsense', () => {
    expect(zoneAt(0, -30)).toMatch(/^Etc\/GMT/);
    expect(zoneAt(Number.NaN, 0)).toBe('UTC');
  });
});

describe('wall-clock time at the place', () => {
  it('reads the clock at the place, not on this computer', () => {
    expect(iso(toInstant({ date: '2025-02-14', time: '21:30' }, 'Europe/Paris'))).toBe(
      '2025-02-14T20:30',
    );
    expect(iso(toInstant({ date: '2025-07-14', time: '21:30' }, 'Europe/Paris'))).toBe(
      '2025-07-14T19:30',
    );
    expect(iso(toInstant({ date: '2025-01-01', time: '00:00' }, 'Asia/Kathmandu'))).toBe(
      '2024-12-31T18:15',
    );
    expect(iso(toInstant({ date: '2025-01-01', time: '00:00' }, 'Pacific/Chatham'))).toBe(
      '2024-12-31T10:15',
    );
  });

  it('reads a time the clocks skipped as the same distance past the jump', () => {
    // Paris went from 02:00 straight to 03:00 on 30 March 2025
    const skipped = toInstant({ date: '2025-03-30', time: '02:30' }, 'Europe/Paris');
    expect(iso(skipped)).toBe('2025-03-30T01:30');
    expect(toLocal(skipped!, 'Europe/Paris')).toEqual({ date: '2025-03-30', time: '03:30' });
  });

  it('takes the first of a time that happened twice', () => {
    // Paris went from 03:00 back to 02:00 on 26 October 2025
    expect(iso(toInstant({ date: '2025-10-26', time: '02:30' }, 'Europe/Paris'))).toBe(
      '2025-10-26T00:30',
    );
    expect(iso(toInstant({ date: '2025-10-26', time: '03:30' }, 'Europe/Paris'))).toBe(
      '2025-10-26T02:30',
    );
  });

  it('keeps the offsets a place kept in the past', () => {
    // Britain stayed on summer time all year from 1968 to 1971
    expect(iso(toInstant({ date: '1969-01-15', time: '12:00' }, 'Europe/London'))).toBe(
      '1969-01-15T11:00',
    );
  });

  it('goes there and back', () => {
    for (const zone of ['America/Los_Angeles', 'Asia/Kolkata', 'Australia/Lord_Howe', 'UTC']) {
      for (const date of ['1955-06-01', '2000-02-29', '2025-11-02', '2199-12-31']) {
        const t = { date, time: '23:45' };
        expect(toLocal(toInstant(t, zone)!, zone)).toEqual(t);
      }
    }
  });

  it('turns down dates that do not exist', () => {
    expect(parseLocal({ date: '2025-02-29', time: '12:00' })).toBeNull();
    expect(parseLocal({ date: '2024-02-29', time: '12:00' })).not.toBeNull();
    expect(parseLocal({ date: '2025-13-01', time: '12:00' })).toBeNull();
    expect(parseLocal({ date: '2025-01-01', time: '24:00' })).toBeNull();
    expect(toInstant({ date: 'soon', time: '12:00' }, 'UTC')).toBeNull();
  });

  it('keeps years within what the sky data covers', () => {
    expect(clampYear({ date: '1492-10-12', time: '02:00' }).date).toBe('1800-10-12');
    expect(clampYear({ date: '2400-02-29', time: '02:00' }).date).toBe('2200-02-28');
  });

  it('says how the clocks relate to UTC', () => {
    expect(formatOffset(new Date('2025-02-14T20:30:00Z'), 'Europe/Paris')).toBe('UTC+1');
    expect(formatOffset(new Date('2025-02-14T20:30:00Z'), 'Asia/Kolkata')).toBe('UTC+5:30');
    expect(formatOffset(new Date('2025-02-14T20:30:00Z'), 'America/St_Johns')).toBe('UTC−3:30');
    expect(formatOffset(new Date('2025-02-14T20:30:00Z'), 'UTC')).toBe('UTC');
  });

  it('writes the date the reader’s way', () => {
    expect(formatWhen({ date: '2025-02-14', time: '21:30' }, 'en-GB')).toBe(
      '14 February 2025 · 21:30',
    );
    expect(formatWhen({ date: '2025-02-14', time: '21:30' }, 'en-US')).toMatch(
      /^February 14, 2025 · 9:30\sPM$/u,
    );
    expect(formatWhen({ date: '2025-02-14', time: '09:05' }, 'en-GB')).toBe(
      '14 February 2025 · 9:05',
    );
  });
});

describe('the night slider, noon to noon', () => {
  it('puts the small hours with the evening before', () => {
    expect(nightOf({ date: '2025-02-14', time: '21:30' })).toEqual({
      evening: '2025-02-14',
      minute: 570,
    });
    expect(nightOf({ date: '2025-02-15', time: '01:30' })).toEqual({
      evening: '2025-02-14',
      minute: 810,
    });
    expect(fromNight('2025-02-14', 810)).toEqual({ date: '2025-02-15', time: '01:30' });
    expect(fromNight('2025-12-31', 720)).toEqual({ date: '2026-01-01', time: '00:00' });
    expect(fromNight('2025-02-14', 0)).toEqual({ date: '2025-02-14', time: '12:00' });
  });

  it('moves across months and leap days', () => {
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftDate('2025-01-01', -1)).toBe('2024-12-31');
  });
});
