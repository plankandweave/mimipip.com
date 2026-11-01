"use client";

import { useEffect, useRef } from "react";

const GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID = 5828336327;
const SCRIPT_ID = "google-customer-reviews-platform";

type SurveyOptIn = {
  merchant_id: number;
  order_id: string;
  email: string;
  delivery_country: string;
  estimated_delivery_date: string;
};

declare global {
  interface Window {
    gapi?: {
      load: (name: string, callback: () => void) => void;
      surveyoptin?: { render: (settings: SurveyOptIn) => void };
    };
  }
}

/**
 * Google Customer Reviews' required post-purchase opt-in.
 *
 * It mounts only after a paid order is confirmed. The customer still chooses
 * whether to receive Google's survey; a blocked or failed Google script never
 * affects the order confirmation page.
 */
export function GoogleCustomerReviewOptIn(props: Omit<SurveyOptIn, "merchant_id">) {
  const rendered = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const renderSurvey = () => {
      if (cancelled || rendered.current || !window.gapi) return;
      window.gapi.load("surveyoptin", () => {
        if (cancelled || rendered.current || !window.gapi?.surveyoptin) return;
        rendered.current = true;
        window.gapi.surveyoptin.render({
          merchant_id: GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID,
          ...props,
        });
      });
    };

    if (window.gapi) {
      renderSurvey();
    } else {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = "https://apis.google.com/js/platform.js";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderSurvey, { once: true });
    }

    return () => {
      cancelled = true;
      document.getElementById(SCRIPT_ID)?.removeEventListener("load", renderSurvey);
    };
  }, [props]);

  return null;
}
