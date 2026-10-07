/** Hard ceiling across the portfolio and destination summaries, not per home. */
export const BOOKING_DEMAND_CONTEXT_LIMIT = 8_000;
const MAX_TOWNS = 6;

export type BookingOrigin = {
  city?: string;
  state: string | null;
  country: string | null;
  bookings: number;
  share: number;
};

export type BookingDemandSummary = {
  town: string | null;
  bookings: number;
  profileMatched: number;
  cityKnown: number;
  stateKnown: number;
  medianNights: number | null;
  medianLeadDays: number | null;
  checkinMonths: { month: string; bookings: number }[];
  cities: BookingOrigin[];
  states: BookingOrigin[];
};

export type BookingDemand = {
  status: "available" | "unavailable" | "not-connected";
  source: "BigQuery direct-site confirmed bookings; current guest profile location";
  period: "Confirmed in past 12 months";
  scope: "Imported WanderOS homes on this brand's booking website";
  summaries: BookingDemandSummary[];
};

/** Keep valid JSON and the portfolio totals when a large brand reaches the cap. */
export function bookingDemandContext(demand: BookingDemand): string {
  const summaries = demand.summaries.slice(0, MAX_TOWNS + 1).map((row) => ({
    town: row.town?.slice(0, 80) ?? null,
    bookings: row.bookings,
    profileMatched: row.profileMatched,
    cityKnown: row.cityKnown,
    stateKnown: row.stateKnown,
    medianNights: row.medianNights,
    medianLeadDays: row.medianLeadDays,
    cities: row.cities.slice(0, 5).map((origin) => ({
      city: origin.city?.slice(0, 60),
      state: origin.state?.slice(0, 40) ?? null,
      country: origin.country?.slice(0, 40) ?? null,
      bookings: origin.bookings,
      share: origin.share,
    })),
    states: row.states.slice(0, 5).map((origin) => ({
      state: origin.state?.slice(0, 40) ?? null,
      country: origin.country?.slice(0, 40) ?? null,
      bookings: origin.bookings,
      share: origin.share,
    })),
    checkinMonths: row.checkinMonths
      .slice(0, 12)
      .map(({ month, bookings }) => ({ month: month.slice(0, 2), bookings })),
  }));
  const render = () =>
    JSON.stringify({
      status: demand.status,
      source: demand.source,
      period: demand.period,
      scope: demand.scope,
      summaries,
      destinationLimit: MAX_TOWNS,
    });
  let text = render();
  while (text.length > BOOKING_DEMAND_CONTEXT_LIMIT) {
    if (summaries.length > 1) summaries.pop();
    else {
      const portfolio = summaries[0];
      if (portfolio?.states.length) portfolio.states.pop();
      else if (portfolio?.cities.length) portfolio.cities.pop();
      else break;
    }
    text = render();
  }
  return text;
}
