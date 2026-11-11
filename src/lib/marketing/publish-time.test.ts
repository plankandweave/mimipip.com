import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lockedTimeIST, publishTimeHold } from './publish-time';
describe('locked publication times', () => {
  it('holds the evening post even after the daily publishing run, then releases on time', () => {
    const art={ publish_at:'2026-10-03T18:00:00+05:30' };
    assert.ok(publishTimeHold(art,new Date('2026-10-03T11:30:00+05:30'))?.includes('waiting'));
    assert.ok(publishTimeHold(art,new Date('2026-10-03T17:59:59+05:30'))?.includes('waiting'));
    assert.equal(publishTimeHold(art,new Date('2026-10-03T18:00:00+05:30')),null);
    assert.equal(lockedTimeIST(art),'18:00');
  });
  it('does not turn draft proposed times into schedules and fails closed on malformed locked times', () => {
    assert.equal(publishTimeHold({proposed_time_ist:'18:00'},new Date()),null);
    assert.ok(publishTimeHold({publish_at:'18:00'},new Date())?.includes('invalid'));
    assert.ok(publishTimeHold({publish_at:'2026-10-03T18:00:00'},new Date())?.includes('invalid'));
  });
});
