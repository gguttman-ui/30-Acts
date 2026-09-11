# Age rating questionnaire — filled out for review

**30 Acts of Kindness · Wednesday, September 2, 2026**

App Store Connect → your app → **App Information** → **Age Rating** → Edit.

Every answer below is checked against what the app actually does, with the
reason next to it so you can disagree where you know better. Apple's live form
is the authority on wording — match by **meaning**, not by exact phrasing, and
tell me if a question appears that isn't on this sheet.

**Expected result: 4+ in every region.**

---

## Step 1 — In-App Controls

Whether the app itself lets someone restrict what is available.

| Question | Answer | Why |
|---|---|---|
| Parental controls / content restriction settings | **No** | There is nothing to restrict — every user sees only their own content. |
| Age assurance or age verification | **No** | Signup asks for a phone number and ZIP, never an age. |

## Step 2 — Capabilities

This is the section that decides most ratings. Answer carefully.

| Question | Answer | Why |
|---|---|---|
| Unrestricted web access / built-in browser | **No** | No WebView anywhere in the app. The Donate button opens one fixed PayPal URL in Safari, which is not web browsing. |
| User-generated content | **Yes** | People write act titles and stories and attach photos. Apple's definition is narrower than plain English — "the **broad distribution** of content created by users" — so a strict reading says No, because nothing is distributed to anyone. Answer **Yes** anyway: it costs nothing (UGC is a 4+ capability and does not raise the rating) and it means a reviewer looking at the story field can never say you concealed it. |
| Age assurance | **No** | You never ask for or check an age. |
| Messaging, chat, or user-to-user communication | **No** | There is none. Sharing an act to Messages or Instagram hands it to another app; it is not communication inside yours. |
| Location sharing with other users | **No** | No location permission is requested at all. The ZIP typed at signup sets a time zone. |
| In-app purchases | **No** | The app is free. PayPal and Zelle are outside the app; the bracelet is a physical item. |
| Third-party advertising | **No** | No ad SDK. The Meta SDK is present for the Facebook share sheet only, with app-event logging and advertiser-ID collection both disabled. |

> **Yes to user-generated content does not push you above 4+ on its own.** What
> raises a rating is UGC that other users can *see*. Yours is private, which is
> why the next answer matters more than this one.

## Step 3 — Mature Themes

| Question | Answer |
|---|---|
| Profanity or crude humour | **None** |
| Horror or fear themes | **None** |
| Alcohol, tobacco, or drug use or references | **None** |
| Mature or suggestive themes | **None** |

The act library is 183 entries, all of them things like "Told a parent they're
doing a great job". Nothing in it touches these categories.

## Step 4 — Medical or Wellness

| Question | Answer | Why |
|---|---|---|
| Health, wellness, or medical information | **None** | The app records kind acts. It gives no health guidance, no symptom or treatment information, and makes no wellbeing claims. |
| Mental health or crisis content | **None** | None present. |

> If you list the app under **Health & Fitness**, expect this section to be read
> closely. **Lifestyle** is the safer primary category and describes the app
> better. Your call.

## Step 5 — Sexuality or Nudity

| Question | Answer |
|---|---|
| Sexual content or nudity | **None** |
| Graphic sexual content | **None** |

## Step 6 — Violence

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | **None** |
| Realistic violence | **None** |
| Prolonged graphic or sadistic violence | **None** |

## Step 7 — Chance-Based Activities

| Question | Answer |
|---|---|
| Simulated gambling | **None** |
| Contests | **None** |
| Gambling | **None** |
| Loot boxes | **None** |

> "Contests" means prize competitions. A 30-day personal streak is not one.

## Step 8 — Social media  ⚠ NEW, REQUIRED FROM 7 SEPTEMBER 2026

Apple added these in July. From **7 September** you cannot submit without
answering them.

**These are not free-standing questions — they are locked together**, and
answering the second one Yes on its own produces this error at Step 7:

> If your app contains Social Media, but disabled for users under 13, you must
> choose Yes for Social Media, User-Generated Content, and Age Assurance.

| Item | Answer | Apple's definition, and why |
|---|---|---|
| Social Media | **No** | "Redistribution, amplification, or interaction with user-generated content through a social feed or similar discovery method that visibly spreads content to many users." You have no feed, no discovery, no likes, no comments, no resharing. |
| Social Media Disabled for Users Under 13 | **No** | This is not "we don't have social media". It is a *claim to have built a control*: Apple requires the app to call the Declared Age Range API and serve only age-appropriate UGC. You do neither. Answering Yes forces Social Media, UGC and Age Assurance all to Yes and lands you at 13+. |
| Age Assurance | **No** | "Mechanism to confirm an individual's age" — declared age range API, age estimation, ID checks. You ask for a phone number and a ZIP, never an age. |

**Both social media items are 13+ triggers.** They are the only capabilities in
this section that raise the rating; user-generated content, messaging, parental
controls and age assurance all sit at the 4+ tier. So if your calculated rating
comes out as 13+, one of these two is the reason.

## Step 9 — Minimum age override

Apple offers a manual override if your own policy sets a higher minimum age
than the questionnaire produces.

**Leave it unset**, unless you decide to make the app 13+ (see below).

---

# The one decision this sheet cannot make for you

The questionnaire is about content. **COPPA is about data**, and it is a
different question with a different answer.

Signup collects a phone number, a first and last name, a ZIP code, and
optionally photos. If a child under 13 creates their own account, you have what
the law calls "actual knowledge" that you are collecting a child's personal
information, and you need verifiable parental consent before you collect any of
it. The rule tightened again in April 2026: separate consent for sharing with
third parties, named recipients in the privacy notice, and retention limits.
You share data with Supabase, Twilio, Sentry, Branch and Meta.

You have two clean positions, and one messy one:

**A. The account belongs to the parent.** The parent signs up with their own
phone number and does the challenge together with their child. No child ever
creates an account, so COPPA is not triggered. This matches what the parents
you spoke to actually want, and it costs you nothing but a sentence in the
terms and the privacy policy.

**B. 13 and over.** Say so in the terms, set the App Store minimum age to 13+,
and turn away the audience that is asking for you.

**C. Say nothing.** Children sign up with their own phones, you now have their
data, and you are out of compliance without having decided to be.

**A is the right answer for this app.** What it needs from you is one line in
the terms and one in the privacy policy on the website — something like:

> Accounts are for adults. A parent or guardian may use their account together
> with their child; we do not knowingly collect personal information from
> children under 13.

Then the questionnaire stays 4+, parents can use it with their kids exactly as
they asked, and nobody is signing up children behind your back.

I am not a lawyer, and you are actively recruiting an audience of children —
that combination is worth twenty minutes of a real one's time before you
launch, not after.

---

## Sources

- [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf) — Apple Developer
- [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating) — App Store Connect help
- [Apple's new social media age rating questions](https://asoworld.com/en/blog/apple-s-new-social-media-age-rating-questions-how-to-answer-them-before-september-7-2026/) — 7 September 2026 deadline
- [COPPA rule amendments, April 2026](https://privacylawmap.com/blog/coppa-rule-amendments-april-2026-compliance-checklist)
