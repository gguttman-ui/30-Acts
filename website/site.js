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

// ---- Waitlist form (email + phone + zip) ----
(function () {
  var wf = document.getElementById('waitlist-form');
  if (!wf) return;

  // ── Paste your form endpoint here (e.g. Formspree: https://formspree.io/f/abcdwxyz) ──
  var ENDPOINT = "https://formspree.io/f/REPLACE_WITH_FORM_ID";
  var FALLBACK_EMAIL = "info@30actsofkindness.org";

  var email = document.getElementById('wl-email');
  var phone = document.getElementById('wl-phone');
  var zip   = document.getElementById('wl-zip');
  var msg   = document.getElementById('waitlist-msg');
  var validEmail = function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); };

  wf.addEventListener('submit', function (e) {
    e.preventDefault();
    var em = (email.value || '').trim();
    var ph = (phone.value || '').trim();
    var zp = (zip.value || '').trim();

    if (!validEmail(em)) { msg.textContent = 'Please enter a valid email.'; msg.style.color = 'var(--coral)'; return; }

    // No endpoint configured yet → open a pre-filled email instead
    if (ENDPOINT.indexOf('REPLACE_WITH_FORM_ID') !== -1) {
      var body = 'Please add me to the 30 Acts waitlist:%0D%0AEmail: ' + encodeURIComponent(em) +
                 '%0D%0APhone: ' + encodeURIComponent(ph) + '%0D%0AZIP: ' + encodeURIComponent(zp);
      window.location.href = 'mailto:' + FALLBACK_EMAIL + '?subject=' +
        encodeURIComponent('30 Acts waitlist signup') + '&body=' + body;
      return;
    }

    msg.textContent = 'Joining…'; msg.style.color = 'var(--ink-soft)';
    fetch(ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(wf) })
      .then(function (r) {
        if (!r.ok) throw new Error();
        wf.reset();
        msg.textContent = "You're on the list — thanks! We'll be in touch.";
        msg.style.color = 'var(--green-deep)';
      })
      .catch(function () {
        msg.textContent = 'Something went wrong — email ' + FALLBACK_EMAIL + ' and we\'ll add you.';
        msg.style.color = 'var(--coral)';
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
