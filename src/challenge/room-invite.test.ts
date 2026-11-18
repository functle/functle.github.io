import { expect, it } from 'vitest';
import { readRoomInvite } from '../../public/challenge/room-invite.js';

const site = 'https://functle.github.io';
const api = 'https://functle-challenges.zh0ngy0925.workers.dev';
const code = 'abcd1234ef56';
const read = (input: string) => readRoomInvite(input, site, api, '/challenge/');

it.each([code, ' ABCD-1234-EF56 ', 'ABCD 1234 EF56', site + '/challenge/?room=' + code,
  'functle.github.io/challenge?room=' + code, api + '/challenge/' + code, '/challenge/?room=' + code])(
  'opens the same room for %s', (input) => expect(read(input)).toBe(code)
);

it.each(['', 'abcd123', 'ABCD-1234-ZZZZ', site + '/challenge/', site + '/archive/?room=' + code,
  site + '/challenge/?room=' + code + '&room=123412341234', 'https://example.org/challenge/' + code])(
  'rejects an invalid or ambiguous invite %s', (input) => expect(read(input)).toBeNull()
);
