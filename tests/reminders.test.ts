import { expect, test } from 'vitest';
import { reminderPeriod } from '@/modules/reminders/policy';
const preference = {
  enabled: true,
  dayMode: 'SPECIFIC',
  day: 31,
  time: '09:00',
};
test('dia inexistente usa último dia e respeita hora em São Paulo', () => {
  expect(
    reminderPeriod(preference, new Date('2027-02-28T11:59:00Z')),
  ).toBeNull();
  expect(reminderPeriod(preference, new Date('2027-02-28T12:00:00Z'))).toBe(
    '2027-02',
  );
  expect(
    reminderPeriod(preference, new Date('2027-03-01T12:00:00Z')),
  ).toBeNull();
});
test('primeiro e último dia, ano bissexto e desativação', () => {
  expect(
    reminderPeriod(
      { ...preference, dayMode: 'FIRST' },
      new Date('2028-02-01T12:00:00Z'),
    ),
  ).toBe('2028-02');
  expect(
    reminderPeriod(
      { ...preference, dayMode: 'LAST' },
      new Date('2028-02-28T12:00:00Z'),
    ),
  ).toBeNull();
  expect(
    reminderPeriod(
      { ...preference, dayMode: 'LAST' },
      new Date('2028-02-29T12:00:00Z'),
    ),
  ).toBe('2028-02');
  expect(
    reminderPeriod(
      { ...preference, enabled: false },
      new Date('2028-02-29T12:00:00Z'),
    ),
  ).toBeNull();
});
