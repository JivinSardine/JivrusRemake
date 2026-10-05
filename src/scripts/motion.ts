/**
 * Motion — the single entry point for the GSAP layer.
 *
 * Progressive enhancement over the original design: nothing is hidden in a way
 * that breaks without JS, and every animation is skipped entirely when the
 * visitor prefers reduced motion.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduce) {
  gsap.registerPlugin(ScrollTrigger);
}

function run() {
  if (reduce) return;

  // Pull reveal targets back before the first paint of the animation, so the
  // page never flashes a partially-faded element.
  const reveals = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  if (reveals.length) gsap.set(reveals, { opacity: 0, y: 26 });

  const heroBits = gsap.utils.toArray<HTMLElement>('[data-hero]');
  if (heroBits.length) {
    gsap.set(heroBits, { opacity: 0, y: 28 });
  }

  // ---- scroll reveals ----------------------------------------------------
  reveals.forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // ---- staggered groups (card grids, list rows, logo grids) --------------
  gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
    const items = group.querySelectorAll('[data-stagger-item]');
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.65,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: { trigger: group, start: 'top 82%', once: true },
      }
    );
  });

  // ---- subtle parallax on flagged media ----------------------------------
  gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
    const depth = parseFloat(el.dataset.parallax || '0.12');
    gsap.fromTo(
      el,
      { yPercent: -depth * 100 },
      {
        yPercent: depth * 100,
        ease: 'none',
        scrollTrigger: { trigger: el, scrub: true, start: 'top bottom', end: 'bottom top' },
      }
    );
  });

  // ---- reading progress bar ---------------------------------------------
  const bar = document.querySelector<HTMLElement>('[data-progress]');
  if (bar) {
    gsap.to(bar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: document.body, scrub: 0.25, start: 'top top', end: 'bottom bottom' },
    });
  }

  // ---- hero intro (above the fold, not scroll-triggered) -----------------
  if (heroBits.length) {
    gsap.to(heroBits, {
      opacity: 1,
      y: 0,
      duration: 0.85,
      ease: 'power3.out',
      stagger: 0.1,
      delay: 0.05,
    });
  }

  // Late-loading images change section heights; recompute trigger positions.
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

run();
