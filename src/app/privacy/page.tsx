
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { SUBSCRIBE_DISCLOSURE } from "@/lib/subscribe-disclosure";

// The date this page last changed. Not ADS_CONSENT_POLICY_VERSION: that one is
// stamped on every Customer Match consent record and must move only when the
// personalised-ads wording does.
const PRIVACY_UPDATED = "2026-10-06";

export const metadata: Metadata = editorialMetadata("/privacy");

  function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy policy"
      intro={`How Zyvorah collects, uses and protects your personal information, and the rights you have over it under India's Digital Personal Data Protection Act, 2023. Last updated ${new Date(PRIVACY_UPDATED).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`}
      sections={[
        { heading: "What we collect", body: "Contact and delivery details you provide (name, email, phone, address), your order and payment status, and basic usage data — including the approximate town and country a visit comes from, as our network provider reads it (never your precise location, and we do not store your IP address). Photos you upload to the room visualiser are processed to render your preview and, if you choose to save or order, stored with your board or order." },
        { heading: "How we use it", body: "To process and deliver your orders, provide the design and visualiser tools, send order updates, respond to enquiries, measure which of our adverts bring people to the store, send you our newsletter and news about new collections (see “Our newsletter” below), and — only if you opt in — show you our designs in ads on Google and Meta." },
        {
          heading: <span id="newsletter">Our newsletter</span>,
          body: (
            <>
              <p>
                When you give us your email address — by creating an account, signing in, placing an order, ordering a
                sample, chatting with our concierge, joining our newsletter or sending us a message — you are subscribed
                to our newsletter and emails about new collections. We say so directly under the button you press:
                &ldquo;{SUBSCRIBE_DISCLOSURE}&rdquo;
              </p>
              <p>
                You can unsubscribe at any time with the one-click link in any of these emails, or by writing to
                hello@zyvorah.com. Once you unsubscribe, giving us your email again (for example at checkout) does not
                subscribe you again. Our concierge asks you to confirm your email with a one-time code before it answers, and we keep the conversation
                with it so we can follow up, for example when a design you asked about arrives.
              </p>
              <p>
                Transactional emails are separate: sign-in codes, order confirmations, delivery updates and replies to
                your messages are sent whether or not you are subscribed, because they are part of the service you
                asked for. Unsubscribing never stops them.
              </p>
            </>
          ),
        },
        { heading: "Payments", body: "Payments are processed by Razorpay. We do not store your full card details; card and UPI data are handled by Razorpay under their security standards." },
        { heading: "Sharing", body: "We share data only with service providers who help us run the store (payment, hosting, printing, delivery and customer reviews) and only as needed to fulfil your order or provide a service you choose. After a paid order, Google Customer Reviews may show an optional survey invitation; if it does, Google receives your order reference, email, delivery country and estimated delivery date so it can send the survey. Google and Meta also receive the limited data described under “Advertising and measurement” below, and, only with your consent, under “Personalised ads”. We do not sell your personal data." },
        {
          heading: "Advertising and measurement",
          body: (
            <>
              <p>
                We run adverts on Google and Meta (Facebook and Instagram). To know whether an advert worked, the Google
                tag (Google Ads and Google Analytics) and the Meta Pixel run on this site and record page visits and a
                few key actions: signing up, sending an enquiry, and placing an order.
              </p>
              <p>
                At those moments your email address and phone number are also sent in hashed (scrambled, one-way)
                form so each platform can match the action to an advert you may have clicked. Google&apos;s tag hashes
                them in your browser (Google &ldquo;enhanced conversions&rdquo;); for Meta we hash them on our own
                servers before sending (Meta &ldquo;Conversions API&rdquo;). This is used to measure and improve our
                adverts. It does not add you to any advertising list.
              </p>
              <p>
                You can limit this in your browser settings, your{" "}
                <a className="underline" href="https://myadcenter.google.com/">Google My Ad Center</a> and your{" "}
                <a className="underline" href="https://www.facebook.com/adpreferences/">Meta ad preferences</a>.
              </p>
            </>
          ),
        },
        {
          heading: <span id="personalised-ads">Personalised ads, only with your consent</span>,
          body: (
            <>
              <p>
                If, and only if, you tick the optional box &ldquo;Show me Zyvorah designs in ads on Google and
                Meta&rdquo; (offered when you sign in, at checkout and on your account page), or press &ldquo;Yes, show
                me Zyvorah designs&rdquo; on the page an email from us links to, we add a hashed copy of
                your email address and phone number to a customer list we upload to Google Ads (&ldquo;Customer
                Match&rdquo;) and Meta (&ldquo;Custom Audiences&rdquo;). The platforms use it only to show you, or
                people like you, our designs. They don&apos;t learn anything else about you from us. Leaving the box
                unticked changes nothing about your orders or account.
              </p>
              <p>
                We record when you agreed, where, and which version of this policy you saw. You can withdraw at any
                time, as easily as you agreed: untick the box on your{" "}
                <Link className="underline" href="/account">account page</Link>, use the link in any of our marketing emails
                (unsubscribing from our emails withdraws this too), or write to hello@zyvorah.com. We then remove you
                from the list at our next upload, and the platforms remove you within their own processing time.
                Nobody who hasn&apos;t said yes in one of these ways is ever included, including customers who signed up before this
                option existed.
              </p>
            </>
          ),
        },
        { heading: "Storage & security", body: "Data is stored on secured infrastructure (Supabase / Cloudflare) with access controls. We retain order records as required for accounting and tax, and keep a record of each consent you give or withdraw for as long as we rely on it and for a reasonable period afterwards, as proof of what you agreed to." },
        {
          heading: "YouTube",
          body: (
            <>
              <p>
                Zyvorah uses YouTube API Services to publish our own videos to our YouTube channel,{" "}
                <a className="underline" href="https://www.youtube.com/@zyvorahwallpapers">@zyvorahwallpapers</a>, and to read
                the public view, like and comment counts of those videos. This is done only by our own staff, for our own
                channel. We do not ask visitors to sign in with YouTube or Google for this, and we do not access, collect or
                store any YouTube viewer&apos;s data.
              </p>
              <p>
                We store only the ID of each video we publish and its public view, like and comment counts, to learn which
                designs our audience prefers. These counts are kept for no longer than 36 months and are deleted from our
                records when the video is removed from our channel; they are never shared or sold.
              </p>
              <p>
                By watching our videos on YouTube you are subject to the{" "}
                <a className="underline" href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and the{" "}
                <a className="underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>. The access our
                channel owner has granted to our tool can be revoked at any time from the{" "}
                <a className="underline" href="https://myaccount.google.com/permissions">Google security settings page</a>.
              </p>
            </>
          ),
        },
        { heading: "Your choices", body: "You can unsubscribe from our newsletter and new-collection emails at any time with the link in any of them, and switch personalised ads off on your account page. Everything else is under your rights below." },
        {
          heading: "Your rights under the DPDP Act, 2023",
          body: (
            <>
              <p>
                You can ask us for a summary of the personal data we hold about you and who we have shared it with;
                have it corrected, completed or updated; have it erased where we no longer need it for the purpose you
                gave it or to meet a legal requirement (such as tax records); withdraw any consent you have given; and
                nominate someone to exercise these rights for you if you die or are unable to.
              </p>
              <p>
                Write to hello@zyvorah.com from the email address on your account, or tell us how to verify you. We
                reply within 30 days. If you are not satisfied with our response, you may complain to the Data
                Protection Board of India.
              </p>
            </>
          ),
        },
        {
          heading: "Grievance officer",
          body: (
            <p>
              Questions or complaints about how we handle your personal data go to our Grievance Officer at{" "}
              <a className="underline" href="mailto:hello@zyvorah.com">hello@zyvorah.com</a> (subject line
              &ldquo;Data protection&rdquo;). We acknowledge within 2 working days and resolve within 30 days. Our
              company name and postal address are on the <Link className="underline" href="/contact">contact page</Link>.
            </p>
          ),
        },
        { heading: "Cookies", body: "We use essential cookies to run the cart and keep the site working, and an anonymous personalisation cookie that remembers the styles of designs you engage with on this site so we can suggest designs you're more likely to love. It isn't linked to your name or email and is never shared or used for advertising. The Google tag and the Meta Pixel also set cookies to measure page visits and whether an advert led to a sign-up, enquiry or purchase (see “Advertising and measurement”). You can block or clear cookies in your browser." },
        { heading: "Contact", body: "Questions about privacy? Email hello@zyvorah.com." },
      ]}
      cta={{ label: "Contact us", href: "/contact" }}
    />
  );
}

export default withBrandEditorial("/privacy", PrivacyPage);
