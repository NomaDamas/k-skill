/* ============================================================
   html-presentation engine.js — IMMUTABLE ENGINE BEHAVIOR
   Do not modify. All navigation, scaling, and hash sync logic.
   ============================================================ */

(function () {
  'use strict';

  /* ---- State ---------------------------------------------- */
  const state = { index: 0, total: 0 };

  /* ---- DOM refs (resolved after DOMContentLoaded) ---------- */
  let slides, progressEl, counterEl, sidenavEl, sidenavList;

  /* ---- Core: go(i) — single entry point for all moves ------ */
  function go(i) {
    const clamped = Math.max(0, Math.min(i, state.total - 1));
    state.index = clamped;

    // Toggle active slide
    slides.forEach(function (s, idx) {
      s.classList.toggle('active', idx === clamped);
    });

    // Progress bar
    const pct = state.total > 1
      ? (clamped / (state.total - 1)) * 100
      : 100;
    if (progressEl) progressEl.style.width = pct + '%';

    // Counter
    if (counterEl) counterEl.textContent = (clamped + 1) + ' / ' + state.total;

    // Side nav active state
    if (sidenavList) {
      const links = sidenavList.querySelectorAll('a');
      links.forEach(function (a, idx) {
        a.classList.toggle('active', idx === clamped);
      });
    }

    // URL hash (avoid pushState loop)
    const hash = '#' + (clamped + 1);
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
  }

  /* ---- Inject persistent footer into .stage ---------------- */
  function injectFooter() {
    var stage = document.querySelector('.stage');
    if (!stage || stage.querySelector('.footer')) return;

    var footer = document.createElement('footer');
    footer.className = 'footer';

    var credit = document.createElement('span');
    credit.className = 'footer-credit';
    credit.textContent = 'made by baekenough';

    var links = document.createElement('span');
    links.className = 'footer-links';

    // GitHub (simple-icons path)
    var gh = document.createElement('a');
    gh.href = 'https://github.com/baekenough';
    gh.target = '_blank';
    gh.rel = 'noopener noreferrer';
    gh.setAttribute('aria-label', 'GitHub');
    var ghSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ghSvg.setAttribute('viewBox', '0 0 24 24');
    ghSvg.setAttribute('width', '20');
    ghSvg.setAttribute('height', '20');
    ghSvg.setAttribute('fill', 'currentColor');
    ghSvg.setAttribute('aria-hidden', 'true');
    var ghPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ghPath.setAttribute('d', 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12');
    ghSvg.appendChild(ghPath);
    gh.appendChild(ghSvg);

    // LinkedIn (simple-icons path)
    var li = document.createElement('a');
    li.href = 'https://www.linkedin.com/in/%EC%83%81%EC%9D%B4-%EB%B0%B1-a8b028203/';
    li.target = '_blank';
    li.rel = 'noopener noreferrer';
    li.setAttribute('aria-label', 'LinkedIn');
    var liSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    liSvg.setAttribute('viewBox', '0 0 24 24');
    liSvg.setAttribute('width', '20');
    liSvg.setAttribute('height', '20');
    liSvg.setAttribute('fill', 'currentColor');
    liSvg.setAttribute('aria-hidden', 'true');
    var liPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    liPath.setAttribute('d', 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z');
    liSvg.appendChild(liPath);
    li.appendChild(liSvg);

    links.appendChild(gh);
    links.appendChild(li);
    footer.appendChild(credit);
    footer.appendChild(links);
    stage.appendChild(footer);
  }

  /* ---- Build side nav from slide data-title attrs ---------- */
  function buildSidenav() {
    if (!sidenavList) return;
    // Clear existing children safely
    while (sidenavList.firstChild) {
      sidenavList.removeChild(sidenavList.firstChild);
    }

    slides.forEach(function (slide, idx) {
      const title = slide.getAttribute('data-title') || 'Slide ' + (idx + 1);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + (idx + 1);

      // Build nav num span using textContent (XSS-safe)
      const numSpan = document.createElement('span');
      numSpan.className = 'nav-num';
      numSpan.textContent = String(idx + 1).padStart(2, '0');

      // Build title span using textContent (XSS-safe)
      const titleSpan = document.createElement('span');
      titleSpan.textContent = title;

      a.appendChild(numSpan);
      a.appendChild(titleSpan);

      a.addEventListener('click', function (e) {
        e.preventDefault();
        go(idx);
        if (sidenavEl) sidenavEl.classList.remove('open');
      });

      li.appendChild(a);
      sidenavList.appendChild(li);
    });
  }

  /* ---- Scale: fit stage into viewport ---------------------- */
  function scaleStage() {
    const stage = document.querySelector('.stage');
    if (!stage) return;
    const stageW = parseFloat(getComputedStyle(stage).getPropertyValue('--stage-w')) || 1920;
    const stageH = parseFloat(getComputedStyle(stage).getPropertyValue('--stage-h')) || 1080;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / stageW, vh / stageH);
    stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
  }

  /* ---- Keyboard -------------------------------------------- */
  function onKeydown(e) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (e.shiftKey) { go(state.index - 1); } else { go(state.index + 1); }
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        go(state.index + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        go(state.index - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(state.total - 1);
        break;
      case 'n':
      case 'N':
        if (sidenavEl) sidenavEl.classList.toggle('open');
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
    }
  }

  /* ---- Fullscreen ------------------------------------------ */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }

  /* ---- Debug mode: detect overflow ------------------------- */
  function runDebug() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') !== '1') return;

    slides.forEach(function (slide) {
      const wasHidden = !slide.classList.contains('active');
      if (wasHidden) {
        slide.style.display = 'flex';
        slide.style.visibility = 'hidden';
      }
      requestAnimationFrame(function () {
        const overflowH = slide.scrollHeight > slide.clientHeight + 2;
        const overflowW = slide.scrollWidth > slide.clientWidth + 2;
        if (overflowH || overflowW) {
          slide.setAttribute('data-overflow', '1');
          const title = slide.getAttribute('data-title') || 'unknown';
          console.warn(
            '[html-presentation debug] Overflow detected on slide "' + title + '"',
            {
              scrollH: slide.scrollHeight, clientH: slide.clientHeight,
              scrollW: slide.scrollWidth, clientW: slide.clientWidth
            }
          );
        }
        if (wasHidden) {
          slide.style.display = '';
          slide.style.visibility = '';
        }
      });
    });
  }

  /* ---- Parse hash -> index --------------------------------- */
  function indexFromHash() {
    const raw = parseInt(window.location.hash.replace('#', ''), 10);
    if (!isNaN(raw) && raw >= 1) return raw - 1;
    return 0;
  }

  /* ---- Init ------------------------------------------------ */
  function init() {
    slides = Array.from(document.querySelectorAll('.deck > section'));
    state.total = slides.length;

    progressEl  = document.querySelector('.progress');
    counterEl   = document.querySelector('.counter');
    sidenavEl   = document.querySelector('.sidenav');
    sidenavList = document.querySelector('.sidenav-list');

    if (state.total === 0) return;

    buildSidenav();
    injectFooter();
    scaleStage();
    runDebug();

    // Initial slide from hash
    go(indexFromHash());

    // Nav toggle button
    const navToggle = document.querySelector('.nav-toggle');
    if (navToggle && sidenavEl) {
      navToggle.addEventListener('click', function () {
        sidenavEl.classList.toggle('open');
      });
    }

    // Close sidenav when clicking outside
    document.addEventListener('click', function (e) {
      if (!sidenavEl) return;
      if (!sidenavEl.contains(e.target) && !e.target.closest('.nav-toggle')) {
        sidenavEl.classList.remove('open');
      }
    });

    // Keyboard
    document.addEventListener('keydown', onKeydown);

    // Hash navigation (back/forward)
    window.addEventListener('popstate', function () {
      go(indexFromHash());
    });

    // Resize: re-scale
    window.addEventListener('resize', scaleStage);

    // Touch swipe support
    let touchStartX = 0;
    document.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) { go(state.index + 1); } else { go(state.index - 1); }
      }
    }, { passive: true });
  }

  /* ---- Boot ------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
