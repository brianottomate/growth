"use client";

import { defineRegistry } from "@json-render/react";
import {
  ArrowUpRight,
  Check,
  Globe2,
  Mail,
  RefreshCw,
  CalendarDays,
  ChevronRight,
  BedDouble,
  Users,
  TrendingUp,
} from "lucide-react";
import { catalog } from "@/lib/os-demo/catalog";
import s from "./os-demo.module.css";

function BookingPreview() {
  return (
    <div className={s.site}>
      <div className={s.siteNav}>
        <strong>
          evergreen<span> STAYS</span>
        </strong>
        <span>Our homes &nbsp; · &nbsp; Our story</span>
      </div>
      <div className={s.siteHero}>
        <span className={s.eyebrow}>ROOM TO RECONNECT</span>
        <h3>
          A little closer
          <br />
          to what matters.
        </h3>
        <p>Remarkable homes. Unhurried days.</p>
        <div className={s.searchBar}>
          <span>
            <CalendarDays size={16} /> Pick your dates
          </span>
          <span>
            <Users size={16} /> 2 guests
          </span>
          <span className={s.searchAction}>
            Find your stay <ArrowUpRight size={16} />
          </span>
        </div>
      </div>
      <div className={s.siteBottom}>
        <div>
          <span className={s.eyebrow}>YOUR NEXT CHAPTER</span>
          <h4>Somewhere worth staying.</h4>
        </div>
        <span className={s.homeTag}>
          <BedDouble size={16} /> 12 thoughtfully chosen homes
        </span>
      </div>
      <div className={s.siteNote}>
        Illustrative website · Evergreen Stays is a fictional brand
      </div>
    </div>
  );
}
function CampaignPreview() {
  return (
    <div className={s.workspace}>
      <div className={s.workspaceTop}>
        <span>
          <Mail size={17} /> Guest marketing
        </span>
        <span className={s.pill}>Example journey</span>
      </div>
      <h3>A great stay is just the beginning.</h3>
      <p className={s.muted}>
        Give guests a reason to come back, at the right moment.
      </p>
      <div className={s.journey}>
        {[
          "Guest checks out",
          "A thoughtful follow-up",
          "An invitation to return",
        ].map((label, i) => (
          <div key={label}>
            <span className={s.step}>{i + 1}</span>
            <span>{label}</span>
            {i < 2 && <ChevronRight size={16} />}
          </div>
        ))}
      </div>
      <div className={s.email}>
        <div className={s.emailMeta}>
          <span>FROM &nbsp; Evergreen Stays</span>
          <span>SUBJECT &nbsp; Your next slow morning awaits</span>
        </div>
        <div className={s.emailBody}>
          <span className={s.eyebrow}>UNTIL NEXT TIME</span>
          <h4>
            There’s more
            <br />
            to come back to.
          </h4>
          <p>
            We loved being part of your getaway. When you’re ready for another
            deep breath, your next favorite place is waiting.
          </p>
          <span className={s.emailButton}>Find your next stay ↗</span>
        </div>
      </div>
    </div>
  );
}
function IntegrationPreview() {
  return (
    <div className={s.workspace}>
      <div className={s.workspaceTop}>
        <span>
          <RefreshCw size={17} /> Your connected business
        </span>
        <span className={s.pill}>Integration overview</span>
      </div>
      <h3>Everything in its right place.</h3>
      <p className={s.muted}>
        Your PMS handles operations. WanderOS powers your direct-booking
        experience.
      </p>
      <div className={s.integrationFlow}>
        <div className={s.systemBox}>
          <span className={s.systemIcon}>
            <CalendarDays />
          </span>
          <strong>Your PMS</strong>
          <small>Your operational source of truth</small>
        </div>
        <div className={s.syncLine}>
          <RefreshCw size={20} />
          <span>Sync</span>
        </div>
        <div className={s.systemBox}>
          <span className={s.systemIcon}>
            <Globe2 />
          </span>
          <strong>WanderOS</strong>
          <small>Your brand’s direct-booking platform</small>
        </div>
      </div>
      <div className={s.syncFields}>
        {["Listings", "Availability", "Pricing"].map((x) => (
          <span key={x}>
            <Check size={15} />
            {x}
          </span>
        ))}
      </div>
      <p className={s.eyebrow}>FEATURED PMS INTEGRATIONS</p>
      <div className={s.providers}>
        {[
          "Guesty",
          "Hostaway",
          "Streamline",
          "Escapia",
          "Track",
          "Rentals United",
        ].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
    </div>
  );
}
function AnalyticsPreview() {
  const heights = [24, 36, 30, 47, 43, 58, 49, 68, 63, 76, 71, 88];
  return (
    <div className={s.workspace}>
      <div className={s.workspaceTop}>
        <span>
          <TrendingUp size={17} /> Booking performance
        </span>
        <span className={s.pill}>Sample data · Last 30 days</span>
      </div>
      <h3>Your progress, at a glance.</h3>
      <p className={s.muted}>
        An illustrative view of how direct bookings can be explored.
      </p>
      <div className={s.metrics}>
        {[
          ["Booking revenue", "$42,800"],
          ["Direct bookings", "64"],
          ["Booked nights", "192"],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className={s.chart}>
        <div className={s.chartHeading}>
          <strong>Direct booking revenue</strong>
          <span>Illustrative trend</span>
        </div>
        <div
          className={s.bars}
          role="img"
          aria-label="Illustrative bar chart with an upward trend; invented data, not actual results."
        >
          {heights.map((h, i) => (
            <div key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className={s.chartAxis}>
          <span>Sep 1</span>
          <span>Sep 15</span>
          <span>Sep 30</span>
        </div>
      </div>
      <p className={s.sampleNote}>
        All figures are invented. This concept is not a forecast or a claim
        about the current dashboard.
      </p>
    </div>
  );
}
export const { registry } = defineRegistry(catalog, {
  components: {
    BookingPreview: () => <BookingPreview />,
    CampaignPreview: () => <CampaignPreview />,
    IntegrationPreview: () => <IntegrationPreview />,
    AnalyticsPreview: () => <AnalyticsPreview />,
  },
});
