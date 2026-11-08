"use client";

/**
 * "Find a similar design" opens the search-by-photo tool (same event the
 * header/mobile nav dispatch). It's the only 404 action that needs client JS;
 * the other two are plain server-rendered links in not-found.tsx so the page
 * still offers a way out even if JS never loads.
 */
export function FindSimilarButton() {
  return (
    <button
      onClick={() => {
        // The case-study hostname has no storefront visual-search dialog.
        if (window.location.hostname === "casestudy.mimi-pip.invalid") {
          window.location.assign("https://mimipip.com/match-a-photo");
          return;
        }
        window.dispatchEvent(new Event("zyvorah:open-visual-search"));
      }}
      className="btn"
    >
      Find a similar design
    </button>
  );
}
