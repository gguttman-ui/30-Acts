// day30.js — the "you completed 30 days" notification.
//
// Sends the congratulations message to the user (SMS for phone accounts, email
// for email accounts) and, when a contact email is on file, a copy there too.
// Shared so every 30-day completion path fires the same notification instead of
// each screen carrying its own copy. Fire-and-forget: never blocks the UI, and
// swallows its own errors.
import { supabase } from './supabase';

const DAY30_MESSAGE =
  'Congratulations, you have gone the extra mile and are a truly certified Kind Person. ' +
  'We will send you your Certified Kind Person wristband.';

export async function notifyDay30() {
  let authUser = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUser = data?.user || null;
  } catch (e) {
    console.warn('Day30 notify: could not load user:', e.message);
    return;
  }
  if (!authUser) return;

  const email = authUser.email || '';
  const isPhone = email.includes('@phone.30acts.app');

  // Primary notification to the account itself.
  try {
    if (isPhone) {
      const phone_number = email.replace('@phone.30acts.app', '');
      await supabase.rpc('send_sms_notification', { phone_number, message: DAY30_MESSAGE });
    } else if (email) {
      await supabase.rpc('send_email_notification', {
        to_email: email, message: DAY30_MESSAGE, act_title: '30 Acts Completed!',
      });
    }
  } catch (e) {
    console.warn('Day30 notify (primary) error:', e.message);
  }

  // Optional copy to a contact email stored in the user's metadata.
  try {
    const contactEmail = authUser.user_metadata?.contact_email;
    if (contactEmail) {
      await supabase.rpc('send_email_notification', {
        to_email: contactEmail, message: DAY30_MESSAGE, act_title: '30 Acts Completed!',
      });
    }
  } catch (e) {
    console.warn('Day30 notify (contact copy) error:', e.message);
  }
}
