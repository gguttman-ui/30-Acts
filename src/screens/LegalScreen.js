import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { ScreenHeader } from '../components';
import { C } from '../constants';

// ── Document content ──────────────────────────────────────────────────────────

const TERMS_OF_SERVICE = [
  {
    heading: '1.1 Agreement to These Terms',
    body: 'Welcome to 30 Acts of Kindness™, operated by 30ActsofKindness NFP ("30 Acts of Kindness™," "we," "us," or "our"). These Terms of Service ("Terms") govern your access to and use of our mobile application, website, features, challenges, content, donation tools, contests, and related services (collectively, the "Service").\n\nBy creating an account, accessing, or using the Service, you agree to these Terms. If you do not agree, do not use the Service.',
  },
  {
    heading: '1.2 Purpose of the Service',
    body: '30 Acts of Kindness™ is designed to encourage acts of kindness, community participation, positive engagement, safe sharing of uplifting content, and optional participation in challenges, reminders, family groups, city competitions, and recognition programs.',
  },
  {
    heading: '1.3 Eligibility',
    body: 'You may use the Service only if:\n\n• You are at least 13 years old\n• You are legally able to enter into a binding agreement, or have permission from a parent or legal guardian where permitted by law\n• You comply with these Terms and applicable law\n\nUsers under 13 are not permitted to use the Service.',
  },
  {
    heading: '1.4 Accounts',
    body: 'You agree to provide accurate information, keep your login credentials secure, and accept responsibility for activity under your account. You may not impersonate another person, organization, family, or city group.',
  },
  {
    heading: '1.5 User Content',
    body: 'You may submit text, stories, titles, comments, profile details, photos, videos, feedback, challenge entries, and other materials ("User Content"). You retain ownership of your User Content, but you grant us a non-exclusive, worldwide, royalty-free license to host, store, review, moderate, display, reproduce, and use it as necessary to operate, improve, secure, administer, and promote the Service.',
  },
  {
    heading: '1.6 Prohibited Conduct',
    body: 'You may not use the Service to post, upload, transmit, or share:\n\n• Profanity, vulgarity, obscene language, or abusive language\n• Pornography, sexually explicit content, or sexually suggestive content\n• Graphic violence, threats, self-harm encouragement, or dangerous acts\n• Hateful, discriminatory, harassing, or bullying content\n• Deceptive, fraudulent, or misleading content\n• Spam, malicious code, bots, scraping tools, or exploit attempts\n• Content you do not have the right to use or share',
  },
  {
    heading: '1.7 Moderation and Enforcement',
    body: 'We may review, remove, restrict, or disable content or accounts that violate these Terms or create risk to users or the Service. We may use automated tools and human review to detect prohibited content.\n\nWe may remove content, issue warnings, suspend accounts, terminate accounts, or disqualify users from contests, rankings, or rewards.',
  },
  {
    heading: '1.8 Challenges, Rewards, and Recognition',
    body: 'We may offer badges, rankings, city challenges, family challenges, completion tracking, and physical recognition items such as bracelets. These features may be changed, paused, or discontinued at any time.',
  },
  {
    heading: '1.9 Donations',
    body: 'The Service may show donation links, QR codes, or payment details for third-party services such as PayPal, Venmo, or Zelle. Donations are voluntary and may be processed by third parties. We are not responsible for failures, delays, disputes, or processing errors caused by those third-party services.',
  },
  {
    heading: '1.10 Notifications',
    body: 'We may send reminders, alerts, or service-related communications through push notifications, email, or in-app messages, depending on your settings. Delivery is not guaranteed.',
  },
  {
    heading: '1.11 Intellectual Property',
    body: 'The Service, excluding User Content, is owned by or licensed to 30ActsofKindness NFP and is protected by applicable intellectual property laws.',
  },
  {
    heading: '1.12 Disclaimer of Warranties',
    body: 'The Service is provided "as is" and "as available." We do not guarantee uninterrupted access, error-free performance, or that all user content will always be accurate, lawful, or appropriate.',
  },
  {
    heading: '1.13 Limitation of Liability',
    body: 'To the fullest extent permitted by law, 30ActsofKindness NFP and its affiliates will not be liable for indirect, incidental, special, consequential, or punitive damages. Our total liability will not exceed the greater of the amount you paid us in the prior 12 months or US $50.',
  },
  {
    heading: '1.14 Indemnification',
    body: 'You agree to indemnify and hold harmless 30ActsofKindness NFP and its affiliates from claims arising out of your use of the Service, your User Content, or your violation of these Terms.',
  },
  {
    heading: '1.15 Suspension and Termination',
    body: 'We may suspend or terminate access to the Service at any time if we believe you violated these Terms, created risk to others, or misused the Service.',
  },
  {
    heading: '1.16 Governing Law',
    body: 'These Terms are governed by the laws of the State of Illinois, without regard to conflict-of-law principles, unless applicable law requires otherwise.',
  },
  {
    heading: '1.17 Venue',
    body: 'Any dispute arising out of or relating to these Terms or the Service shall be brought in the state or federal courts located in Illinois, unless applicable law requires otherwise.',
  },
  {
    heading: '1.18 Contact',
    body: '30ActsofKindness NFP\nEmail: support@30actsofkindness.org',
    email: 'support@30actsofkindness.org',
  },
];

const PRIVACY_POLICY = [
  {
    heading: '2.1 Overview',
    body: 'This Privacy Policy explains how 30ActsofKindness NFP collects, uses, stores, shares, and protects personal information when you use 30 Acts of Kindness™.',
  },
  {
    heading: '2.2 Information We Collect',
    body: 'Information you provide:\n• Name or display name\n• Email address\n• Password or login credentials\n• State, city, timezone, and profile details\n• Challenge entries, titles, stories, comments, and feedback\n• Uploaded photos, videos, and other content\n• Mailing information for bracelets or recognition items, if applicable\n\nInformation collected automatically:\n• Device type, operating system, app version, and language\n• IP address, device identifiers, push tokens, and app activity logs\n• Usage analytics, crash data, and session data\n• Reminder settings and notification interactions',
  },
  {
    heading: '2.3 How We Use Information',
    body: 'We use personal information to:\n• Create and manage accounts\n• Operate the 30-day challenge\n• Calculate daily activity based on timezone\n• Send reminders and service notifications\n• Moderate content and enforce safety rules\n• Support rewards such as bracelets\n• Improve performance, reliability, and user support\n• Prevent fraud, abuse, and misuse\n• Comply with legal obligations',
  },
  {
    heading: '2.3.1 Text Messaging (SMS)',
    body: 'We use text messages (SMS) in two ways. First, for account verification: when you sign in, we send a one-time code to confirm your mobile number. Second, for optional reminders: if you turn on Daily Reminder in the app, we send automated reminder texts to help you log your act of kindness — up to two per day, at the times you choose. Reminders require a separate opt-in, and consent is not a condition of using the app.\n\nMessage frequency varies. Message and data rates may apply. You can opt out of reminders at any time by replying STOP to any reminder text, or by turning Daily Reminder off in the app; reply HELP for help. Opting out of reminders does not affect the verification codes needed to sign in.\n\nWe do not share or sell your mobile phone number or SMS opt-in status to any third party or affiliate for their marketing purposes. Text messages are delivered through our messaging provider (Twilio) solely to provide these messages on our behalf.',
  },
  {
    heading: '2.4 Legal Bases for Processing',
    body: 'Where GDPR or similar law applies, we may process personal data based on consent, performance of a contract, legitimate interests, legal obligation, or protection of vital interests, where applicable.',
  },
  {
    heading: '2.5 Sharing of Information',
    body: 'We may share personal information with hosting, storage, and infrastructure providers; analytics and crash-reporting tools; moderation and fraud-prevention vendors; email, notification, and customer support providers; payment or donation processors; legal authorities where required by law; and professional advisors.\n\nWe do not sell personal information.',
  },
  {
    heading: '2.6 Public Features',
    body: 'Depending on app settings and product design, your display name, city participation, family participation, leaderboard placement, and approved content may be visible to others.',
  },
  {
    heading: '2.7 Data Retention',
    body: 'We retain personal information only as long as reasonably necessary to provide the Service, maintain challenge history, administer contests and bracelets, investigate fraud and safety issues, and comply with legal obligations.',
  },
  {
    heading: '2.8 Security',
    body: 'We use reasonable administrative, technical, and organizational safeguards to protect personal information. However, no system is completely secure, and we cannot guarantee absolute security.',
  },
  {
    heading: '2.9 Your Rights',
    body: 'Depending on your location, you may have the right to access your personal data, correct inaccurate data, request deletion of your account or content, restrict or object to certain processing, request portability of your data, or withdraw consent.\n\nTo make a privacy request, contact: privacy@30actsofkindness.org',
    email: 'privacy@30actsofkindness.org',
  },
  {
    heading: '2.10 Children\'s Privacy / COPPA',
    body: '30 Acts of Kindness™ is not directed to children under 13, and users under 13 are not allowed to use the Service.\n\nWe do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information to us, please contact: privacy@30actsofkindness.org',
    email: 'privacy@30actsofkindness.org',
  },
  {
    heading: '2.11 GDPR Rights',
    body: 'If you are located in the EEA, UK, or another region with similar laws, you may have rights including the right to be informed, right of access, right to rectification, right to erasure, right to restriction of processing, right to data portability, right to object, and rights related to certain automated decision-making.',
  },
  {
    heading: '2.12 International Transfers',
    body: 'If you use the Service from outside the country where our systems are located, your information may be transferred to and processed in other jurisdictions. Where required, we will use appropriate safeguards.',
  },
  {
    heading: '2.13 Changes',
    body: 'We may update this Privacy Policy from time to time and will post the revised version with a new effective date.',
  },
  {
    heading: '2.14 Contact',
    body: '30ActsofKindness NFP\nSupport: support@30actsofkindness.org\nPrivacy: privacy@30actsofkindness.org',
    email: 'support@30actsofkindness.org',
  },
];

const COMMUNITY_GUIDELINES = [
  {
    heading: '3.1 Our Mission',
    body: '30 Acts of Kindness™ is a positive, family-friendly community built around kindness, encouragement, service, and respectful participation.',
  },
  {
    heading: '3.2 What We Encourage',
    body: 'We welcome content that:\n• Celebrates kind acts\n• Supports communities and families\n• Shares uplifting stories\n• Motivates healthy participation\n• Encourages generosity, respect, and gratitude',
  },
  {
    heading: '3.3 What Is Not Allowed',
    body: 'Language and behavior:\n• Profanity, obscene or vulgar language\n• Insults, threats, or harassment\n• Hateful or discriminatory language\n• Bullying or intimidation\n\nSexual content:\n• Pornography or sexually explicit content\n• Sexual nudity or sexually suggestive content\n• Sexual exploitation or solicitation\n\nViolence and danger:\n• Graphic violence or cruelty\n• Violent threats or self-harm encouragement\n• Dangerous or illegal acts framed as challenges\n\nFraud and dishonesty:\n• Fake submissions or impersonation\n• Spam or scams\n• Leaderboard manipulation or false donation claims\n\nPrivacy violations:\n• Posting someone else\'s private information without permission\n• Uploading content you do not have the right to share',
  },
  {
    heading: '3.4 Compete with Kindness',
    body: 'Family and city competition should remain respectful and friendly. Rivalry is allowed; hostility is not.',
  },
  {
    heading: '3.5 Authentic Participation',
    body: 'Submit only acts you actually completed. Do not upload fake, stolen, manipulated, or misleading proof.',
  },
  {
    heading: '3.6 Reporting',
    body: 'Users may report content or behavior that violates these rules. We may review reports and take action.',
  },
  {
    heading: '3.7 Consequences',
    body: 'Violations may result in:\n• Content removal\n• Temporary restrictions\n• Loss of contest eligibility\n• Suspension or permanent removal',
  },
];

const CONTENT_MODERATION = [
  {
    heading: '4.1 Purpose',
    body: 'This Content Moderation Policy explains how we identify, review, restrict, and remove content that violates our rules or creates safety risk.',
  },
  {
    heading: '4.2 Scope',
    body: 'This policy applies to:\n• Stories and text submissions\n• Photos and videos\n• Profile names and bios\n• Comments and support submissions\n• Family and city identifiers\n• Contest entries and reward claims',
  },
  {
    heading: '4.3 Moderated Categories',
    body: 'We may restrict or remove content involving:\n• Profanity and obscenity\n• Pornography and sexually explicit material\n• Nudity or sexually suggestive content\n• Graphic violence or disturbing imagery\n• Hate speech, slurs, threats, and harassment\n• Illegal activity\n• Fraud, impersonation, spam, and manipulation',
  },
  {
    heading: '4.4 Moderation Methods',
    body: 'We may use:\n• Automated screening tools\n• Keyword detection\n• Image and video safety classifiers\n• Human moderators\n• Escalation and appeals review where available',
  },
  {
    heading: '4.5 Review Outcomes',
    body: 'Content may be:\n• Approved\n• Flagged for review\n• Limited in visibility\n• Removed\n• Escalated for account action',
  },
  {
    heading: '4.6 Account Enforcement',
    body: 'Users who repeatedly or seriously violate policy may receive:\n• Warnings\n• Temporary posting restrictions\n• Contest disqualification\n• Suspension\n• Permanent ban',
  },
  {
    heading: '4.7 Appeals',
    body: 'If an appeal channel is offered, users may request review by contacting support@30actsofkindness.org. Appeal outcomes are final unless required otherwise by law.',
    email: 'support@30actsofkindness.org',
  },
  {
    heading: '4.8 Recordkeeping',
    body: 'We may retain moderation records, flags, notes, timestamps, and enforcement history for safety, fraud prevention, audits, legal compliance, and appeals.',
  },
  {
    heading: '4.9 Zero-Tolerance Content',
    body: 'We may apply immediate removal and strong enforcement for:\n• Pornography\n• Child sexual abuse material\n• Credible threats of violence\n• Severe harassment or hate content\n• Fraud related to donations, contests, or rewards',
  },
];

export const LEGAL_DOCS = {
  terms:      { title: 'Terms of Service',         sections: TERMS_OF_SERVICE },
  privacy:    { title: 'Privacy Policy',            sections: PRIVACY_POLICY },
  guidelines: { title: 'Community Guidelines',      sections: COMMUNITY_GUIDELINES },
  moderation: { title: 'Content Moderation Policy', sections: CONTENT_MODERATION },
};

// ── Screen ────────────────────────────────────────────────────────────────────
export default function LegalScreen({ route, navigation }) {
  const { docKey } = route.params;
  const doc = LEGAL_DOCS[docKey];

  if (!doc) return null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={doc.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.lastUpdated}>Effective: April 2026</Text>
        {doc.sections.map((section, i) => (
          <View key={i} style={s.section}>
            <Text style={s.heading}>{section.heading}</Text>
            <Text style={s.body}>{section.body}</Text>
            {section.email && (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${section.email}`)}>
                <Text style={s.emailLink}>{section.email}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <View style={s.footer}>
          <Text style={s.footerText}>© 2026 30ActsofKindness NFP</Text>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:support@30actsofkindness.org')}>
            <Text style={s.emailLink}>support@30actsofkindness.org</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  lastUpdated: { color: C.muted, fontSize: 12, marginBottom: 20, fontStyle: 'italic' },
  section: {
    marginBottom: 24, borderBottomWidth: 1,
    borderBottomColor: C.border + '44', paddingBottom: 20,
  },
  heading: {
    color: C.primary, fontSize: 14, fontWeight: '800',
    marginBottom: 10, letterSpacing: 0.3,
  },
  body: { color: C.sub, fontSize: 14, lineHeight: 22 },
  emailLink: {
    color: C.primary, fontSize: 13, fontWeight: '600',
    marginTop: 6, textDecorationLine: 'underline',
  },
  footer: { alignItems: 'center', paddingTop: 16, gap: 8 },
  footerText: { color: C.muted, fontSize: 12 },
});