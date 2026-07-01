# 30 Acts of Kindness — website (single page, for GoDaddy cPanel)

Plain HTML/CSS/JS. No build step. One page; the top menu scrolls to each section.

## Files
- index.html — the entire site (Home, The App, About, Contact, Donate sections)
- styles.css — styles
- site.js — mobile menu, donate selection, waitlist form
- favicon.svg — site icon
- assets/ — photos and the kindness-tree image

## See it on your own computer first
Right-click index.html → Open with → your browser (Chrome/Edge).

## Put it live (cPanel → File Manager)
1. cPanel → File Manager → open public_html.
2. Upload the whole site (easiest: upload the .zip, then right-click → Extract).
3. Make sure index.html and the assets folder sit directly inside public_html.
4. Delete any old index.html / parked "coming soon" page.
5. Visit https://30actsofkindness.org

## Two things to set before launch
1. Donation link — in index.html find #REPLACE_WITH_DONATION_LINK and paste your
   real donation URL (Donorbox / PayPal / Givebutter / Stripe).
2. Waitlist form — in site.js find REPLACE_WITH_FORM_ID and paste your form endpoint
   (e.g. Formspree). Until then, the button opens a pre-filled email to
   info@30actsofkindness.org with the person's email/phone/ZIP.

## Org details on the site
30ActsofKindness NFP · 501(c)(3) · EIN 41-4058016 · 130 N Garland Ct, Unit 3404, Chicago, IL 60602
