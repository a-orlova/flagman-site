/* =================================================================
   ФЛАГМАНЪ · client-side interactions
   ================================================================= */

(() => {
  'use strict';

  /* -----------------------------------------------------------------
     1. NAV: sticky scroll state + mobile burger
     ----------------------------------------------------------------- */
  const nav = document.getElementById('topnav');
  const navMenu = document.getElementById('primary-nav');
  const navBurger = document.querySelector('.nav__burger');

  const onScroll = () => {
    if (window.scrollY > 24) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  navBurger.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('is-open');
    navBurger.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('is-locked', isOpen);
  });

  navMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      if (navMenu.classList.contains('is-open')) {
        navMenu.classList.remove('is-open');
        navBurger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('is-locked');
      }
    });
  });

  /* -----------------------------------------------------------------
     2. REVEAL on scroll for sections (IntersectionObserver)
     ----------------------------------------------------------------- */
  const revealTargets = document.querySelectorAll(
    '.section__head, .pain-card, .ship, .route__stage, .route__stop, ' +
    '.menu__viewer, .menu__tabs, .gallery__grid, .booking__form, ' +
    '.booking__intro, .faq__item, .footer'
  );
  revealTargets.forEach(el => el.classList.add('reveal'));

  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        revealIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach(el => revealIO.observe(el));

  /* -----------------------------------------------------------------
     3. ROUTE: animated ship along an SVG path tied to scroll.
     -----------------------------------------------------------------
     We support TWO different SVG maps that share the same list of stops:
       • Horizontal map (desktop / tablet) — ship travels left → right.
       • Vertical map  (mobile)           — ship travels top → bottom.
     A media query picks which SVG is currently visible. The scroll-
     driven animation operates on whichever map is active right now.

     The ship's tilt follows the river's local tangent, and each
     waypoint label is auto-placed on the side of the path that has
     the most free space (above/below for horizontal, left/right for
     vertical). Labels also auto-size their background to fit the text.
     ----------------------------------------------------------------- */
  const routeStage = document.querySelector('.route__stage');
  const routeStops = document.querySelectorAll('.route__stop');
  const progressFill = document.getElementById('routeProgressFill');
  const mapH = document.querySelector('.route__map--horizontal');
  const mapV = document.querySelector('.route__map--vertical');

  if (routeStage && (mapH || mapV)) {

    /**
     * Prepare a single map (horizontal or vertical):
     *   • measure river path length
     *   • position waypoints evenly along it
     *   • size each label's background to fit its text
     *   • decide which side of the path each label goes on
     */
    const prepareMap = (svg) => {
      if (!svg) return null;
      const riverPath = svg.querySelector('.route__river');
      const ship = svg.querySelector('.route__ship');
      const points = Array.from(svg.querySelectorAll('.route__point'));
      if (!riverPath || !ship || points.length < 2) return null;

      const isVertical = svg.dataset.orientation === 'vertical';
      const totalLen = riverPath.getTotalLength();
      // Distance of the probe used to compute neighbours when deciding
      // which side a label should sit on.
      const probeDist = Math.min(totalLen / (points.length - 1) * 0.55, totalLen * 0.12);
      // Distance from a point to its label, in SVG user units. Tuned to
      // sit CLOSE to the river without ever overlapping it. Each offset
      // is just over the river's half-amplitude so labels stay in the
      // free band above peaks (or below valleys / beside meanders).
      //   Horizontal: river amplitude ≈ 270 → labelOffset 145
      //   Vertical:   river amplitude ≈ 260 → labelOffset 160
      const labelOffset = isVertical ? 160 : 145;
      // Padding inside the label pill.
      const labelPadX = 18;
      const labelPadY = 12;

      points.forEach((point, i) => {
        // Position on the path, equally spaced by arclength.
        const len = (i / (points.length - 1)) * totalLen;
        const pt = riverPath.getPointAtLength(len);
        point.setAttribute('transform', `translate(${pt.x}, ${pt.y})`);

        // Decide which side of the path the label should go on.
        // For each point sample one neighbour BEFORE and one AFTER (or
        // mirror across the endpoint for the first/last) and compare
        // the point's position with the midpoint of the neighbours.
        //   horizontal map: if pt.y > midY → point sits in a valley →
        //                    free space is ABOVE → label goes above.
        //                   if pt.y < midY → point sits on a peak →
        //                    label goes below.
        //   vertical map:   if pt.x > midX → label goes to the LEFT.
        //                   if pt.x < midX → label goes to the RIGHT.
        const beforeLen = Math.max(0, len - probeDist);
        const afterLen  = Math.min(totalLen, len + probeDist);
        const beforePt = riverPath.getPointAtLength(beforeLen);
        const afterPt  = riverPath.getPointAtLength(afterLen);

        const label = point.querySelector('.route__label');
        const text = label && label.querySelector('text');
        const rect = label && label.querySelector('rect');

        if (label && text && rect) {
          // Size the background pill to fit the rendered text. We have
          // to do this AFTER the SVG is in the DOM so getBBox returns
          // meaningful values (it does — we run after DOMContentLoaded).
          let bbox;
          try { bbox = text.getBBox(); } catch (e) { bbox = { width: 100, height: 16 }; }
          const w = Math.ceil(bbox.width) + labelPadX * 2;
          const h = Math.ceil(bbox.height) + labelPadY;
          rect.setAttribute('x', -w / 2);
          rect.setAttribute('y', -h / 2);
          rect.setAttribute('width', w);
          rect.setAttribute('height', h);

          let dx = 0, dy = 0;
          if (isVertical) {
            const midX = (beforePt.x + afterPt.x) / 2;
            // Default to RIGHT for the very start so it doesn't clash
            // with the ship resting at the start.
            const sideSign = pt.x >= midX ? -1 : +1;
            dx = sideSign * labelOffset;
          } else {
            const midY = (beforePt.y + afterPt.y) / 2;
            // pt.y > midY → valley → label ABOVE (negative Y in SVG)
            const sideSign = pt.y >= midY ? -1 : +1;
            dy = sideSign * labelOffset;
          }
          // Optional fine-tuning per point: `data-label-dx` / `data-label-dy`
          // shift the label by an additional number of SVG units AFTER the
          // automatic placement. Handy for nudging individual labels that
          // happen to clash with their neighbours.
          const nudgeX = parseFloat(point.dataset.labelDx);
          const nudgeY = parseFloat(point.dataset.labelDy);
          if (!Number.isNaN(nudgeX)) dx += nudgeX;
          if (!Number.isNaN(nudgeY)) dy += nudgeY;
          label.setAttribute('transform', `translate(${dx}, ${dy})`);
        }
      });

      // Coordinates of the first and last waypoint along the river path
      // — used by the scroll handler to tie progress to the moment when
      // these points actually enter and leave the viewport.
      const firstPt = riverPath.getPointAtLength(0);
      const lastPt = riverPath.getPointAtLength(totalLen);

      return { svg, riverPath, ship, points, totalLen, isVertical, firstPt, lastPt };
    };

    // Decide which map is currently visible (matches the CSS media query).
    const mq = window.matchMedia('(max-width: 720px)');

    // Cache prepared data per SVG. We only prepare the *active* map and
    // any maps we've already prepared once — this avoids forcing a layout
    // on an off-screen SVG that has an exaggerated aspect ratio.
    const prepared = new WeakMap();
    const ensurePrepared = (svg) => {
      if (!svg) return null;
      const cached = prepared.get(svg);
      if (cached) return cached;
      const data = prepareMap(svg);
      if (data) prepared.set(svg, data);
      return data;
    };
    // Re-prepare an already prepared map (e.g. after resize or font load).
    const reprepare = (svg) => {
      if (!svg || !prepared.has(svg)) return;
      const data = prepareMap(svg);
      if (data) prepared.set(svg, data);
    };
    const getActiveData = () => ensurePrepared(mq.matches ? mapV : mapH);
    // Reference for the "update all known maps" helper.
    const horizontalData = () => prepared.get(mapH);
    const verticalData = () => prepared.get(mapV);
    // Eagerly prepare the currently-active map so the very first paint
    // already shows the ship sitting at the start.
    getActiveData();

    /**
     * Move the ship of the active map to a given progress (0..1).
     * Also lights up the corresponding waypoint and stop card.
     */
    const placeShip = (progress) => {
      const data = getActiveData();
      if (!data) return;
      const p = Math.max(0, Math.min(1, progress));
      const len = data.totalLen * p;
      const pt = data.riverPath.getPointAtLength(len);
      // Use a slightly larger lookahead so the tangent angle is averaged
      // over a longer stretch — this kills high-frequency jitter when
      // the path's tangent changes rapidly on tight bends.
      const ahead = data.riverPath.getPointAtLength(Math.min(data.totalLen, len + 8));
      const back = data.riverPath.getPointAtLength(Math.max(0, len - 8));
      const tangent = Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180 / Math.PI;

      // Compute the "tilt" — the deviation of the tangent from the
      // expected base direction. We then apply just a SMALL fraction of
      // this tilt to the ship: this yields a gentle, elegant lean into
      // curves instead of dizzy spinning. Note: the vertical ship has a
      // built-in rotate(90) in the SVG, so we DON'T add 90 here — the
      // value we emit is purely the tilt around that built-in baseline.
      const baseDir = data.isVertical ? 90 : 0;
      let tilt = tangent - baseDir;
      // Normalize tilt to (-180, 180] to avoid wrap-around jumps when the
      // tangent flips sign at the (-180, 180] boundary.
      tilt = ((tilt + 180) % 360 + 360) % 360 - 180;
      const angle = tilt * 0.18; // gentle damping for smooth motion
      data.ship.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angle})`);

      if (progressFill) progressFill.style.width = (p * 100) + '%';

      // Highlight the waypoint dots on the maps themselves. The stop
      // cards below the animation are now FLIP CARDS that reveal photos
      // on hover/tap — they no longer mirror the ship's position.
      const segments = Math.max(1, data.points.length - 1);
      const activeIdx = Math.min(data.points.length - 1, Math.round(p * segments));
      [horizontalData(), verticalData()].forEach(d => {
        if (!d) return;
        d.points.forEach((point, i) => {
          point.classList.toggle('is-active', i === activeIdx);
          point.classList.toggle('is-visited', i < activeIdx);
        });
      });
    };

    placeShip(0);

    /* SCROLL TIMING ---------------------------------------------------
       Anchor the progress to the screen position of the FIRST and LAST
       waypoint, not to the whole stage:

         progress = 0  ⇢  the first point is just appearing at the
                           bottom of the viewport.
         progress = 1  ⇢  the last point reaches roughly 25% from the
                           viewport's top — i.e. it's still well in
                           view when the ship finishes its journey.

       Finishing the journey BEFORE the map fully scrolls past lets the
       user see the ship arrive while the last stop is still in front
       of them. As the user scrolls back, the ship retraces — that
       effect comes for free because progress is a pure function of
       rect.top with no easing/inertia. */
    const onRouteScroll = () => {
      const data = getActiveData();
      if (!data) return;
      const svgEl = data.svg;
      const rect = svgEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const viewBox = svgEl.viewBox.baseVal;
      // Avoid divide-by-zero before layout settles.
      if (!viewBox || !viewBox.height || !rect.height) return;
      const scaleY = rect.height / viewBox.height;
      const firstOffsetPx = data.firstPt.y * scaleY;
      const lastOffsetPx  = data.lastPt.y * scaleY;
      // The rect.top values at which progress should be 0 and 1.
      // We finish ~25% of the viewport EARLIER than the moment the
      // last point would leave the screen — so the ship arrives at
      // the final pier while it's still comfortably in view.
      const earlyFinish = vh * 0.25;
      const startTop = vh - firstOffsetPx;
      const endTop   = -lastOffsetPx + earlyFinish;
      const distance = Math.max(1, startTop - endTop);
      const progress = (startTop - rect.top) / distance;
      placeShip(progress);
    };
    window.addEventListener('scroll', onRouteScroll, { passive: true });
    onRouteScroll();

    /* Flip cards interaction:
         • CSS handles hover-based flipping for mouse users (pure :hover).
         • For taps we ALWAYS toggle an .is-flipped class on click —
           regardless of whether the device "officially" advertises a
           coarse pointer. matchMedia('(hover: none)') is unreliable on
           hybrid laptops with a touchscreen and in dev-tools mobile
           emulation, so we just listen everywhere. Clicking on a
           desktop simply pins the back face until the next click. */
    routeStops.forEach((stop) => {
      stop.addEventListener('click', (e) => {
        // Don't flip if the user clicked an interactive child element.
        if (e.target.closest('a, button')) return;
        stop.classList.toggle('is-flipped');
      });
      // Keyboard a11y: Enter / Space flip the card.
      stop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          stop.classList.toggle('is-flipped');
        }
      });
    });

    /* Re-prepare labels on resize and orientation switches. Both fonts
       loading and viewport changes can change text metrics. */
    let resizeRaf = null;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        // Re-prepare maps we've already touched, plus make sure the
        // currently active map is prepared.
        reprepare(mapH);
        reprepare(mapV);
        getActiveData();
        onRouteScroll();
      });
    };
    window.addEventListener('resize', onResize);

    // Media query change: prepare the new active map immediately so its
    // labels are sized correctly the moment it becomes visible.
    const onMqChange = () => onResize();
    if (mq.addEventListener) mq.addEventListener('change', onMqChange);
    else if (mq.addListener) mq.addListener(onMqChange); // legacy Safari

    // Web fonts may load after our first measurement — re-measure once
    // they're ready so label backgrounds fit the final text properly.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize);
    }
  }

  /* -----------------------------------------------------------------
     4. MENU: image tab switcher
     -----------------------------------------------------------------
     The menu is shown as a PNG <img> (always renders, works in every
     browser, no PDF plugins needed). The two action buttons in the bar
     point to the corresponding PDF file so visitors can still open it
     in a new tab or download the original. Each tab carries:
        data-img    →  path to the PNG to display
        data-pdf    →  path to the PDF (for both buttons)
        data-title  →  text to put in the viewer bar's title
     ----------------------------------------------------------------- */
  const menuTabs = document.querySelectorAll('.menu__tab');
  const menuImage = document.getElementById('menuImage');
  const menuTitle = document.getElementById('menuViewerTitle');
  const menuOpenLink = document.getElementById('menuOpenLink');
  const menuDownloadLink = document.getElementById('menuDownloadLink');

  const setMenuSource = (tab) => {
    if (!tab) return;
    const imgPath = tab.dataset.img;
    const pdfPath = tab.dataset.pdf;
    const titleText = tab.dataset.title;
    if (menuImage && imgPath) menuImage.src = encodeURI(imgPath);
    if (menuImage && titleText) menuImage.alt = titleText + ' — изображение страницы меню';
    if (menuOpenLink && pdfPath) menuOpenLink.href = encodeURI(pdfPath);
    if (menuDownloadLink && pdfPath) menuDownloadLink.href = encodeURI(pdfPath);
    if (menuTitle && titleText) menuTitle.textContent = titleText;
  };

  menuTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      menuTabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      setMenuSource(tab);
    });
  });

  /* -----------------------------------------------------------------
     5. GALLERY: filtering + lightbox
     ----------------------------------------------------------------- */
  const galleryFilters = document.querySelectorAll('.gallery__filter');
  const galleryItems = document.querySelectorAll('.gallery__item');

  galleryFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      galleryFilters.forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      const filter = btn.dataset.filter;
      galleryItems.forEach(item => {
        const matches = filter === 'all' || item.dataset.cat === filter;
        item.classList.toggle('is-hidden', !matches);
      });
    });
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  let lbIndex = 0;
  let lbSet = [];

  const openLightbox = (idx) => {
    lbSet = Array.from(galleryItems).filter(it => !it.classList.contains('is-hidden'));
    lbIndex = idx;
    showLightbox();
    lightbox.hidden = false;
    document.body.classList.add('is-locked');
  };
  const showLightbox = () => {
    const item = lbSet[lbIndex];
    if (!item) return;
    const img = item.querySelector('img');
    const cap = item.querySelector('figcaption');
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || '';
    lightboxCaption.textContent = cap ? cap.textContent : '';
  };
  const closeLightbox = () => {
    lightbox.hidden = true;
    document.body.classList.remove('is-locked');
  };

  galleryItems.forEach((item) => {
    item.addEventListener('click', () => {
      const visible = Array.from(galleryItems).filter(it => !it.classList.contains('is-hidden'));
      const i = visible.indexOf(item);
      if (i >= 0) openLightbox(i);
    });
  });

  if (lightbox) {
    lightbox.querySelector('[data-prev]').addEventListener('click', (e) => {
      e.stopPropagation();
      lbIndex = (lbIndex - 1 + lbSet.length) % lbSet.length;
      showLightbox();
    });
    lightbox.querySelector('[data-next]').addEventListener('click', (e) => {
      e.stopPropagation();
      lbIndex = (lbIndex + 1) % lbSet.length;
      showLightbox();
    });
    lightbox.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', closeLightbox);
    });
    document.addEventListener('keydown', (e) => {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') {
        lbIndex = (lbIndex - 1 + lbSet.length) % lbSet.length;
        showLightbox();
      }
      if (e.key === 'ArrowRight') {
        lbIndex = (lbIndex + 1) % lbSet.length;
        showLightbox();
      }
    });
  }

  /* -----------------------------------------------------------------
     6. BOOKING FORM: validation + payment modal
     -----------------------------------------------------------------
     Each ship has its own list of piers and each pier has its own set
     of departure times. We change "Причал" and "Время" dynamically
     whenever the user picks a different ship / pier. The schedule
     below mirrors the operator's official timetable (Лот 12 Лоцман /
     Лот 5 Флагман). Times are "Отход" — the moment the ship leaves
     each pier.
     ----------------------------------------------------------------- */
  const form = document.getElementById('bookingForm');
  const shipOpts = document.querySelectorAll('.ship-switch__opt');
  const pierSelect = document.getElementById('bookPier');
  const timeSelect = document.getElementById('bookTime');

  const schedule = {
    'Флагман': {
      'Киевский':       ['09:50', '12:39', '15:28', '18:17', '21:06', '23:55'],
      'Воробьёвы горы': ['10:19', '13:08', '15:57', '18:46', '21:35', '00:24'],
      'Нескучный сад':  ['10:42', '11:47', '13:31', '14:36', '16:20', '17:25',
                         '19:09', '20:14', '21:58', '23:03', '00:47', '01:52'],
      'Китай-город':    ['11:16', '14:05', '16:54', '19:43', '22:32', '01:21']
    },
    'Лоцман': {
      'Зарядье':       ['11:00', '12:10', '13:20', '14:30', '15:40', '16:50',
                        '18:00', '19:10', '20:20', '21:30', '22:40'],
      'Патриарший':    ['11:15', '12:25', '13:35', '14:45', '15:55', '17:05',
                        '18:15', '19:25', '20:35', '21:45', '22:55'],
      'Парк Горького': ['11:45', '12:55', '14:05', '15:15', '16:25', '17:35',
                        '18:45', '19:55', '21:05', '22:15', '23:25']
    }
  };

  const getCurrentShip = () => {
    const checked = form && form.querySelector('input[name="ship"]:checked');
    return checked ? checked.value : '';
  };

  const fillSelect = (select, options, placeholder) => {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    select.appendChild(ph);
    options.forEach(value => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });
    // Try to keep the previous value if it's still available.
    if (previous && options.includes(previous)) select.value = previous;
  };

  const refreshPiers = () => {
    const ship = getCurrentShip();
    const piers = schedule[ship] ? Object.keys(schedule[ship]) : [];
    fillSelect(pierSelect, piers, piers.length ? 'Выберите причал' : 'Сначала выберите корабль');
    refreshTimes();
  };

  const refreshTimes = () => {
    const ship = getCurrentShip();
    const pier = pierSelect && pierSelect.value;
    const times = (ship && pier && schedule[ship] && schedule[ship][pier]) || [];
    fillSelect(timeSelect, times, times.length ? 'Выберите рейс' : 'Сначала выберите причал');
  };

  // Visual sync for ship radio buttons + reactive piers/times.
  shipOpts.forEach(opt => {
    const input = opt.querySelector('input');
    input.addEventListener('change', () => {
      shipOpts.forEach(o => o.classList.remove('is-checked'));
      if (input.checked) opt.classList.add('is-checked');
      refreshPiers();
    });
  });

  if (pierSelect) pierSelect.addEventListener('change', refreshTimes);

  // Initial population (a ship is preselected in HTML).
  refreshPiers();

  // Prefill ship when clicking CTAs with data-prefill-ship.
  document.querySelectorAll('[data-prefill-ship]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ship = btn.dataset.prefillShip;
      const map = { flagman: 'Флагман', lotsman: 'Лоцман' };
      const value = map[ship];
      const radio = form && form.querySelector(`input[name="ship"][value="${value}"]`);
      if (radio) {
        radio.checked = true;
        shipOpts.forEach(o => o.classList.remove('is-checked'));
        radio.closest('.ship-switch__opt').classList.add('is-checked');
        refreshPiers();
      }
    });
  });

  // set min date = today
  const bookDate = document.getElementById('bookDate');
  if (bookDate) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    bookDate.min = `${yyyy}-${mm}-${dd}`;
  }

  // modal
  const modal = document.getElementById('paymentModal');
  const paySummary = document.getElementById('paySummary');
  const payProceed = document.getElementById('payProceed');

  const openModal = (summary) => {
    paySummary.innerHTML = '<dl>' + summary.map(row =>
      `<div><dt>${row[0]}</dt><dd>${row[1]}</dd></div>`
    ).join('') + '</dl>';
    modal.hidden = false;
    document.body.classList.add('is-locked');
  };
  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove('is-locked');
  };
  if (modal) {
    modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', e => {
      if (!modal.hidden && e.key === 'Escape') closeModal();
    });
  }

  if (payProceed) {
    payProceed.addEventListener('click', () => {
      payProceed.disabled = true;
      payProceed.innerHTML = '<span>Перенаправляем…</span>';
      // === ИНТЕГРАЦИЯ С ПЛАТЁЖНЫМ ШЛЮЗОМ ===
      // Замените эту строку на window.location.href = <ссылка от ЮKassa / CloudPayments>;
      setTimeout(() => {
        alert('Демо-режим: здесь произойдёт переход на платёжный шлюз');
        payProceed.disabled = false;
        payProceed.innerHTML = '<span>Перейти к оплате</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        closeModal();
      }, 900);
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // basic check
      const requiredOK = Array.from(form.querySelectorAll('[required]'))
        .every(el => el.checkValidity ? el.checkValidity() : !!el.value);
      if (!requiredOK) {
        form.querySelectorAll('[required]').forEach(el => {
          if (el.checkValidity && !el.checkValidity()) el.reportValidity?.();
        });
        return;
      }
      const data = new FormData(form);
      const summary = [
        ['Корабль', data.get('ship')],
        ['Причал', data.get('pier')],
        ['Дата', data.get('date')],
        ['Время', data.get('time')],
        ['Гостей', data.get('guests')],
        ['Гость', data.get('name')],
        ['Телефон', data.get('phone')],
        ['E-mail', data.get('email')],
      ];
      openModal(summary);
    });
  }

  /* -----------------------------------------------------------------
     7. FAQ — smooth open / close animation
     -----------------------------------------------------------------
     Native <details> toggles content via `display: none`, which makes
     a height transition impossible. We intercept the click on the
     <summary>, manually animate the wrapper's height between 0 and
     its natural size, and only flip the `open` attribute at the
     right moment so the +/- icon stays in sync with the animation. */
  const faqItems = document.querySelectorAll('.faq__item');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  faqItems.forEach((item) => {
    const summary = item.querySelector('summary');
    const content = item.querySelector('.faq__item-content');
    if (!summary || !content) return;

    // Make sure closed items start at height: 0 (CSS already does this,
    // but if an item is server-rendered with `open` we keep it auto).
    if (!item.open) content.style.height = '0px';

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (reduceMotion) {
        item.open = !item.open;
        content.style.height = item.open ? 'auto' : '0px';
        return;
      }

      if (item.open) {
        // ---- CLOSE -----------------------------------------------
        // Start from current rendered height, then go to 0.
        const startH = content.scrollHeight;
        content.style.height = startH + 'px';
        // Force a reflow so the browser registers the starting value
        // before we change it — otherwise the transition is skipped.
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        content.style.height = '0px';
        content.addEventListener('transitionend', function onEnd(ev) {
          if (ev.propertyName !== 'height') return;
          content.removeEventListener('transitionend', onEnd);
          item.open = false;
        }, { once: false });
      } else {
        // ---- OPEN ------------------------------------------------
        item.open = true;
        // Measure target height while the element is still at 0.
        const targetH = content.scrollHeight;
        content.style.height = '0px';
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        content.style.height = targetH + 'px';
        content.addEventListener('transitionend', function onEnd(ev) {
          if (ev.propertyName !== 'height') return;
          content.removeEventListener('transitionend', onEnd);
          // Drop the inline height so the panel can grow/shrink with
          // its content (e.g. on viewport resize, font swap, etc.).
          content.style.height = 'auto';
        }, { once: false });
      }
    });
  });

  /* -----------------------------------------------------------------
     8. Footer year (auto)
     ----------------------------------------------------------------- */
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

})();
