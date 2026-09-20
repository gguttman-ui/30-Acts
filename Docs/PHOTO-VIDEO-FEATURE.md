# Photo and video proof — what exists, and what to watch when it comes back

Written 20 September 2026, while turning the feature's permissions off for the
1 October release. Photo and video proof are **planned for a future release**,
possibly months away. Nothing has been deleted. This note exists so the work
isn't rediscovered from scratch, and so the traps are known in advance.

---

## What is implemented, and where

**`src/screens/DailyActScreen.js`** — 91 KB, complete and working as of the
last time it was reachable. It holds the whole feature:

| what | roughly where |
|---|---|
| Proof type tabs — 📷 Photo / 🎥 Video / ✍️ Story | ~line 1479 |
| Camera and Library buttons, `pickMedia(useCamera)` | ~line 953, UI ~1495 |
| `ImagePicker.launchCameraAsync` / `launchImageLibraryAsync` | ~line 966 |
| Media preview with remove control | ~line 1501 |
| Upload to the `act-media` Supabase bucket | ~line 1100–1111 |
| `has_media` written onto the completion row | ~line 1226 |
| Signed-URL read back of stored media | ~line 515, ~line 1284 |
| Save gating — `mediaValid` blocks save until media attached | ~line 555 |
| Audio playback via `expo-av` | ~line 232–241 |

**The screen is registered but unreachable.** `src/navigation/index.js` still
imports it and declares `<Stack.Screen name="DailyAct">`, but **nothing
navigates to `DailyAct`** — verified 20 Sep by searching the whole of `src/`
and `App.js`. The comment above the route describes a flow that no longer
exists; the live path is MyStory. So the screen is intact, wired, and simply
not routed to. Restoring the feature starts with routing to it again.

**Do not delete this file** in a dead-code sweep. That is the single biggest
risk to the work.

---

## What was turned off on 20 September 2026

In `app.json` only — no code was touched:

- Removed `NSCameraUsageDescription`.
- Removed the `expo-image-picker` plugin block from `plugins`.
- **Kept** `expo-image-picker` in `package.json`, so the unreachable screen
  still resolves at bundle time.

To bring the feature back, put both back. They are one-line restorations and
they are in git history (commit for item 19, 20 Sep 2026).

### One thing that was deliberately NOT removed

`NSPhotoLibraryUsageDescription` looks like part of this feature — its old
wording even said "attach photos/videos as proof" — but it is **required by
live code**. MyStory, History and Certificate all call
`MediaLibrary.requestPermissionsAsync()` with no argument, which asks iOS for
*full* photo-library access in order to save a share card to the camera roll
for Instagram and TikTok. Remove that string and share-to-Instagram breaks.

The string was reworded on 20 Sep to describe what it is actually used for. If
you ever want it gone, those three calls must first become
`requestPermissionsAsync(true)` (write-only), and that needs a device test.

---

## Traps waiting for you

These are the reasons the code may not simply work when re-enabled. None are
hard; all are easy to lose an afternoon to.

### 1. `expo-av` is on its way out

`DailyActScreen.js` imports `Video, ResizeMode, Audio` from `expo-av`
(currently `~16.0.8` on SDK 54). Expo is retiring `expo-av` in favour of
`expo-video` and `expo-audio`. On whichever SDK upgrade drops it, those imports
break — in a file nobody is exercising, so nothing will warn you until you
route to it again.

### 2. `ImagePicker.MediaTypeOptions` is deprecated

Line ~963 uses `ImagePicker.MediaTypeOptions.Videos` / `.Images`. Newer
`expo-image-picker` replaces that with `mediaTypes: ['images']` style values.
Currently `~17.0.11`; expect this to need updating.

### 3. The `act-media` bucket's policies were changed after this code was written

On 17 September 2026 (backlog item 32) four "demo" policies that granted the
PUBLIC role SELECT, INSERT, UPDATE and DELETE on `storage.objects` were dropped
from production. That closed a real security hole, and it was the right call —
but the upload path in this screen was written while those policies existed.

**Before trusting the upload, re-check that a signed-in user can actually
INSERT into `act-media`, and add a proper authenticated policy if not.** Test
it rather than reasoning about it; the failure will look like a silent upload
failure, not an error.

Related: a bucket's `public` flag serves GETs *without* consulting RLS, so
public readability and RLS are separate questions. Decide deliberately whether
stored act media should be publicly readable by URL.

### 4. Storage limits are still unset — backlog item 31

`act-media` has no `file_size_limit` and no `allowed_mime_types`. Harmless
while nothing uploads. The moment video comes back, it isn't: a phone video can
be hundreds of megabytes. Set both before re-enabling.

### 5. The privacy policy no longer mentions photos or videos

On 17–18 September the website and in-app privacy policies were corrected on
the basis that media collection was gone. Section 2.2 now lists what is
collected and **does not include photos or videos**, and `TESTING.md` check 11
actively verifies that absence.

When the feature returns, that has to be put back — in `src/screens/
LegalScreen.js`, in the website's `privacy.html`, in the App Privacy
declaration in App Store Connect, and the TESTING.md check needs inverting.
Shipping media collection with a policy that says otherwise is a real problem,
not a tidiness one.

### 6. Retention and deletion — backlog items 5 and 17

Hosted share cards and account deletion both have open questions about stored
media. Re-enabling uploads makes those live rather than theoretical. Read those
two items before shipping.

---

## The short version

The code is safe. What will cost you time is: a deprecated `expo-av`, a
changed `ImagePicker` API, storage policies that were tightened underneath the
upload path, missing bucket limits, and a privacy policy that now says you
don't collect the thing you'd be collecting.

Start by routing to `DailyAct` again and walking the flow on staging. The gaps
will surface in that order.
