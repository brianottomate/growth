import { describe, expect, test } from "bun:test";

import {
  HOTEL_FEED_COLUMNS,
  hotelFeedCsv,
  hotelFeedDescription,
  hotelFeedRows,
  hotelFeedXml,
  type HotelFeedHome,
} from "./meta-hotel-feed";

const redQuill: HotelFeedHome = {
  id: "709",
  name: 'Red Quill Villa 709, "The Nest"',
  url: "https://www.winterparkescapes.com/property/red-quill-villa-709",
  imageUrl: "https://img.example.com/709.jpg",
  city: "Winter Park",
  state: "CO",
  country: "US",
  bedrooms: 3,
  bathrooms: 2,
  guests: 10,
  nightlyFrom: 425,
};

describe("hotel feed", () => {
  test("a home without a photo is not a row; the caller reports it", () => {
    const rows = hotelFeedRows(
      [redQuill, { ...redQuill, id: "710", imageUrl: null }],
      "Winter Park Escapes",
    );
    expect(rows.map((row) => row.id)).toEqual(["709"]);
  });

  test("price is Meta's number-then-currency form, and absent when the feed had none", () => {
    const [priced, unpriced] = hotelFeedRows(
      [redQuill, { ...redQuill, id: "710", nightlyFrom: undefined }],
      "Winter Park Escapes",
    );
    expect(priced!.price).toBe("425.00 USD");
    expect(unpriced!.price).toBe("");
  });

  test("the description is written from the facts only", () => {
    expect(hotelFeedDescription(redQuill)).toBe(
      'Red Quill Villa 709, "The Nest" in Winter Park, CO. 3 bedrooms, 2 baths, sleeps 10. From $425 a night.',
    );
  });

  test("CSV keeps the template's column order and quotes commas and quotes", () => {
    const csv = hotelFeedCsv(hotelFeedRows([redQuill], "Winter Park Escapes"));
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(HOTEL_FEED_COLUMNS.join(","));
    expect(row).toContain('"Red Quill Villa 709, ""The Nest"""');
    // Country is spelled out the way the template's sample row does.
    expect(row).toContain(",Winter Park,CO,United States,");
  });

  test("XML is the hotel listings document, with markup in names escaped", () => {
    const feed = hotelFeedXml(
      hotelFeedRows(
        [{ ...redQuill, name: "Aspen & Pine <Lodge>" }],
        "Winter Park Escapes",
      ),
      "Winter Park Escapes",
    );
    expect(
      feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<listings>'),
    ).toBe(true);
    expect(feed).toContain("<name>Aspen &amp; Pine &lt;Lodge&gt;</name>");
    expect(feed).toContain("<base_price>425.00 USD</base_price>");
    expect(feed).not.toContain("<item>");
  });
});
