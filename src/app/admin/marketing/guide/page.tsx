
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
/**
 * Marketing, explained — the reference page behind every number in the morning
 * brief and on the marketing desk.
 *
 * WHY THIS PAGE EXISTS
 * Roheena's words: "It's just so much of a world to learn. While I do want to
 * have agents do everything, I do want to also understand what's going on in
 * the marketing side of things."
 *
 * The agents can run the channels without her. What they cannot do is give her
 * the judgement to overrule them, and she cannot build that judgement from a
 * dashboard of acronyms. So this page explains, in her terms and against her
 * actual business, what each number is, what good looks like for wallpaper at
 * her prices, and what a bad reading should make her do.
 *
 * It is deliberately static prose, not a dashboard. Numbers live in the brief
 * and on the desk; this is the thing you read once and refer back to. It sits
 * under /admin, so Cloudflare Access is the gate and there is no data to leak.
 *
 * KEEP IT HONEST: when a number here stops matching how the code computes it,
 * fix this page in the same change. A guide that quietly goes stale is worse
 * than no guide, because it teaches the wrong instinct.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = brandMetadata({
  title: "Marketing, explained · Zyvorah",
  robots: { index: false, follow: false },
});

const INK = "#0F0F0F";
const SLATE = "#3f3f3f";
const MIST = "#6b6b6b";
const LINE = "#ececec";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 44, scrollMarginTop: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: "-0.01em", margin: 0 }}>{title}</h2>
      <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.72, color: SLATE }}>{children}</div>
    </section>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, paddingLeft: 14, borderLeft: `3px solid ${LINE}` }}>
      <div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>{name}</div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "14px 16px",
        background: "#f7f7f4",
        borderRadius: 12,
        fontSize: 14.5,
        lineHeight: 1.65,
      }}
    >
      {children}
    </div>
  );
}

export default function MarketingGuide() {
  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "48px 22px 96px", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/zyvorah-wordmark.svg" alt="Zyvorah" style={{ height: 28, width: "auto", display: "block" }} />

      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: INK, marginTop: 18, marginBottom: 0, lineHeight: 1.2 }}>
        Marketing, explained
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, color: SLATE, marginTop: 14 }}>
        Every number in the morning brief, in plain words: what it is, what good looks like for a business
        selling murals at ₹19,000 rather than mugs at ₹300, and what you should do when it reads badly.
        You do not need to run the channels. You need enough to tell when an agent is wrong.
      </p>
      <p style={{ fontSize: 14, color: MIST, marginTop: 10 }}>
        <Link href="/admin/marketing" style={{ color: INK }}>← Back to the marketing desk</Link>
      </p>

      <Section id="shape" title="First, the shape of this business">
        <p>
          Almost every marketing rule you will read online was written for shops selling cheap things to
          many people. Yours is the opposite, and nearly every judgement follows from that.
        </p>
        <p style={{ marginTop: 10 }}>
          A mural is a considered purchase. People measure a wall, argue with a spouse, order a sample,
          and come back weeks later. So a visitor who does not buy today has not been wasted, and a day
          with no sales is not a failed day. Judge a week, never an hour.
        </p>
        <p style={{ marginTop: 10 }}>
          Because each order is large, you can afford to pay a lot to find one buyer and still do well —
          but only if buyers actually arrive. That is the whole game: a high price per order forgives
          expensive traffic, and punishes traffic that never converts at all.
        </p>
      </Section>

      <Section id="channels" title="The five channels, and what each is really for">
        <Term name="Organic search — people who find you on Google without you paying">
          The slowest and the most valuable. It compounds: a page that ranks keeps earning for years after
          you write it, and the traffic costs nothing per visit. It also takes months to move, which is why
          the brief reports it over seven days and never one. Treat a bad week as noise and a bad month as
          a signal.
        </Term>
        <Term name="Google Ads — paying Google to appear when someone searches">
          The most intentional traffic you can buy, because the person typed what they wanted. This should
          be the best-converting paid channel you have. When it is not, the usual causes are the wrong
          search terms being matched, or the page they land on not answering the thing they searched for.
        </Term>
        <Term name="Meta Ads — paid Instagram and Facebook">
          Interruption, not intention. Nobody on Instagram is looking to buy wallpaper; you are showing them
          something beautiful and hoping it starts a thought. Expect worse immediate conversion than Search
          and more of its value to show up later, as someone who searches your name a fortnight on.
        </Term>
        <Term name="Instagram organic — the posts the engine writes">
          Free, slow, and the main way the brand becomes credible to someone deciding whether to spend
          ₹19,000 with a company they have not heard of. Its value is rarely a sale on the day. Nothing
          posts without your approval, which is why the brief now tells you how many are waiting.
        </Term>
        <Term name="Direct and referral — people who typed the name, or followed a link">
          Usually the healthiest traffic in the report, and largely the delayed result of everything above.
          If this grows while paid stays flat, the brand is working.
        </Term>
      </Section>

      <Section id="numbers" title="The numbers, and what each one should make you do">
        <Term name="Sessions">
          Visits, not people: one person who comes back twice is two sessions. Rising sessions with flat
          orders means you are attracting the wrong people, or the right people are hitting something that
          stops them.
        </Term>
        <Term name="Spend">
          What the ad platform billed, in the platform&apos;s own currency. The brief prints the currency
          code whenever it is not rupees, so a pound of spend can never be misread as a rupee.
        </Term>
        <Term name="Clicks and landings">
          Clicks are what the ad platform says it sent. Landings are what our own site actually saw arrive.
          They never match exactly — people leave before the page loads, and blockers hide some arrivals —
          but a large, persistent gap means the tracking is broken, not the ads.
        </Term>
        <Term name="CPC — cost per click">
          What you paid for one visit. Useful only next to what those visits do. A ₹10 click that never buys
          is expensive; a ₹90 click that buys a ₹19,000 mural is nearly free.
        </Term>
        <Term name="Cost per purchase">
          The number that actually matters. Spend divided by orders from that channel. Against a ₹19,000
          order with healthy margin, several thousand rupees to win one is sound. The reading that should
          worry you is not a high number — it is an empty one, meaning spend with no orders at all.
        </Term>
        <Term name="Conversion rate">
          The share of visits that buy. For considered purchases at this price, a low single-digit percentage
          is normal and under one percent is common. Do not compare yourself to a t-shirt shop.
        </Term>
        <Term name="Bounce / “left straight away”">
          Arrived and did nothing. High bounce on a page you are paying to send people to is the cheapest
          problem on this list to fix, because it is usually a mismatch between the promise in the ad and
          the first thing on the page.
        </Term>
      </Section>

      <Section id="reading" title="How to read the brief in ninety seconds">
        <p>
          Top to bottom, the brief is ordered the way the questions matter: <strong>is anything broken</strong>,
          then <strong>what did it cost</strong>, then <strong>what did the market do</strong>.
        </p>
        <Rule>
          <strong>1. The status board.</strong> Anything red or amber, read that section and nothing else
          until you understand it. A grey line saying an agent “did not report” is a warning too — it means
          nobody checked, not that everything was fine.
        </Rule>
        <Rule>
          <strong>2. Paid channels.</strong> Look only at spend against purchases. Money going out with
          nothing coming back, for more than a few days, is the one paid reading that demands a decision.
        </Rule>
        <Rule>
          <strong>3. Organic and Instagram.</strong> Direction over level. Organic up week on week is good
          news however small. A queue of posts waiting on your approval means Instagram has stopped.
        </Rule>
        <Rule>
          <strong>4. Everything else is context.</strong> Sessions, page views and funnel numbers are there
          to explain the two readings above, not to be acted on by themselves.
        </Rule>
      </Section>

      <Section id="traps" title="Four traps that have already cost this business money">
        <Term name="Spending into a site that does not convert">
          Paid traffic arrived in volume and produced almost no orders. When that happens, more budget makes
          the loss bigger, not smaller. The order of operations is always: prove the page converts someone,
          then buy more of them. Pausing spend while you fix the page is not giving up — it is refusing to
          pay for a leak.
        </Term>
        <Term name="Trusting a conversion number that was never wired up">
          An ad platform can only optimise towards what it can measure. If purchases are not reaching it,
          it will confidently spend your budget on whatever it can see instead — clicks from people who
          were never going to buy. Before believing any “cost per purchase”, confirm purchases are actually
          being recorded on that platform.
        </Term>
        <Term name="Reading a day as if it were a trend">
          At this volume a single order moves every ratio dramatically. One good day is not proof and one
          bad day is not a problem. The brief deliberately shows the week beside the day for this reason.
        </Term>
        <Term name="Letting the approval queue become the strategy">
          The engine composes posts that never publish because nothing approved them. From the outside that
          is indistinguishable from having no Instagram presence at all. If you are not going to review them,
          say so and the schedule should shrink — a channel that is honestly off beats one that is
          accidentally off.
        </Term>
      </Section>

      <Section id="search" title="The four search numbers, which are easy to misread">
        <p>
          Since 25 September the brief and the desk can read Google Search Console, so organic search is no
          longer just a volume. These four numbers come together and only mean something together.
        </p>
        <Term name="Shown (impressions)">
          How often a page of ours appeared in Google&apos;s results at all. This is reach, and it is the one
          number that says whether Google thinks we are relevant to a search in the first place.
        </Term>
        <Term name="Clicks">
          How often someone chose us over everything else on the page.
        </Term>
        <Term name="Chosen when shown (click-through rate)">
          Clicks divided by times shown. This measures the listing, not the page: the title and the sentence
          underneath it are what someone reads before deciding.
        </Term>
        <Term name="Rank (average position)">
          Where we typically sat in the results. <strong>Lower is better.</strong> Rank 1 is the top result;
          rank 40 is the fourth page, where almost nobody looks.
        </Term>
        <Rule>
          <strong>The reading that matters.</strong> Shown often and chosen rarely is a listing problem —
          Google is already offering us and people are picking someone else, which is fixed by rewriting a
          page title and description. Ranked well but shown rarely is simply a rare search, and rewriting
          will not help; that one needs a different subject, not better words.
        </Rule>
        <Rule>
          <strong>Why the dates look old.</strong> Google finalises this data two to three days late, so the
          window ends three days back rather than yesterday. A fresher window under-reports its last days and
          would read as a fall that never happened.
        </Rule>
      </Section>

      <Section id="gaps" title="What we still cannot see">
        <p>
          One honest gap, so no number here is read as more than it is.
        </p>
        <Term name="Meta spend, until the token is installed">
          Meta&apos;s own spend and cost figures need a Marketing API token. Without it the brief shows the
          visits Analytics saw from Meta and says plainly that the spend feed is missing, rather than
          printing a zero that would read as &ldquo;spent nothing&rdquo;.
        </Term>
      </Section>

      <div style={{ marginTop: 56, paddingTop: 20, borderTop: `1px solid ${LINE}`, fontSize: 13, color: MIST, lineHeight: 1.7 }}>
        If a number in the brief stops matching what this page says it means, the page is wrong and should be
        corrected in the same change as the code. A guide that has quietly gone stale teaches the wrong
        instinct, which is worse than having no guide at all.
      </div>
    </main>
  );
}
