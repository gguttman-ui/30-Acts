// ---- Mobile nav toggle ----
(function () {
  var btn = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close the menu after tapping a link (single-page nav)
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

// ---- Donate amount selection (visual only; real charge happens at your donation link) ----
(function () {
  var amounts = document.querySelectorAll('.amount');
  amounts.forEach(function (a) {
    a.addEventListener('click', function () {
      amounts.forEach(function (x) { x.style.borderColor = ''; x.style.background = ''; });
      a.style.borderColor = 'var(--green)';
      a.style.background = 'var(--green-tint)';
    });
  });
})();

// ---- Waitlist form (name + country + phone + zip, stored in Supabase) ----
(function () {
  var wf = document.getElementById('waitlist-form');
  if (!wf) return;

  var SUPABASE_URL = "https://mtfyekdxtkdiaqbgaoza.supabase.co";
  var SUPABASE_KEY = "sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9";
  var FALLBACK_EMAIL = "info@30actsofkindness.org";

  var first   = document.getElementById('wl-first');
  var last    = document.getElementById('wl-last');
  var country = document.getElementById('wl-country');
  var phone   = document.getElementById('wl-phone');
  var zip     = document.getElementById('wl-zip');
  var email   = document.getElementById('wl-email');
  var msg     = document.getElementById('waitlist-msg');

  var lpn = window.libphonenumber || null;
  var validEmail = function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); };

  function say(text, kind) {
    msg.textContent = text;
    msg.style.color = kind === 'ok' ? 'var(--green-deep)' : kind === 'busy' ? 'var(--ink-soft)' : 'var(--coral)';
  }

  country.addEventListener('change', function () {
    var opt = country.options[country.selectedIndex];
    if (opt && opt.getAttribute('data-ph')) phone.placeholder = opt.getAttribute('data-ph');
    phone.value = '';
    lastLen = 0;
  });

  var lastLen = 0;
  phone.addEventListener('input', function () {
    if (!lpn) return;
    var deleting = phone.value.length < lastLen;
    if (!deleting) { phone.value = new lpn.AsYouType(country.value).input(phone.value); }
    lastLen = phone.value.length;
  });

  wf.addEventListener('submit', function (e) {
    e.preventDefault();
    var fn = (first.value || '').trim();
    var ln = (last.value || '').trim();
    var ct = country.value;
    var ph = (phone.value || '').trim();
    var zp = (zip.value || '').trim();
    var em = (email.value || '').trim();

    if (!fn) { say('Please enter your first name.'); first.focus(); return; }
    if (!ln) { say('Please enter your last initial.'); last.focus(); return; }
    if (!ph) { say('Please enter your phone number.'); phone.focus(); return; }
    if (!zp) { say('Please enter your ZIP or postal code.'); zip.focus(); return; }
    if (em && !validEmail(em)) { say("That email doesn't look right - leave it blank or fix it."); email.focus(); return; }

    var e164;
    if (lpn) {
      if (!lpn.isValidPhoneNumber(ph, ct)) { say("That phone number doesn't look valid for the country you selected."); phone.focus(); return; }
      e164 = lpn.parsePhoneNumber(ph, ct).number;
    } else {
      e164 = ph.replace(/[^\d+]/g, '');
    }

    if (!window.supabase || !window.supabase.createClient) {
      say('Sign-up is temporarily unavailable - please email ' + FALLBACK_EMAIL + '.');
      return;
    }

    say('Joining...', 'busy');
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    sb.from('waitlist').insert({
      first_name: fn,
      last_name: ln,
      phone: e164,
      zip: zp,
      email: em || null
    }).then(function (res) {
      if (res.error) {
        if (res.error.code === '23505') {
          wf.reset(); lastLen = 0;
          say("You're already on the list - see you at launch!", 'ok');
        } else {
          say('Something went wrong - email ' + FALLBACK_EMAIL + " and we'll add you.");
        }
        return;
      }
      wf.reset(); lastLen = 0;
      say("You're on the list - thanks! We'll be in touch.", 'ok');
    }).catch(function () {
      say('Something went wrong - email ' + FALLBACK_EMAIL + " and we'll add you.");
    });
  });
})();
// ---- Scroll-spy: highlight the nav tab for the section in view ----
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'))
    .filter(function (a) { var h = a.getAttribute('href'); return h && h.charAt(0) === '#'; });
  if (!links.length || !('IntersectionObserver' in window)) return;

  var map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  var sections = Object.keys(map)
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  function setActive(id) {
    links.forEach(function (a) { a.classList.remove('active'); });
    if (map[id] && !map[id].classList.contains('btn')) map[id].classList.add('active');
  }

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(function (s) { obs.observe(s); });
})();
