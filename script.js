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
// SMART RSVP + AUTO TABLE / SEAT ASSIGNMENT
// =============================================
(function () {
  var TOTAL_TABLES = 10;
  var SEATS_PER_TABLE = 5;
  var STORAGE_KEY = 'or_wedding_tables';

  // EmailJS credentials
  var EMAILJS_PUBLIC_KEY = 'xi_qSKReYZ-rU3djz';
  var EMAILJS_SERVICE_ID = 'service_x7n5bug';
  var EMAILJS_TEMPLATE_ID = 'template_ma9wbc5';
  var emailjsReady = (typeof emailjs !== 'undefined');
  if (emailjsReady && EMAILJS_PUBLIC_KEY.indexOf('YOUR_') !== 0) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  var step1 = document.getElementById('rsvpStep1');
  var step2 = document.getElementById('rsvpStep2');
  var declineStep = document.getElementById('rsvpDecline');
  var form = document.getElementById('rsvpForm');
  var declineForm = document.getElementById('declineForm');
  var guestSelect = document.getElementById('guests');
  var plusOneGroup = document.getElementById('plusOneGroup');
  var statusEl = document.getElementById('formStatus');
  var declineStatus = document.getElementById('declineStatus');
  var seatMap = document.getElementById('seatMap');
  var seatPreviewStatus = document.getElementById('seatPreviewStatus');
  var seatPreview = document.getElementById('seatPreview');
  var submitBtn = document.getElementById('rsvpSubmitBtn');

  // Modal elements
  var modal = document.getElementById('rsvpModal');
  var modalTitle = document.getElementById('rsvpModalTitle');
  var modalText = document.getElementById('rsvpModalText');
  var modalTable = document.getElementById('rsvpModalTable');
  var modalDetails = document.getElementById('rsvpModalDetails');
  var modalSeats = document.getElementById('rsvpModalSeats');
  var modalEmail = document.getElementById('rsvpModalEmail');
  var modalClose = document.getElementById('rsvpModalClose');
  var modalDone = document.getElementById('rsvpModalDone');

  if (!step1) return;

  // Load or init table data
  function loadTables() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && data.length === TOTAL_TABLES && data.every(function(n){ return typeof n === 'number'; })) return data;
    } catch(e) {}
    return new Array(TOTAL_TABLES).fill(0);
  }

  function saveTables(tables) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tables)); } catch(e) {}
  }

  // Find best table with enough free seats
  function findTable(numGuests, tables) {
    for (var i = 0; i < tables.length; i++) {
      if (tables[i] + numGuests <= SEATS_PER_TABLE) return i;
    }
    return -1;
  }

  // Generate seat numbers for assignment
  function getSeatNumbers(tableIdx, numGuests, tables) {
    var startSeat = tables[tableIdx] + 1;
    var seats = [];
    for (var i = 0; i < numGuests; i++) {
      seats.push(startSeat + i);
    }
    return seats;
  }

  // Render live seat map
  function renderSeatMap(tables, selectedTable, numGuests) {
    if (!seatMap) return;
    seatMap.innerHTML = '';
    var totalGuests = tables.reduce(function(a, b) { return a + b; }, 0);
    var remaining = TOTAL_TABLES * SEATS_PER_TABLE - totalGuests;
    if (seatPreviewStatus) {
      seatPreviewStatus.textContent = remaining + ' of ' + (TOTAL_TABLES * SEATS_PER_TABLE) + ' seats available';
    }

    for (var t = 0; t < TOTAL_TABLES; t++) {
      var table = document.createElement('div');
      table.className = 'seat-table';
      if (selectedTable === t) table.classList.add('active');
      table.innerHTML = '<div class="seat-table-label">Table ' + (t + 1) + '</div>';
      var seatsWrap = document.createElement('div');
      seatsWrap.className = 'seat-table-seats';

      var previewGuests = (selectedTable === t) ? numGuests : 0;
      for (var s = 0; s < SEATS_PER_TABLE; s++) {
        var seat = document.createElement('span');
        seat.className = 'seat-circle';
        if (s < tables[t]) {
          seat.classList.add('occupied');
        } else if (s < tables[t] + previewGuests) {
          seat.classList.add('selected');
        }
        seatsWrap.appendChild(seat);
      }
      table.appendChild(seatsWrap);
      seatMap.appendChild(table);
    }
  }

  var tables = loadTables();
  var selectedNumGuests = 1;
  var selectedTable = -1;
  renderSeatMap(tables, -1, 0);

  function updateProgress(step) {
    var fill = document.getElementById('rsvpProgressFill');
    var labels = [
      document.getElementById('rsvpProgress1'),
      document.getElementById('rsvpProgress2'),
      document.getElementById('rsvpProgress3')
    ];
    if (!fill) return;
    var widths = ['33%', '66%', '100%'];
    fill.style.width = widths[step - 1] || '33%';
    labels.forEach(function (el, i) {
      if (el) el.classList.toggle('active', i < step);
    });
  }

  // Step 1: Yes / No choice
  step1.querySelectorAll('.rsvp-choice-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var response = btn.dataset.response;
      step1.classList.add('rsvp-hidden');
      if (response === 'yes') {
        step2.classList.remove('rsvp-hidden');
        seatPreview.classList.remove('rsvp-hidden');
        renderSeatMap(tables, selectedTable, selectedNumGuests);
        updateProgress(2);
        setTimeout(function () {
          var firstInput = document.getElementById('fullName');
          if (firstInput) firstInput.focus();
        }, 100);
      } else {
        declineStep.classList.remove('rsvp-hidden');
        seatPreview.classList.add('rsvp-hidden');
        updateProgress(2);
        setTimeout(function () {
          var firstInput = document.getElementById('declineName');
          if (firstInput) firstInput.focus();
        }, 100);
      }
    });
  });

  // Dynamic plus-one field
  if (guestSelect) {
    guestSelect.addEventListener('change', function () {
      selectedNumGuests = parseInt(this.value, 10) || 1;
      if (selectedNumGuests === 2) {
        plusOneGroup.classList.remove('rsvp-hidden');
      } else {
        plusOneGroup.classList.add('rsvp-hidden');
      }
      // Preview assignment
      var tempTable = findTable(selectedNumGuests, tables);
      selectedTable = tempTable;
      renderSeatMap(tables, selectedTable, selectedNumGuests);
    });
  }

  // Show modal
  function showModal(name, email, tableIdx, seatNumbers, numGuests) {
    var tableNum = tableIdx + 1;
    var seatsLeft = SEATS_PER_TABLE - tables[tableIdx];
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    modalTitle.textContent = 'You\'re seated, ' + (name.split(' ')[0] || name) + '!';
    modalText.textContent = 'Our smart seating system has automatically reserved your spot.';
    modalTable.textContent = tableNum;

    modalDetails.innerHTML =
      '<span class="rsvp-modal-pill">Table ' + tableNum + '</span>' +
      '<span class="rsvp-modal-pill">' + numGuests + ' Guest' + (numGuests > 1 ? 's' : '') + '</span>' +
      '<span class="rsvp-modal-pill">' + seatsLeft + ' Seat' + (seatsLeft !== 1 ? 's' : '') + ' Left</span>';

    modalSeats.innerHTML = '';
    seatNumbers.forEach(function (seatNum) {
      var seat = document.createElement('span');
      seat.className = 'rsvp-modal-seat';
      seat.textContent = 'S' + seatNum;
      modalSeats.appendChild(seat);
    });

    modalEmail.innerHTML = '✉️ Sending confirmation to <strong>' + email + '</strong>...';
  }

  // Send confirmation email via EmailJS
  function sendConfirmationEmail(name, email, tableIdx, seatNumbers, numGuests, plusOneName, dietary, message) {
    if (!emailjsReady || EMAILJS_PUBLIC_KEY.indexOf('YOUR_') === 0) return;

    var templateParams = {
      to_name: name,
      to_email: email,
      table_number: tableIdx + 1,
      seat_numbers: seatNumbers.map(function (s) { return 'S' + s; }).join(', '),
      num_guests: numGuests,
      plus_one_name: plusOneName || 'N/A',
      dietary: dietary || 'None provided',
      message: message || 'None provided',
      reply_to: 'rsvp@theORwedding.com'
    };

    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
      .then(function () {
        if (modalEmail) {
          modalEmail.innerHTML = '✉️ Confirmation sent to <strong>' + email + '</strong>';
        }
      })
      .catch(function (err) {
        console.error('EmailJS failed:', err);
        if (modalEmail) {
          modalEmail.innerHTML = '✉️ Please save your table details — <strong>' + email + '</strong>';
        }
      });
  }

  function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalDone) modalDone.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  // Main RSVP form submit
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('fullName').value.trim();
      var email = document.getElementById('email').value.trim();
      var numGuests = parseInt(document.getElementById('guests').value, 10) || 1;
      var plusOneName = document.getElementById('plusOneName') ? document.getElementById('plusOneName').value.trim() : '';

      // Auto-assign to a table
      var tableIdx = findTable(numGuests, tables);

      if (tableIdx === -1) {
        statusEl.innerHTML = '🎉 Thank you, ' + name + '! We are so happy you will be joining us. <br>All tables are currently full — we will contact you at <strong>' + email + '</strong> to confirm your seating arrangement.';
        statusEl.style.color = 'var(--gold-dark)';
        form.reset();
        return;
      }

      // Gather remaining fields for email
      var dietary = document.getElementById('dietary').value.trim();
      var message = document.getElementById('message').value.trim();

      // Assign seats
      var seatNumbers = getSeatNumbers(tableIdx, numGuests, tables);
      tables[tableIdx] += numGuests;
      saveTables(tables);

      statusEl.innerHTML = '🎉 Thank you, ' + name + '! Your seat has been assigned.';
      statusEl.style.color = 'var(--gold-dark)';

      // Show beautiful modal
      showModal(name, email, tableIdx, seatNumbers, numGuests);

      // Mark confirmation step complete
      updateProgress(3);

      // Send confirmation email
      sendConfirmationEmail(name, email, tableIdx, seatNumbers, numGuests, plusOneName, dietary, message);

      // Update live seat map
      renderSeatMap(tables, tableIdx, 0);

      form.reset();
      plusOneGroup.classList.add('rsvp-hidden');
    });
  }

  // Decline form submit
  if (declineForm) {
    declineForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('declineName').value.trim();
      var email = document.getElementById('declineEmail').value.trim();
      declineStatus.innerHTML = 'Thank you, ' + name + '. We appreciate you letting us know. A note has been sent to <strong>' + email + '</strong>.';
      declineStatus.style.color = 'var(--gold-dark)';
      declineForm.reset();
    });
  }
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

  var player = null;
  var isPlaying = false;
  var isReady = false;
  var musicStarted = false;

  // Load YouTube IFrame API
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  // Create hidden player div
  var playerDiv = document.createElement('div');
  playerDiv.id = 'ytMusicPlayer';
  playerDiv.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(playerDiv);

  function updateMusicUI(playing) {
    isPlaying = playing;
    if (bars) bars.classList.toggle('playing', playing);
    if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
    if (toggle) toggle.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
  }

  function startMusic() {
    if (player && isReady) {
      player.playVideo();
      updateMusicUI(true);
    } else {
      musicStarted = true;
      updateMusicUI(true);
    }
  }

  function pauseMusic() {
    if (player && isReady) player.pauseVideo();
    updateMusicUI(false);
  }

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
        onReady: function () {
          isReady = true;
          player.setVolume(40);
          if (musicStarted) {
            player.playVideo();
            updateMusicUI(true);
          }
        }
      }
    });
  };

  // Save the Date popup starts the music when entering the site
  var stdEnter = document.getElementById('stdEnter');
  if (stdEnter) {
    stdEnter.addEventListener('click', function () {
      startMusic();
    });
  }

  // Floating toggle button
  if (toggle) {
    toggle.addEventListener('click', function () {
      if (!isReady || !player) return;
      if (!isPlaying) {
        startMusic();
      } else {
        pauseMusic();
      }
    });
  }
})();


// =============================================
// BENTO GALLERY LIGHTBOX
// =============================================
(function () {
  var items = document.querySelectorAll('.bento-item[data-src]');
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
  '.detail-card, .dresscode-card, .travel-card, .timeline-item, .faq-item, .notice-box, .menu-item, .bento-item, .seat-table'
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
