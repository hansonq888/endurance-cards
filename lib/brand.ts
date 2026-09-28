/**
 * The app's name, in one place. Change it here and every page, image, share
 * text and filename follows. (Internal identifiers, the `kudex:` Redis prefix and
 * `kudex_*` cookies, should stay fixed after launch: renaming them would orphan
 * every stored card and sign everyone out.)
 */
export const BRAND = {
  name: "Kudex",
  tagline: "Your training, as a player card",
  /** Used in download filenames, e.g. "hanson-kudex.png". */
  fileSlug: "kudex",
  logPrefix: "[kudex]",
};
