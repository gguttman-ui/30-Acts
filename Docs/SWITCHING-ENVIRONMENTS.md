# Switching between production and staging

**Written Wednesday, September 16, 2026**

Two databases, one app. This is how to move between them without guessing, and
what to hand testers.

---

## The one rule

Both versions use the same bundle identifier, `org.30actsofkindness.app`, so iOS
treats them as the same app. **Only one can be installed at a time.** Switching
means delete, then install the other. There is no way around this until backlog
item 26 (a separate bundle id for staging) is done.

---

## The two environments

| | Production | Staging |
|---|---|---|
| Database | mtfyekdxtkdiaqbgaoza | rhalruwxylggkrebyesf |
| How you install it | TestFlight | Expo install link / QR |
| EAS channel | `production` | `preview` |
| Who can install | any TestFlight tester | only registered devices |
| Purpose | the real thing | anything you would not want on the real thing |

---

## Getting to PRODUCTION

1. Delete the app from the phone.
2. Open TestFlight, install 30 Acts of Kindness.
3. Sign in with your real phone number and the SMS code.

## Getting to STAGING

1. Delete the app from the phone.
2. On the laptop, open the build page on expo.dev and click **Install** - a QR
   code appears in the dialog.
3. Scan it with the iPhone camera, tap the notification, tap Install.
4. Sign in with **+1 555 010 0100 / 123456** (see the login note below).

The build page: expo.dev, account garywg, project 30-acts-of-kindness, Builds.
Use the most recent iOS internal distribution build.

---

## Pushing a code change to staging

Once the staging app is installed, you do NOT need to rebuild for JavaScript
changes. Publish an over-the-air update instead:

```
npx eas update --branch preview --environment preview --message "what changed"
```

**`--environment preview` is not optional.** Leave it off and the update is
published with PRODUCTION's database values, and your staging app silently
starts writing to the live database. This cost an afternoon on Sep 16. A build
reads its values from `eas.json`; an update does not, and has to be told.

Then on the phone:

- Force-close the app, open it. (this downloads the update)
- Force-close again, open it. (this applies it)

Two launches, every time. One launch looks like nothing happened.

**Never publish to `--branch production`** until after Release This Version is
pressed. The App Store build reads that channel, and an update there reaches
real users immediately with no review and no gate.

---

## How to tell which one you are on

Three checks, weakest to strongest.

**1. Settings screen build stamp.** Bottom of Settings: `v1.0.0 · preview ·
update <id>`. `preview` means the staging build, `production` means the store
build. This tells you which BUILD you have, not which database it is talking
to - those came apart on Sep 16.

**2. Look at the data.** Staging has years of history: 75+ lifetime acts, a
completed Jul 27 - Aug 25 streak. Production was wiped on Sep 15 and holds only
what has been logged since. If the dashboard is nearly empty, you are on
production.

**3. The definitive test.** On the laptop, log an act and then compare:

```
psql $STG -c "select count(*) from completions;"
psql $PROD -c "select count(*) from completions;"
```

Whichever number moved is the database you are writing to. Nothing else is
proof.

(If `$STG` and `$PROD` are not set in that PowerShell window, see
HANDOFF20260915-PM.md section 5 for the connection strings.)

---

## Logging in on staging

Staging has no SMS provider configured, so **real phone numbers cannot receive a
verification code there**. Two consequences:

- Use the bypass account **+1 555 010 0100 / 123456**. It signs in without SMS.
- Signing up with a real number on staging will not work.

If real-number testing on staging is ever needed, the Auth phone provider has to
be configured on the staging project with the Twilio credentials. That is a
dashboard form, about five minutes, and it would send real texts.

Also not set up on staging: storage buckets. Not used by the current app.

---

## Testers

**As it stands, the testers cannot use staging.** Two reasons, and both need
solving before it is worth sending them anything.

**1. Their devices are not registered.** Preview builds install only on devices
registered against the Apple developer account. Today only Gary's iPhone is.
Registering others:

```
npx eas device:create
```

Choose the URL/QR option. It produces a link you send them; they open it on the
iPhone, install a small profile, and their device is registered. Then **the
build has to be remade** - a build only carries the devices that existed when it
was made. Apple allows 100 registered iPhones per membership year.

**2. They cannot log in.** Per the section above, staging has no SMS. They would
all have to share the one bypass account, which makes most testing meaningless -
one account, one streak, one set of data.

**So the realistic options are:**

- **Testers stay on production (TestFlight), Gary alone uses staging.** This is
  the current arrangement and it works. Staging is for trying things that should
  not touch real data; testers are exercising the real thing, which is what you
  want them doing before launch anyway.
- **Or make staging usable for them**: configure the Auth SMS provider on
  staging, register their four devices, and rebuild. Perhaps an hour, and then
  staging becomes a genuine shared test environment.

The first is right for now. The second is worth doing after launch, when there
are real users on production and you no longer want testers poking at it.

---

## What to send testers (production, TestFlight)

Paste-ready:

> The app is on TestFlight. If you already have it installed, delete it first -
> that makes sure you get the current version.
>
> 1. Open TestFlight on your iPhone
> 2. Install 30 Acts of Kindness
> 3. Open it and sign up with your mobile number
> 4. You will get a text with a code - enter it
>
> Your old account and history are gone - the database was reset before launch,
> so everyone starts fresh. Log an act each day and tell me anything that looks
> wrong, however small.
>
> If the code text does not arrive within a minute or two, tell me rather than
> requesting it repeatedly.

---

## The trap, restated

The thing that went wrong on Sep 16, in one line, because it will happen again
otherwise:

**A build gets its database from `eas.json`. An update gets its database from
the EAS environment, and only if you pass `--environment preview`.**

Both are now set to staging, so they agree. If someone changes one and not the
other, the app silently talks to the wrong database and nothing on screen says
so.
