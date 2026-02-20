// Client-safe utility types (no database dependencies)

export type DateString = string; // YYYY-MM-DD

export type DateKeyString = string; //`${number}-${number}-${number}`;

export type DateValueMap = Record<DateKeyString, number>;

// Generic chart data types for analytics
export type ChartDataKey = string;

export type ChartDataPoint = {
  xDataKey: string;
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
} & {
  [key: string]: number | string;
};

type FileEvent =
  | "File reading Initialized"
  | "File reading Aborted"
  | "File reading Failed"
  | "File reading Succeeded"
  | "File reading Rejected";
type DataEvent =
  | "Data Upload Initialized"
  | "Data Upload Succeeded"
  | "Data Upload Failed"
  | "Data Processing Started"
  | "Data Processing Completed"
  | "Data Updated"
  | "Data Deleted";

type MiscEvent =
  | "Newsletter Signup"
  | "Waitlist Signup"
  | "FAQ Question Clicked"
  | "Feedback Submitted";
// TODO split client and server events

type PurchaseEvent =
  | "Subscription Purchase"
  | "Product Purchase"
  | "Webhook Error";

export type AnalyticsEventName =
  | DataEvent
  | FileEvent
  | MiscEvent
  | PurchaseEvent;
export type AnalyticsEventProperties = Record<
  string,
  string | number | boolean | null | string[] | undefined
>;

export type VercelAllowedPropertyValues = string | number | boolean | null;
