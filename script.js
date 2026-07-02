// =============================================
// HAMBURGER MENU
// =============================================
(function () {
  var btn  = document.getElementById('navHamburger');
  var menu = document.getElementById('navMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', function () {
    var isOpen = menu.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', isOpen);
  });

  // Close menu when any nav link is clicked
  menu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      menu.classList.remove('open');
      btn.classList.remove('open');
    });
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
      btn.classList.remove('open');
    }
  });
})();


// =============================================
// SAVE THE DATE POPUP
// =============================================
(function () {
  var overlay = document.getElementById('stdOverlay');
  var btn     = document.getElementById('stdEnter');
  if (!overlay || !btn) return;

  // Prevent scroll while popup is open
  document.body.style.overflow = 'hidden';

  btn.addEventListener('click', function () {
    overlay.classList.add('hide');
    setTimeout(function () {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }, 700);
  });
})();


// =============================================
// INTERACTIVE MAP VENUE SWITCHER
// =============================================
(function () {
  var tabs = document.querySelectorAll('.map-venue-card');
  var iframe = document.getElementById('mapIframe');
  if (!tabs.length || !iframe) return;

  var urls = {
    ceremony:  "https://maps.google.com/maps?q=St+Mary's+Episcopal+Cathedral+300+Great+Western+Road+Glasgow+G4+9JB&output=embed&z=16",
    reception: "https://maps.google.com/maps?q=Enish+Restaurant+186+Bath+Street+Glasgow+G2+4HG&output=embed&z=16"
  };

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var venue = tab.dataset.venue;
      iframe.style.opacity = '0';
      iframe.style.transition = 'opacity 0.3s ease';
      setTimeout(function () {
        iframe.src = urls[venue];
        iframe.style.opacity = '1';
      }, 300);
    });
  });
})();


// =============================================
// WISHES WALL
// =============================================
(function () {
  var form   = document.getElementById('wishesForm');
  var wall   = document.getElementById('wishesWall');
  var nameEl = document.getElementById('wishName');
  var textEl = document.getElementById('wishText');
  if (!form || !wall) return;

  var STORAGE_KEY = 'or_wedding_wishes';

  var colors = ['#b8965a', '#8c6e38', '#6b4e1e', '#9a7a4a', '#c4a46b'];

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return mins + ' minute' + (mins > 1 ? 's' : '') + ' ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24)  return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
    return Math.floor(hrs / 24) + ' day(s) ago';
  }

  function renderCard(wish, prepend) {
    var card = document.createElement('div');
    card.className = 'wish-card';
    card.style.borderTopColor = colors[Math.floor(Math.random() * colors.length)];
    card.innerHTML =
      '<div class="wish-card-name">' + wish.name + '</div>' +
      '<div class="wish-card-text">"' + wish.text + '"</div>' +
      '<div class="wish-card-time">' + timeAgo(wish.ts) + '</div>';
    if (prepend) {
      wall.insertBefore(card, wall.firstChild);
    } else {
      wall.appendChild(card);
    }
  }

  function loadWishes() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      saved.forEach(function (w) { renderCard(w, false); });
    } catch(e) {}
  }

  function saveWish(wish) {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      saved.unshift(wish);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 50)));
    } catch(e) {}
  }

  loadWishes();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = nameEl.value.trim();
    var text = textEl.value.trim();
    if (!name || !text) return;

    var wish = { name: name, text: text, ts: Date.now() };
    saveWish(wish);
    renderCard(wish, true);
    form.reset();
    wall.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();


// =============================================
// HERO SPLIT-SCREEN PHOTO CYCLE
// =============================================
(function () {
  var photos = document.querySelectorAll('.hero-photo');
  var dots   = document.querySelectorAll('.hero-dot');
  if (!photos.length) return;

  var current = 0;

  function goTo(idx) {
    photos[current].classList.remove('active');
    dots[current] && dots[current].classList.remove('active');
    current = idx;
    photos[current].classList.add('active');
    dots[current] && dots[current].classList.add('active');
  }

  // Auto-advance every 5s
  var timer = setInterval(function () {
    goTo((current + 1) % photos.length);
  }, 5000);

  // Dot click
  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      clearInterval(timer);
      goTo(parseInt(this.dataset.idx, 10));
    });
  });

  // Activate first
  photos[0].classList.add('active');
})();


// =============================================
// COUNTDOWN TIMER
// =============================================
function updateCountdown() {
  var target = new Date('2026-08-01T12:00:00').getTime();
  var now    = Date.now();
  var diff   = target - now;

  if (diff <= 0) {
    document.getElementById('countdown').innerHTML =
      '<p style="color:var(--gold-light);font-family:var(--font-serif);font-size:1.4rem;font-style:italic;">Today is the day! 🎉</p>';
    return;
  }

  document.getElementById('days').textContent    = String(Math.floor(diff / 86400000)).padStart(2,'0');
  document.getElementById('hours').textContent   = String(Math.floor((diff % 86400000) / 3600000)).padStart(2,'0');
  document.getElementById('minutes').textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0');
  document.getElementById('seconds').textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2,'0');
}
updateCountdown();
setInterval(updateCountdown, 1000);


// =============================================
// NAVBAR SCROLL EFFECT
// =============================================
window.addEventListener('scroll', function () {
  var nav = document.getElementById('navbar');
  nav.style.background = window.scrollY > 60
    ? 'rgba(12,10,7,0.98)'
    : 'rgba(18,16,13,0.92)';
});


// =============================================
// ACTIVE NAV LINK
// =============================================
var sections = document.querySelectorAll('section[id], div.parallax-banner');
var navLinks = document.querySelectorAll('.nav a');

window.addEventListener('scroll', function () {
  var pos = window.scrollY + 120;
  sections.forEach(function (sec) {
    if (sec.offsetTop <= pos && sec.offsetTop + sec.offsetHeight > pos) {
      navLinks.forEach(function (a) { a.style.color = ''; });
      var active = document.querySelector('.nav a[href="#' + sec.id + '"]');
      if (active) active.style.color = 'var(--gold-light)';
    }
  });
});


// =============================================
// HORIZONTAL FILM STRIP — DRAG + BUTTONS
// =============================================
(function () {
  var strip = document.getElementById('filmStrip');
  if (!strip) return;

  var prev = document.getElementById('stripPrev');
  var next = document.getElementById('stripNext');
  var frameW = 312; // frame width + gap

  prev && prev.addEventListener('click', function () {
    strip.scrollBy({ left: -frameW * 2, behavior: 'smooth' });
  });
  next && next.addEventListener('click', function () {
    strip.scrollBy({ left: frameW * 2, behavior: 'smooth' });
  });

  // Mouse drag
  var isDown = false, startX, scrollLeft;

  strip.addEventListener('mousedown', function (e) {
    isDown = true;
    startX = e.pageX - strip.offsetLeft;
    scrollLeft = strip.scrollLeft;
    strip.style.cursor = 'grabbing';
  });

  strip.addEventListener('mouseleave', function () { isDown = false; strip.style.cursor = 'grab'; });
  strip.addEventListener('mouseup',    function () { isDown = false; strip.style.cursor = 'grab'; });

  strip.addEventListener('mousemove', function (e) {
    if (!isDown) return;
    e.preventDefault();
    var x = e.pageX - strip.offsetLeft;
    strip.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });
})();


// =============================================
// LIGHTBOX
// =============================================
(function () {
  var lb       = document.getElementById('lightbox');
  var lbImg    = document.getElementById('lightboxImg');
  var lbClose  = document.getElementById('lightboxClose');
  var lbPrev   = document.getElementById('lightboxPrev');
  var lbNext   = document.getElementById('lightboxNext');
  var frames   = Array.from(document.querySelectorAll('.film-frame[data-src]'));
  var polaroids = Array.from(document.querySelectorAll('.polaroid[data-src]'));
  var allItems = frames; // lightbox navigates film strip
  var idx = 0;

  function open(src, i) {
    lbImg.src = src;
    idx = i;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { lbImg.src = ''; }, 300);
  }

  function show(i) {
    idx = (i + allItems.length) % allItems.length;
    lbImg.style.animation = 'none';
    void lbImg.offsetWidth;
    lbImg.src = allItems[idx].dataset.src;
    lbImg.style.animation = '';
  }

  frames.forEach(function (f, i) {
    f.addEventListener('click', function () { open(f.dataset.src, i); });
  });

  polaroids.forEach(function (p) {
    p.addEventListener('click', function () {
      // find matching frame or just open
      var matchIdx = frames.findIndex(function(f){ return f.dataset.src === p.dataset.src; });
      open(p.dataset.src, matchIdx >= 0 ? matchIdx : 0);
    });
  });

  lbClose.addEventListener('click', close);
  lbPrev.addEventListener('click',  function () { show(idx - 1); });
  lbNext.addEventListener('click',  function () { show(idx + 1); });

  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
})();


// =============================================
// FAQ ACCORDION
// =============================================
document.querySelectorAll('.faq-question').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var answer = this.nextElementSibling;
    var isOpen = this.getAttribute('aria-expanded') === 'true';

    document.querySelectorAll('.faq-question').forEach(function (q) {
      q.setAttribute('aria-expanded', 'false');
      q.nextElementSibling.classList.remove('open');
    });

    if (!isOpen) {
      this.setAttribute('aria-expanded', 'true');
      answer.classList.add('open');
    }
  });
});


// =============================================
// RSVP FORM + AUTO TABLE ASSIGNMENT
// =============================================
(function () {
  var TOTAL_TABLES = 10;
  var SEATS_PER_TABLE = 5;
  var STORAGE_KEY = 'or_wedding_tables';

  var form = document.getElementById('rsvpForm');
  var statusEl = document.getElementById('formStatus');
  var tableConfirm = document.getElementById('tableConfirm');
  var tableConfirmText = document.getElementById('tableConfirmText');
  var tableConfirmDetails = document.getElementById('tableConfirmDetails');
  var tableGrid = document.getElementById('tableGrid');
  if (!form) return;

  // Load or init table data
  function loadTables() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && data.length === TOTAL_TABLES) return data;
    } catch(e) {}
    return new Array(TOTAL_TABLES).fill(0);
  }

  function saveTables(tables) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tables)); } catch(e) {}
  }

  // Find a table with enough free seats
  function findTable(numGuests, tables) {
    for (var i = 0; i < tables.length; i++) {
      if (tables[i] + numGuests <= SEATS_PER_TABLE) return i;
    }
    return -1;
  }

  // Render the table overview grid
  function renderTables(tables, yourTable) {
    if (!tableGrid) return;
    tableGrid.innerHTML = '';
    for (var i = 0; i < TOTAL_TABLES; i++) {
      var cell = document.createElement('div');
      cell.className = 'table-cell';
      if (tables[i] >= SEATS_PER_TABLE) cell.classList.add('full');
      if (yourTable === i) cell.classList.add('yours');
      cell.innerHTML =
        '<span class="table-cell-num">T' + (i + 1) + '</span>' +
        '<span class="table-cell-seats">' + tables[i] + '/' + SEATS_PER_TABLE + '</span>';
      tableGrid.appendChild(cell);
    }
  }

  var tables = loadTables();
  renderTables(tables, -1);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('fullName').value.trim();
    var email = document.getElementById('email').value.trim();
    var attendance = document.getElementById('attendance').value;
    var numGuests = parseInt(document.getElementById('guests').value, 10) || 1;

    if (attendance === 'no') {
      statusEl.textContent = 'Thank you, ' + name + '. We are sorry you won\'t be able to make it, but we appreciate you letting us know.';
      statusEl.style.color = 'var(--text-light)';
      tableConfirm.classList.remove('show');
      form.reset();
      return;
    }

    // Auto-assign to a table
    var tableIdx = findTable(numGuests, tables);

    if (tableIdx === -1) {
      statusEl.innerHTML = '🎉 Thank you, ' + name + '! We are so happy you will be joining us. <br>All tables are currently full — we will contact you at <strong>' + email + '</strong> to confirm your seating arrangement.';
      statusEl.style.color = 'var(--gold-dark)';
      tableConfirm.classList.remove('show');
      form.reset();
      return;
    }

    // Assign seats
    tables[tableIdx] += numGuests;
    saveTables(tables);

    var tableNum = tableIdx + 1;
    var seatsLeft = SEATS_PER_TABLE - tables[tableIdx];

    statusEl.innerHTML = '🎉 Thank you, ' + name + '! We are so happy you will be joining us on 1st August 2026.';
    statusEl.style.color = 'var(--gold-dark)';

    // Show confirmation card
    tableConfirm.classList.add('show');
    tableConfirmText.innerHTML =
      'You have been automatically assigned to <strong>Table ' + tableNum + '</strong> with ' +
      numGuests + ' seat' + (numGuests > 1 ? 's' : '') + '. ' +
      'A confirmation email has been sent to <strong>' + email + '</strong>.';

    tableConfirmDetails.innerHTML =
      '<span class="detail-pill">Table ' + tableNum + '</span>' +
      '<span class="detail-pill">' + numGuests + ' Seat' + (numGuests > 1 ? 's' : '') + '</span>' +
      '<span class="detail-pill">' + seatsLeft + ' seat' + (seatsLeft !== 1 ? 's' : '') + ' left</span>';

    renderTables(tables, tableIdx);

    // Simulate email confirmation
    setTimeout(function () {
      var emailNote = document.createElement('p');
      emailNote.style.cssText = 'font-size:0.78rem;color:#7a6a52;margin-top:0.6rem;font-style:italic;';
      emailNote.innerHTML = '✉️ Confirmation email sent to ' + email + ' with your table details and wedding day information.';
      tableConfirmDetails.appendChild(emailNote);
    }, 1200);

    form.reset();
  });
})();


// =============================================
// FOOD MENU TABS
// =============================================
(function () {
  var tabs = document.querySelectorAll('.menu-tab');
  var pages = document.querySelectorAll('.menu-page');
  if (!tabs.length) return;

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var course = tab.dataset.course;
      tabs.forEach(function (t) { t.classList.remove('active'); });
      pages.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var page = document.querySelector('.menu-page[data-course="' + course + '"]');
      if (page) page.classList.add('active');
    });
  });
})();


// =============================================
// MUSIC PLAYER (YouTube IFrame)
// =============================================
(function () {
  var toggle = document.getElementById('musicToggle');
  var bars = document.getElementById('musicBars');
  var playIcon = document.querySelector('.music-icon-play');
  var pauseIcon = document.querySelector('.music-icon-pause');
  if (!toggle) return;

  var player = null;
  var isPlaying = false;
  var isReady = false;

  // Load YouTube IFrame API
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  // Create hidden player div
  var playerDiv = document.createElement('div');
  playerDiv.id = 'ytMusicPlayer';
  playerDiv.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(playerDiv);

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('ytMusicPlayer', {
      videoId: 'HI419IFhujs',
      playerVars: {
        autoplay: 0,
        controls: 0,
        loop: 1,
        playlist: 'HI419IFhujs',
        volume: 40
      },
      events: {
        onReady: function () { isReady = true; player.setVolume(40); }
      }
    });
  };

  toggle.addEventListener('click', function () {
    if (!isReady || !player) {
      // API not ready yet — toggle visual state
      isPlaying = !isPlaying;
      bars.classList.toggle('playing', isPlaying);
      playIcon.style.display = isPlaying ? 'none' : 'block';
      pauseIcon.style.display = isPlaying ? 'block' : 'none';
      return;
    }

    if (!isPlaying) {
      player.playVideo();
      isPlaying = true;
      bars.classList.add('playing');
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      toggle.setAttribute('aria-label', 'Pause music');
    } else {
      player.pauseVideo();
      isPlaying = false;
      bars.classList.remove('playing');
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      toggle.setAttribute('aria-label', 'Play music');
    }
  });
})();


// =============================================
// MASONRY GALLERY LIGHTBOX
// =============================================
(function () {
  var items = document.querySelectorAll('.masonry-item[data-src]');
  if (!items.length) return;

  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightboxImg');
  var lbClose = document.getElementById('lightboxClose');
  var lbPrev = document.getElementById('lightboxPrev');
  var lbNext = document.getElementById('lightboxNext');
  if (!lb) return;

  var allItems = Array.from(items);
  var idx = 0;

  function open(i) {
    idx = i;
    lbImg.src = allItems[idx].dataset.src;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { lbImg.src = ''; }, 300);
  }

  function show(i) {
    idx = (i + allItems.length) % allItems.length;
    lbImg.style.animation = 'none';
    void lbImg.offsetWidth;
    lbImg.src = allItems[idx].dataset.src;
    lbImg.style.animation = '';
  }

  allItems.forEach(function (item, i) {
    item.addEventListener('click', function () { open(i); });
  });

  lbClose.addEventListener('click', close);
  lbPrev.addEventListener('click', function () { show(idx - 1); });
  lbNext.addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
})();


// =============================================
// SCROLL REVEAL
// =============================================
var revealEls = document.querySelectorAll(
  '.detail-card, .dresscode-card, .travel-card, .timeline-item, .faq-item, .notice-box, .menu-item, .masonry-item, .table-cell'
);

var ro = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      ro.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealEls.forEach(function (el) {
  el.classList.add('reveal');
  ro.observe(el);
});
