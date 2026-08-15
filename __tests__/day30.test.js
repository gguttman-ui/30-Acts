// Day 30 notification routing: phone accounts get an SMS, email accounts get an
// email, and a contact_email in metadata gets a copy. supabase is fully mocked.
const mockRpc = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a) => mockGetUser(...a) },
    rpc: (...a) => mockRpc(...a),
  },
}));

import { notifyDay30 } from '../src/lib/day30';

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({});
  mockGetUser.mockReset();
});

test('phone account → sends an SMS notification', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: { email: '+15550100142@phone.30acts.app', user_metadata: {} } },
  });
  await notifyDay30();
  expect(mockRpc).toHaveBeenCalledWith(
    'send_sms_notification',
    expect.objectContaining({ phone_number: '+15550100142' }),
  );
});

test('email account → sends an email notification', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: { email: 'gary@example.com', user_metadata: {} } },
  });
  await notifyDay30();
  expect(mockRpc).toHaveBeenCalledWith(
    'send_email_notification',
    expect.objectContaining({ to_email: 'gary@example.com' }),
  );
});

test('contact_email in metadata → also sends a copy there', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: {
      email: '+15550100142@phone.30acts.app',
      user_metadata: { contact_email: 'contact@example.com' },
    } },
  });
  await notifyDay30();
  expect(mockRpc).toHaveBeenCalledWith(
    'send_email_notification',
    expect.objectContaining({ to_email: 'contact@example.com' }),
  );
});

test('no signed-in user → sends nothing', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } });
  await notifyDay30();
  expect(mockRpc).not.toHaveBeenCalled();
});
