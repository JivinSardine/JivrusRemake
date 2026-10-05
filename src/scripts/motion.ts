/**
 * Motion — the single entry point for the GSAP layer.
 *
 * The brief was motion in the register of apple.com: on scroll, elements settle
 * into place with a soft scale, and wide media drifts against the scroll at a
 * different rate so the page has depth. Everything here is progressive
 * enhancement — with JS off, or reduced motion on, the page is the static
 * reconstruction and nothing is hidden.
 *
 * Two rules throughout:
 *   - nothing is set to opacity:0 until the first frame, so a slow load or a
 *     JS error never leaves invisible content;
 *   - every tween is skipped when prefers-reduced-motion is set, and the
 *     media-query change is honoured live rather than only on load.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let ctx: gsap.Context | null = null;

function build() {
  gsap.registerPlugin(ScrollTrigger);

  // Kill any previous context so a reduced-motion change can tear down cleanly
  // rather than leaving half-finished transforms behind.
  ctx?.revert();

  ctx = gsap.context(() => {
    // ---- reveal ----------------------------------------------------------
    // A small scale as well as a rise: the element settles rather than just
    // appearing, which is what reads as "expensive" on a scroll.
    // Each element gets its own trigger. A single trigger for the whole list,
    // keyed off the first element, left everything below the first trigger's
    // start position stuck at opacity 0 - 11 elements never appeared on the
    // homepage even after a full scroll.
    const reveals = gsap.utils.toArray<HTMLElement>('[data-reveal]');
    if (reveals.length) {
      gsap.set(reveals, { opacity: 0, y: 30, scale: 0.985 });
      reveals.forEach((el) => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        });
      });
    }

    // ---- hero intro ------------------------------------------------------
    const hero = gsap.utils.toArray<HTMLElement>('[data-hero]');
    if (hero.length) {
      gsap.set(hero, { opacity: 0, y: 34, scale: 0.99 });
      gsap.to(hero, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1.1,
        ease: 'power3.out',
        stagger: 0.09,
        delay: 0.05,
      });
    }

    // ---- staggered groups ------------------------------------------------
    // Cards fan in with a small alternating tilt, so a grid reads as a set of
    // objects rather than a flat list appearing.
    gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
      const items = group.querySelectorAll('[data-stagger-item]');
      if (!items.length) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 34, rotate: (i) => (i % 2 ? 0.7 : -0.7), scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          rotate: 0,
          scale: 1,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.06,
          scrollTrigger: { trigger: group, start: 'top 84%', once: true },
        }
      );
    });

    // ---- scroll-driven drift ---------------------------------------------
    // The apple.com effect: a wide band moves slower than the page, so it
    // appears to sit on a different plane. `data-parallax` sets the strength;
    // a negative value drifts the other way.
    gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
      const depth = parseFloat(el.dataset.parallax || '0.14');
      gsap.fromTo(
        el,
        { yPercent: -depth * 50 },
        {
          yPercent: depth * 50,
          ease: 'none',
          scrollTrigger: {
            trigger: el.parentElement || el,
            scrub: 0.6,
            start: 'top bottom',
            end: 'bottom top',
          },
        }
      );
    });

    // ---- image scale on approach ----------------------------------------
    // Media eases up slightly as it enters, the way a product photograph
    // resolves when you scroll to it. Kept small (3%) so it never wobbles.
    gsap.utils.toArray<HTMLElement>('[data-zoom]').forEach((el) => {
      gsap.fromTo(
        el,
        { scale: 1.03 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            scrub: 0.8,
            start: 'top bottom',
            end: 'center center',
          },
        }
      );
    });

    // ---- section tint ----------------------------------------------------
    // A gentle background shift as each section passes, which gives long pages
    // a sense of moving through space.
    gsap.utils.toArray<HTMLElement>('[data-section]').forEach((section) => {
      gsap.fromTo(
        section,
        { backgroundColor: 'rgba(250, 232, 238, 0)' },
        {
          backgroundColor: 'rgba(250, 232, 238, 0.55)',
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            scrub: 0.5,
            start: 'top 90%',
            end: 'bottom 10%',
          },
        }
      );
    });

    // ---- reading progress ------------------------------------------------
    const bar = document.querySelector<HTMLElement>('[data-progress]');
    if (bar) {
      gsap.to(bar, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: document.body,
          scrub: 0.25,
          start: 'top top',
          end: 'bottom bottom',
        },
      });
    }

    // Late-loading images change section heights; recompute trigger positions.
    window.addEventListener('load', () => ScrollTrigger.refresh());

    /*
     * Safety net. Decorative motion must never be able to hide content: a
     * trigger that never fires, a browser quirk, or a mid-session exception
     * would otherwise leave real copy invisible. Anything still faded once the
     * visitor has scrolled the whole page is released.
     */
    const releaseStuck = gsap.utils.toArray<HTMLElement>(
      '[data-reveal], [data-hero], [data-stagger-item]'
    );
    ScrollTrigger.create({
      trigger: document.body,
      start: 'bottom bottom',
      once: true,
      onEnter: () => {
        const stuck = releaseStuck.filter(
          (el) => Number(getComputedStyle(el).opacity) < 0.9
        );
        if (stuck.length) {
          gsap.to(stuck, { opacity: 1, y: 0, rotate: 0, scale: 1, duration: 0.4, overwrite: true });
        }
      },
    });
  });
}

function applyPreference() {
  if (motionQuery.matches) {
    ctx?.revert();
    ctx = null;
    // Anything the previous context left mid-tween has to be released.
    gsap.set('[data-reveal], [data-hero], [data-stagger-item]', {
      clearProps: 'all',
    });
  } else {
    build();
  }
}

applyPreference();
motionQuery.addEventListener('change', applyPreference);
