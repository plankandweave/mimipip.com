"use client";

import Image from "@/components/SiteImage";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { useMarket } from "@/components/MarketProvider";
import { MarketMoney } from "@/components/MarketMoney";
import {
  TAASH_BOOK_PAGE_COUNT,
  TAASH_BOOK_PRICE_INR,
  taashBookPageSrc,
} from "@/lib/taash-book";

type PageFlipEvent = { data: number };
type PageFlipInstance = {
  loadFromHTML: (pages: NodeListOf<Element>) => void;
  on: (event: "flip", handler: (event: PageFlipEvent) => void) => void;
  flipNext: () => void;
  flipPrev: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    St?: {
      PageFlip: new (
        node: HTMLElement,
        options: Record<string, string | number | boolean>,
      ) => PageFlipInstance;
    };
  }
}

const PAGE_INDEXES = Array.from({ length: TAASH_BOOK_PAGE_COUNT }, (_, index) => index);

function visiblePageLabel(index: number): string {
  if (index <= 0) return "Front cover";
  if (index >= TAASH_BOOK_PAGE_COUNT - 1) return "Back cover";
  const left = index % 2 === 0 ? index - 1 : index;
  const right = Math.min(left + 1, TAASH_BOOK_PAGE_COUNT - 1);
  return `Pages ${left + 1}-${right + 1} of ${TAASH_BOOK_PAGE_COUNT}`;
}

export function TaashBookExperience() {
  const router = useRouter();
  const { add } = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipInstance | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [page, setPage] = useState(0);
  const { market, ready: marketReady } = useMarket();
  // Held until the market is known so an India reader never sees the CTA
  // flicker from enquiry back to pre-order.
  const bookOrderable = !marketReady || market.countryCode === "IN";
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!readerOpen || !scriptReady || !bookRef.current || !window.St) return;

    const instance = new window.St.PageFlip(bookRef.current, {
      width: 440,
      height: 590,
      size: "stretch",
      minWidth: 220,
      maxWidth: 560,
      minHeight: 295,
      maxHeight: 751,
      showCover: true,
      usePortrait: true,
      autoSize: true,
      drawShadow: true,
      maxShadowOpacity: 0.42,
      flippingTime: 1050,
      mobileScrollSupport: true,
      clickEventForward: false,
      showPageCorners: true,
      startPage: 0,
    });
    instance.on("flip", (event) => setPage(Number(event.data) || 0));
    instance.loadFromHTML(bookRef.current.querySelectorAll(".taash-reader-leaf"));
    pageFlipRef.current = instance;

    return () => {
      pageFlipRef.current = null;
      instance.destroy();
    };
  }, [readerOpen, scriptReady]);

  const openReader = () => {
    setPage(0);
    setReaderOpen(true);
    dialogRef.current?.showModal();
  };

  const closeReader = () => {
    dialogRef.current?.close();
    setReaderOpen(false);
  };

  const preOrder = async () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    const added = await add({
      productHandle: "taash-keepsake-book",
      materialSlug: "taash-book",
      widthCm: 22,
      heightCm: 29.5,
      areaSqft: 0,
      unitPrice: TAASH_BOOK_PRICE_INR,
      quantity: 1,
      lineTotal: TAASH_BOOK_PRICE_INR,
    });
    setAdding(false);
    if (added) router.push("/cart");
    else setError("The book could not be added just now. Please try again.");
  };

  return (
    <>
      <Script
        src="/taash-book/page-flip.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />

      <div className="book-actions">
        <button type="button" className="btn-quiet book-look" onClick={openReader}>
          Look Inside
        </button>
        {/* The book is a printed object in its own packaging, not a wallpaper
            tube: the international delivery that every other price includes
            does not cover it, and no overseas rate is set. So the pre-order is
            India-only for now and says so, rather than quoting a converted
            price we cannot yet ship against. */}
        {bookOrderable ? (
          <button type="button" className="btn-taash" onClick={preOrder} disabled={adding}>
            {adding ? "Adding..." : <>Pre-order the book · <MarketMoney inr={TAASH_BOOK_PRICE_INR} /></>}
          </button>
        ) : (
          <a className="btn-taash" href="/contact">
            Enquire about the book
          </a>
        )}
      </div>
      <p className="book-preorder-note">
        {bookOrderable ? (
          <>
            This is a pre-order for the printed book, scheduled for release on
            24 October 2026. Delivery timing depends on your location.
            For delivery enquiries, <a href="/contact">contact Zyvorah</a>.
          </>
        ) : (
          <>
            The printed book is released on 24 October 2026 and is currently
            available to pre-order within India only. Tell us where you are and
            we will arrange a quote for delivery to {market.countryName}.
          </>
        )}
      </p>
      {error ? <p className="book-error">{error}</p> : null}

      <dialog
        ref={dialogRef}
        className="taash-reader"
        aria-label="Look inside the TAASH book"
        onClose={() => setReaderOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeReader();
        }}
      >
        <div className="taash-reader-shell">
          <div className="taash-reader-bar">
            <div>
              <strong>TAASH</strong>
              <span>{visiblePageLabel(page)}</span>
            </div>
            <button type="button" onClick={closeReader} aria-label="Close book">
              Close
            </button>
          </div>

          <div className="taash-reader-stage">
            {readerOpen ? (
              <div ref={bookRef} className="taash-page-flip">
                {PAGE_INDEXES.map((index) => (
                  <div
                    key={index}
                    className={`taash-reader-leaf ${index === 0 || index === TAASH_BOOK_PAGE_COUNT - 1 ? "outer-cover" : ""}`}
                    data-density={index < 2 || index >= TAASH_BOOK_PAGE_COUNT - 2 ? "hard" : "soft"}
                  >
                    <Image
                      src={taashBookPageSrc(index)}
                      alt={index === 0 ? "TAASH front cover" : index === TAASH_BOOK_PAGE_COUNT - 1 ? "TAASH back cover" : `TAASH book page ${index + 1}`}
                      width={1100}
                      height={1475}
                      sizes="(max-width: 720px) 88vw, 42vw"
                      loading={index < 5 ? "eager" : "lazy"}
                      unoptimized
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="taash-reader-controls">
            <button
              type="button"
              onClick={() => pageFlipRef.current?.flipPrev()}
              disabled={page <= 0}
            >
              Previous
            </button>
            <span>Drag a page corner or use the buttons</span>
            <button
              type="button"
              onClick={() => pageFlipRef.current?.flipNext()}
              disabled={page >= TAASH_BOOK_PAGE_COUNT - 1}
            >
              Next
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
