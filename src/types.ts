/** Shapes of the extracted page model (see recon/build_data.py). */

export interface Block {
  /** Source element: p, h1..h5, li, img, a, td, th, blockquote, div. */
  tag: string;
  text: string;
  href: string;
  src: string;
  alt: string;
}

export interface Section {
  /** 'strip' = the full-width magenta title bar; otherwise 'content'/'grid'. */
  kind: string;
  /** Present on strip sections. */
  title?: string;
  blocks: Block[];
  /**
   * Page copy that introduces the group, lifted out of `blocks` so it is not
   * mistaken for an image caption. The source sets this as its own full-width
   * paragraph above the artwork, and it is often the same length as a real
   * caption ("Welcome to our branding kit!" vs "Perfectly proportionate
   * logo"), so the distinction cannot be recovered from the text alone.
   */
  copy?: Block[];
}

export interface PageData {
  route: string;
  slug: string;
  family: string;
  isContainer: boolean;
  title: string;
  description: string;
  h1: string;
  ogImage: string;
  ogUrl: string;
  sections: Section[];
  blocks: Block[];
  images: { src: string; alt: string; w: number; h: number }[];
  links: { href: string; text: string }[];
  sourceBytes: number;
}

export interface NavItem {
  label: string;
  href: string;
}
