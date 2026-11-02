// Recognition Orders admin screen (2 Nov 2026): To do list, next-step line,
// copyable mailing label. Gary: "need a better way to deal with shipping bracelets".
const fs   = require('fs');
const path = require('path');
import {
  ordersForTab, orderStage, nextStepText, mailingLabel, addressBlock, isChildOrder,
} from '../src/lib/braceletOrders';

const base = {
  bracelet_requested: true, ship_name: 'Mahelet Senbetta', ship_street1: '1 Main St',
  ship_street2: null, ship_city: 'Chicago', ship_state: 'IL', ship_zip: '60601', ship_country: 'US',
  user_phone: '+13125221949', created_at: '2026-11-02T16:21:18Z',
};
const pending = { ...base, id: 1 };
const sent    = { ...base, id: 2, payment_method: 'zelle', created_at: '2026-11-01T10:00:00Z' };
const paid    = { ...base, id: 3, payment_method: 'zelle', payment_status: 'paid', created_at: '2026-10-30T10:00:00Z' };
const shipped = { ...paid, id: 4, fulfillment_status: 'shipped', created_at: '2026-10-20T10:00:00Z' };
const certOnly = { ...base, id: 5, bracelet_requested: false };

describe('stages and tabs', () => {
  test('stage follows payment then shipping', () => {
    expect(orderStage(pending)).toBe('pay');
    expect(orderStage(sent)).toBe('pay');
    expect(orderStage(paid)).toBe('ship');
    expect(orderStage(shipped)).toBe('done');
  });

  test('To do = not shipped, oldest first; certificate-only rows never listed', () => {
    const all = [pending, sent, paid, shipped, certOnly];
    expect(ordersForTab(all, 'todo').map((o) => o.id)).toEqual([3, 2, 1]);
    expect(ordersForTab(all, 'shipped').map((o) => o.id)).toEqual([4]);
    expect(ordersForTab(all, 'all').map((o) => o.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('next step line', () => {
  test('says exactly which payment to look for', () => {
    expect(nextStepText(sent)).toBe('Look for $6.95 by Zelle from Mahelet Senbetta, then tap Mark Paid.');
    expect(nextStepText(pending)).toMatch(/has not tapped "I've sent the \$6.95" yet/);
    expect(nextStepText(paid)).toMatch(/Copy the label, mail the bracelet/);
    expect(nextStepText(shipped)).toMatch(/deleted 30 days after shipping/);
  });
});

describe('mailing label', () => {
  test('name, street, City, ST ZIP; blank lines and US left out', () => {
    expect(mailingLabel(sent)).toBe('Mahelet Senbetta\n1 Main St\nChicago, IL 60601');
    expect(mailingLabel({ ...sent, ship_street2: 'Apt 2' })).toBe('Mahelet Senbetta\n1 Main St\nApt 2\nChicago, IL 60601');
    expect(addressBlock(sent)).toBe('1 Main St\nChicago, IL 60601');
  });

  test('a child order is flagged (bracelet goes to the parent)', () => {
    expect(isChildOrder({ ...base, user_phone: '+13125221949-01' })).toBe(true);
    expect(isChildOrder(base)).toBe(false);
  });
});

describe('wiring', () => {
  const root = path.join(__dirname, '..');
  const SCREEN = fs.readFileSync(path.join(root, 'src', 'screens', 'RecognitionAdminScreen.js'), 'utf8');
  const MIG = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261102_bracelet_order_alerts.sql'), 'utf8');

  test('screen opens on To do and copies the label', () => {
    expect(SCREEN).toContain("useState('todo')");
    expect(SCREEN).toContain('Clipboard.setStringAsync(mailingLabel(o))');
    expect(SCREEN).toContain('nextStepText(o)');
  });

  test('order alert trigger is recorded and cannot be called from the app', () => {
    expect(MIG).toContain('create trigger recognition_orders_notify');
    expect(MIG).toContain('revoke all on function public.notify_bracelet_order() from public, anon, authenticated');
    expect(MIG).toContain('exception when others then');
  });
});
