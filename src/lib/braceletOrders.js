// braceletOrders.js -- Recognition Orders admin screen (2 Nov 2026).
//
// Gary asked for a better way to handle bracelet shipping. The screen now opens
// on a "To do" list (not yet shipped), says exactly which payment to look for,
// and copies a ready-to-paste mailing label. New orders also text Gary
// (database trigger recognition_orders_notify,
// supabase/migrations/20261102_bracelet_order_alerts.sql).
//
// Pure: no React Native, no Supabase. See __tests__/braceletOrders.test.js.

import { isMemberKey } from './family';

export const SHIP_AMOUNT_TEXT = '$6.95';

export const TABS = [
  { key: 'todo',    label: 'To do' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'all',     label: 'All' },
];

const isPaid    = (o) => o && o.payment_status === 'paid';
const isShipped = (o) => o && o.fulfillment_status === 'shipped';

/** 'pay' (waiting for money) | 'ship' (paid, to mail) | 'done' (shipped). */
export function orderStage(o) {
  if (isShipped(o)) return 'done';
  if (isPaid(o)) return 'ship';
  return 'pay';
}

/** Orders for a tab: todo = not shipped (oldest first), shipped / all = newest first. */
export function ordersForTab(orders, tab) {
  const list = (orders || []).filter((o) => o && o.bracelet_requested);
  const byNew = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
  if (tab === 'todo') {
    return list.filter((o) => !isShipped(o)).sort((a, b) => -byNew(a, b));
  }
  if (tab === 'shipped') return list.filter(isShipped).sort(byNew);
  return list.slice().sort(byNew);
}

const METHOD_NAMES = { zelle: 'Zelle', paypal: 'PayPal', venmo: 'Venmo' };

/** One line telling the admin what to do next with this order. */
export function nextStepText(o) {
  const name = (o && o.ship_name && String(o.ship_name).trim()) || 'the customer';
  switch (orderStage(o)) {
    case 'pay': {
      const m = o && o.payment_method;
      if (!m) return `Waiting: ${name} has not tapped "I've sent the ${SHIP_AMOUNT_TEXT}" yet.`;
      const method = METHOD_NAMES[String(m).toLowerCase()] || m;
      return `Look for ${SHIP_AMOUNT_TEXT} by ${method} from ${name}, then tap Mark Paid.`;
    }
    case 'ship':
      return 'Paid. Copy the label, mail the bracelet, then tap Mark Shipped.';
    default:
      return 'Shipped. The address is deleted 30 days after shipping.';
  }
}

/** The mailing label as plain text, ready to paste into a shipping site. */
export function mailingLabel(o) {
  if (!o) return '';
  const cityLine = [
    [o.ship_city, o.ship_state].filter(Boolean).join(', '),
    o.ship_zip,
  ].filter(Boolean).join(' ').trim();
  return [
    o.ship_name,
    o.ship_street1,
    o.ship_street2,
    cityLine,
    o.ship_country && o.ship_country !== 'US' ? o.ship_country : null,
  ].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join('\n');
}

/** The address part of the label (no name line). */
export function addressBlock(o) {
  return o ? mailingLabel({ ...o, ship_name: null }) : '';
}

/** True when the order is for a child family profile (bracelet goes to the parent). */
export function isChildOrder(o) {
  return isMemberKey(o && o.user_phone);
}
