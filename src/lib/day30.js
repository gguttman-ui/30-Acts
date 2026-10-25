// day30.js — the "you completed 30 days" notification.
//
// Sends the congratulations message to the user (SMS for phone accounts, email
// for email accounts) and, when a contact email is on file, a copy there too.
// Shared so every 30-day completion path fires the same notification instead of
// each screen carrying its own copy. Fire-and-forget: never blocks the UI, and
// swallows its own errors.
import { supabase } from './supabase';

// Sent the moment Day 30 is saved - BEFORE the person chooses a certificate,
// a bracelet or both - so it must not promise either (item 88, 25 Oct 2026:
// it used to promise a wristband to everyone, including Gary, who chose the
// certificate only). Plain ASCII and under 160 characters: one SMS segment.
export const DAY30_MESSAGE =
  '30 Acts of Kindness: Congratulations! You completed 30 days in a row and are a ' +
  'Certified Kind Person. Thank you for making the world a kinder place.';

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
