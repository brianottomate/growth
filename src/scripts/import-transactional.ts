/**
 * Seed / refresh the transactional email registry (docs/transactional-emails.md).
 *
 * Source: Adapt's CIO transactional inventory on PLAT-3703 (wandercom/wander @
 * main, 2026-07-16) — 21 `cio.api?.sendEmail` call sites and ~30 env-indirected
 * CIO transactional message IDs — cross-referenced against the
 * `@wandercom/design-system-emails` registry for candidate react-email
 * templates. Curated by hand; re-runs are idempotent.
 *
 * Upsert semantics: inventory-derived fields are overwritten on re-run;
 * operator-owned fields (`status`, `notes`, `linearRef`) are preserved for
 * existing rows so migration tracking in the UI survives refreshes.
 *
 * Run: bun run src/scripts/import-transactional.ts
 */
import { eq, ilike, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  transactionalMessageTable,
  type TransactionalMessageInsert,
} from "@/server/db/transactional-schema";

const REPO = "wandercom/wander";

type SeedRow = Omit<
  TransactionalMessageInsert,
  "id" | "brandId" | "createdAt" | "updatedAt" | "deletedAt"
>;

const contract = (
  entries: Array<[key: string, required: boolean, note?: string]>,
) =>
  entries.map(([key, required, note]) => ({
    key,
    required,
    ...(note ? { note } : {}),
  }));

// `isStaging` accompanies almost every payload; noted once per contract only
// where it isn't sent, to keep rows readable.
const ROWS: SeedRow[] = [
  // ---- auth ---------------------------------------------------------
  {
    key: "auth.magic_link",
    name: "Log in to your Wander account",
    description:
      "Magic-link / OTP login email. The PLAT-3703 poster child: still on the legacy CIO-UI template.",
    workspace: "shared",
    domain: "auth",
    criticality: "auth_blocking",
    triggerKind: "event",
    triggerEvent: "User requests a sign-in link or code",
    provider: "customerio",
    providerRef: { envVar: "CIO_MAGIC_LINK_MESSAGE_ID" },
    codeRefs: [
      { repo: REPO, path: "src/users/auth/module/src/utils/magic/email.ts", line: 72 },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.email-code",
    dataContract: contract([
      ["magic_link_url", true],
      ["platform", true],
      ["digits", false, "OTP code, present for code-based flows"],
      ["isStaging", true],
    ]),
    previewProps: {
      signInUrl: "{{magic_link_url}}",
      loginCode: "123456",
      orgName: "Wander",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
    linearRef: "PLAT-3703",
  },
  {
    key: "auth.verification_reminder",
    name: "ID verification reminder",
    description:
      "Nudges guests with a booking who still haven't completed identity verification.",
    workspace: "marketplace",
    domain: "auth",
    criticality: "operational",
    triggerKind: "condition",
    triggerEvent: "Booking exists and identity is still unverified",
    triggerAnchor: "booking_created",
    triggerLabel: "cron sweep while unverified",
    provider: "customerio",
    providerRef: { envVar: "CIO_VERIFICATION_REMINDER_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/users/users/module/src/actions/identity/unconfirmed-bookings.cron.ts",
        line: 81,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.verify-identity",
    dataContract: contract([["unitImage", true]]),
    previewProps: {
      verifyUrl: "{{verify_url}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "auth.verify_email",
    name: "Verify email (declared, never sent)",
    description:
      "CIO_VERIFY_EMAIL_MESSAGE_ID is declared in envs.ts but has no call site.",
    workspace: "shared",
    domain: "auth",
    criticality: "informational",
    triggerKind: "event",
    triggerEvent: "None — dead env var",
    provider: "customerio",
    providerRef: { envVar: "CIO_VERIFY_EMAIL_MESSAGE_ID" },
    codeRefs: [],
    templateSource: "cio_ui",
    dataContract: [],
    status: "dead",
  },

  // ---- booking (marketplace guest) -----------------------------------
  {
    key: "booking.trip_confirmed",
    name: "Trip confirmed",
    description:
      "Booking confirmation with receipt. Also sent by rescheduling create/confirm (without the receipt block).",
    workspace: "marketplace",
    domain: "booking",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "Booking confirmed (or reschedule created/confirmed)",
    provider: "customerio",
    providerRef: { envVar: "CIO_TRIP_CONFIRMED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/pms/bookings/module/src/events/booking-confirmed/index.ts",
        line: 459,
      },
      {
        repo: REPO,
        path: "src/pms/reschedulings/src/actions/create.ts",
        line: 397,
        note: "reschedule — sends subset without receipt",
      },
      {
        repo: REPO,
        path: "src/pms/reschedulings/src/logic/confirm.ts",
        line: 383,
        note: "reschedule confirm — same subset",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.trip-confirmed",
    dataContract: contract([
      ["idVerificationNeeded", true],
      ["unitImage", true],
      ["unitName", true],
      ["propertyAddress", true],
      ["checkInDate", true],
      ["checkOutDate", true],
      ["checkInTime", true],
      ["checkOutTime", true],
      ["totalNights", true],
      ["receipt", false, "object: total, tax, nightlyPrice, nightTotal, items[], coupons[], pointsUsed, creditsUsed — omitted on reschedules"],
      ["beforeGap", false],
      ["afterGap", false],
    ]),
    previewProps: {
      propertyName: "{{unitName}}",
      propertyImageUrl: "https://images.wander.com/placeholder.jpg",
      bookingDates: "Aug 14 – Aug 19",
      bookingGuests: 2,
      checkInTime: "4:00 PM",
      checkOutTime: "11:00 AM",
      invoiceItems: [
        { label: "5 nights × {{nightlyPrice}}", value: "{{nightTotal}}" },
        { label: "Taxes & fees", value: "{{tax}}" },
      ],
      total: "{{total}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "booking.trip_cancelled",
    name: "Booking cancelled",
    workspace: "marketplace",
    domain: "booking",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "Booking cancelled",
    provider: "customerio",
    providerRef: { envVar: "CIO_TRIP_CANCELLED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/pms/bookings/module/src/events/booking-cancelled/index.ts",
        line: 124,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.booking-cancelled",
    dataContract: contract([
      ["unitName", true],
      ["unitImage", true],
      ["checkInDate", true],
      ["checkOutDate", true],
      ["totalNight", true, "sic — singular in payload"],
      ["bookingTotal", true],
    ]),
    previewProps: {
      propertyName: "{{unitName}}",
      propertyImageUrl: "https://images.wander.com/placeholder.jpg",
      bookingDates: "Aug 14 – Aug 19",
      bookingGuests: 2,
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "booking.guest_intro",
    name: "Guest intro email (v1/v2)",
    description:
      "Pre-arrival intro for Listed homes; per-unit template override via unit.emailTemplates. v1 default + v2 Listed variant.",
    workspace: "os",
    domain: "booking",
    criticality: "operational",
    triggerKind: "anchored",
    triggerEvent: "Upcoming stay approaches",
    triggerAnchor: "check_in",
    triggerOffsetMinutes: -3 * 24 * 60,
    triggerLabel: "cron ahead of check-in",
    provider: "customerio",
    providerRef: {
      envVar: "CIO_DEFAULT_INTRO_EMAIL_MESSAGE_ID",
      note: "v2: CIO_LISTED_INTRO_EMAIL_V2_MESSAGE_ID; per-unit override possible",
    },
    codeRefs: [
      {
        repo: REPO,
        path: "src/pms/bookings/module/src/actions/crons/intro-email-alerts.ts",
        line: 43,
      },
      {
        repo: REPO,
        path: "src/pms/bookings/module/src/utils/intro-emails.ts",
        line: 52,
        note: "buildEmailMessage constructs the request",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.upcoming-stay",
    dataContract: contract([
      ["guestName", true],
      ["guestEmail", true],
      ["guestPhone", true],
      ["checkInDate", true],
      ["checkOutDate", true],
      ["unitName", true],
      ["hostName", true],
    ]),
    previewProps: {
      guestFirstName: "{{guestName}}",
      propertyName: "{{unitName}}",
      checkInDate: "Aug 14",
      checkOutDate: "Aug 19",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "booking.host_reminder",
    name: "Host intro reminder",
    description: "Reminds the host ahead of an upcoming stay (intro-email shape).",
    workspace: "os",
    domain: "booking",
    criticality: "operational",
    triggerKind: "anchored",
    triggerEvent: "Upcoming stay approaches",
    triggerAnchor: "check_in",
    triggerLabel: "cron ahead of check-in",
    provider: "customerio",
    providerRef: { envVar: "CIO_HOST_REMINDER_MESSAGE_ID", defaultId: "" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/pms/bookings/module/src/actions/crons/host-reminder-email-alerts.ts",
        line: 33,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.upcoming-booking",
    dataContract: contract([
      ["guestName", true],
      ["checkInDate", true],
      ["checkOutDate", true],
      ["unitName", true],
      ["hostName", true],
    ]),
    previewProps: {
      operatorName: "{{hostName}}",
      checkInDate: "Aug 14",
      departureDate: "Aug 19",
      propertyName: "{{unitName}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },

  // ---- os-notifications (owner/operator) ------------------------------
  {
    key: "os.owner_new_booking",
    name: "Owner: new booking(s)",
    workspace: "os",
    domain: "os_notifications",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "New booking lands for an owner's unit (batched)",
    provider: "customerio",
    providerRef: { envVar: "CIO_NEW_OWNER_BOOKING_MESSAGE_ID", defaultId: "47" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/owner-new-bookings.ts",
        line: 193,
      },
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "also routed via OsNotificationType",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.new-booking",
    dataContract: contract([
      ["orgSlug", true],
      ["unitImage", true],
      ["bookingCount", true],
      ["bookings", true, "array: id, unitName, dates, revenue, bookedAt"],
    ]),
    previewProps: {
      propertyName: "{{unitName}}",
      bookingDates: "Aug 14 – Aug 19",
      bookedOn: "Jul 16",
      dashboardUrl: "{{dashboard_url}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "os.owner_new_review",
    name: "Owner: new review",
    workspace: "os",
    domain: "os_notifications",
    criticality: "informational",
    triggerKind: "event",
    triggerEvent: "Guest leaves a review on an owner's unit",
    provider: "customerio",
    providerRef: { envVar: "CIO_NEW_OWNER_REVIEW_MESSAGE_ID", defaultId: "50" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/owner-new-review.ts",
        line: 139,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.new-review",
    dataContract: contract([
      ["orgSlug", true],
      ["score", true],
      ["reviewId", true],
      ["unitId", true],
      ["review", true],
      ["unitName", true],
      ["unitImage", true],
      ["dates", true],
    ]),
    status: "live_legacy",
  },
  {
    key: "os.cleaning_reminder",
    name: "Cleaning reminder",
    workspace: "os",
    domain: "os_notifications",
    criticality: "operational",
    triggerKind: "anchored",
    triggerEvent: "Turnover cleaning due",
    triggerAnchor: "check_out",
    triggerLabel: "around checkout",
    provider: "customerio",
    providerRef: {
      envVar: "CIO_BOOKING_CLEANING_REMINDER_MESSAGE_ID",
      defaultId: "56",
    },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.BOOKING_CLEANING_REMINDER",
      },
    ],
    templateSource: "cio_ui",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    status: "live_legacy",
  },
  {
    key: "os.branded_booking_cancelled",
    name: "Branded booking cancelled (operator's guest)",
    workspace: "os",
    domain: "os_notifications",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "Booking cancelled on a branded/WanderOS property",
    provider: "customerio",
    providerRef: { envVar: "CIO_BRANDED_BOOKING_CANCELLED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.BOOKING_CANCELLED",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "os.transactional.guest.booking-cancelled",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    status: "live_legacy",
  },
  {
    key: "os.task_assigned",
    name: "Task assigned (internal)",
    workspace: "os",
    domain: "os_notifications",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "Task assigned to a teammate",
    provider: "customerio",
    providerRef: { envVar: "CIO_TASK_ASSIGNED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.TASK_ASSIGNED",
      },
    ],
    templateSource: "cio_ui",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    status: "live_legacy",
  },
  {
    key: "os.payout_sent",
    name: "Payout sent",
    workspace: "os",
    domain: "payments",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "Owner payout dispatched",
    provider: "customerio",
    providerRef: { envVar: "CIO_BRANDED_PAYOUT_SENT_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.PAYOUT_SENT",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.payout-sent",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    previewProps: {
      propertyName: "{{unitName}}",
      dashboardUrl: "{{dashboard_url}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "os.payout_preview",
    name: "Payout preview",
    workspace: "os",
    domain: "payments",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "Owner payout preview generated",
    provider: "customerio",
    providerRef: { envVar: "CIO_BRANDED_PAYOUT_PREVIEW_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.PAYOUT_PREVIEW",
      },
    ],
    templateSource: "cio_ui",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    status: "live_legacy",
  },
  {
    key: "os.w9_received",
    name: "W9 submitted",
    workspace: "os",
    domain: "payments",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "Operator submits a W9",
    provider: "customerio",
    providerRef: { envVar: "CIO_W9_RECEIVED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.W9_SUBMITTED",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.w9-received",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    previewProps: {
      operatorName: "{{operator_name}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "os.w9_approved",
    name: "W9 approved",
    workspace: "os",
    domain: "payments",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "W9 approved",
    provider: "customerio",
    providerRef: { envVar: "CIO_W9_APPROVED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.W9_APPROVED",
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.w9-approved",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    status: "live_legacy",
  },
  {
    key: "os.w9_rejected",
    name: "W9 rejected",
    workspace: "os",
    domain: "payments",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "W9 rejected",
    provider: "customerio",
    providerRef: { envVar: "CIO_W9_REJECTED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-notifications/module/src/actions/notifications/send-to-channel.ts",
        line: 135,
        note: "routed by OsNotificationType.W9_REJECTED",
      },
    ],
    templateSource: "cio_ui",
    dataContract: contract([
      ["(passthrough)", true, "getMessageData(notification.data)"],
    ]),
    status: "live_legacy",
    notes: "No w9-rejected template in design-system-emails yet — template gap.",
  },
  {
    key: "os.owner_unread_chat",
    name: "Owner unread chat (declared, never sent)",
    workspace: "os",
    domain: "os_notifications",
    criticality: "informational",
    triggerKind: "event",
    triggerEvent: "None — dead env var",
    provider: "customerio",
    providerRef: {
      envVar: "CIO_NOTIFY_OWNER_UNREAD_MESSAGE_ID",
      defaultId: "48",
    },
    codeRefs: [],
    templateSource: "cio_ui",
    dataContract: [],
    status: "dead",
  },

  // ---- os-tasks (vendors) ---------------------------------------------
  {
    key: "os_tasks.vendor_task_assigned",
    name: "Vendor: task assigned",
    workspace: "os",
    domain: "os_tasks",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "Task assigned to a vendor",
    provider: "customerio",
    providerRef: { envVar: "CIO_VENDOR_TASK_ASSIGNED_MESSAGE_ID", defaultId: "36" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-tasks/module/src/logic/notification.ts",
        line: 296,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.services.new-task-assigned",
    dataContract: contract([
      ["taskTitle", true],
      ["unitName", true],
      ["taskUrl", true],
      ["priority", true],
      ["dueDate", true],
      ["vendorName", false],
    ]),
    previewProps: {
      propertyName: "{{unitName}}",
      priority: "High",
      dueDate: "Jul 20",
      vendorPortalUrl: "{{task_url}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "os_tasks.vendor_task_overdue",
    name: "Vendor: task(s) overdue",
    workspace: "os",
    domain: "os_tasks",
    criticality: "operational",
    triggerKind: "condition",
    triggerEvent: "Vendor task past its due date and still open",
    triggerAnchor: "task_due",
    triggerLabel: "cron sweep after due date",
    provider: "customerio",
    providerRef: { envVar: "CIO_VENDOR_TASK_OVERDUE_MESSAGE_ID", defaultId: "72" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-tasks/module/src/actions/cron/overdue-reminder.ts",
        line: 120,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.services.overdue-task",
    dataContract: contract([
      ["taskCount", true],
      ["tasks", true, "array: unitName, dueDate, daysOverdue, priority, taskUrl"],
      ["vendorPortalUrl", true],
      ["vendorName", false],
    ]),
    previewProps: {
      vendorPortalUrl: "{{vendor_portal_url}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "os_tasks.vendor_task_completed",
    name: "Vendor: task completed",
    workspace: "os",
    domain: "os_tasks",
    criticality: "informational",
    triggerKind: "event",
    triggerEvent: "Vendor marks a task completed",
    provider: "customerio",
    providerRef: {
      envVar: "CIO_VENDOR_TASK_COMPLETED_MESSAGE_ID",
      defaultId: "78",
    },
    codeRefs: [
      {
        repo: REPO,
        path: "src/core/os-tasks/module/src/logic/notification.ts",
        line: 345,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.services.vendor-task-completed",
    dataContract: contract([
      ["taskTitle", true],
      ["unitName", true],
      ["vendorName", true],
      ["assigneeName", true],
      ["taskUrl", true],
    ]),
    previewProps: {
      recipientName: "{{assigneeName}}",
      vendorName: "{{vendorName}}",
      propertyName: "{{unitName}}",
      wanderOsUrl: "{{task_url}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },

  // ---- invoicing (HNHL) -------------------------------------------------
  {
    key: "invoicing.hnhl_due_soon",
    name: "HNHL payment due soon",
    workspace: "marketplace",
    domain: "invoicing",
    criticality: "legal_financial",
    triggerKind: "anchored",
    triggerEvent: "Upcoming HNHL auto-capture",
    triggerAnchor: "payment_due",
    triggerOffsetMinutes: -3 * 24 * 60,
    triggerLabel: "days before capture (daysLeft in payload)",
    provider: "customerio",
    providerRef: { envVar: "CIO_HNHL_SOON_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/invoicing/module/src/actions/hnhl/send-soon-email.ts",
        line: 130,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.upcoming-payment",
    dataContract: contract([
      ["due", true],
      ["dueFormatted", true],
      ["daysLeft", true],
      ["dueDate", true],
      ["invoiceNumber", true],
      ["cardEnding", true],
      ["cardBrand", true],
      ["unitImage", true],
      ["unitName", true],
    ]),
    previewProps: {
      amount: "{{dueFormatted}}",
      dueBy: "{{dueDate}}",
      propertyName: "{{unitName}}",
      propertyImageUrl: "https://images.wander.com/placeholder.jpg",
      bookingDates: "Aug 14 – Aug 19",
      bookingGuests: 2,
      bookingUrl: "{{booking_url}}",
      companyName: "Wander",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "invoicing.hnhl_capture_success",
    name: "HNHL payment charged",
    workspace: "marketplace",
    domain: "invoicing",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "HNHL auto-capture succeeds",
    provider: "customerio",
    providerRef: { envVar: "CIO_HNHL_SUCCESS_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/invoicing/module/src/utils/hnhl/auto-capture.ts",
        line: 214,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.payment-charged",
    dataContract: contract([
      ["(payload spread)", true, "SendNextAutoCaptureEmailPayload"],
    ]),
    previewProps: {
      propertyName: "{{unitName}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "invoicing.hnhl_capture_failed",
    name: "HNHL payment failed",
    workspace: "marketplace",
    domain: "invoicing",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "HNHL auto-capture fails",
    provider: "customerio",
    providerRef: { envVar: "CIO_HNHL_FAILED_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/invoicing/module/src/utils/hnhl/auto-capture.ts",
        line: 214,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.guest.payment-failed",
    dataContract: contract([
      ["(payload spread)", true, "SendNextAutoCaptureEmailPayload"],
    ]),
    previewProps: {
      amount: "{{amount}}",
      failedAt: "{{failed_at}}",
      propertyName: "{{unitName}}",
      propertyImageUrl: "https://images.wander.com/placeholder.jpg",
      bookingDates: "Aug 14 – Aug 19",
      bookingGuests: 2,
      bookingUrl: "{{booking_url}}",
      companyName: "Wander",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },

  // ---- agreements --------------------------------------------------------
  {
    key: "agreements.reminder",
    name: "Trip agreement reminder",
    workspace: "marketplace",
    domain: "agreements",
    criticality: "operational",
    triggerKind: "condition",
    triggerEvent: "Custom agreement still unsigned as the trip approaches",
    triggerAnchor: "check_in",
    triggerLabel: "reminder while unsigned before check-in",
    provider: "customerio",
    providerRef: { envVar: "CIO_AGREEMENT_REMINDER_MESSAGE_ID" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/business-operations/agreements/src/actions/custom-agreements/send-reminder.ts",
        line: 180,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.sign-agreement",
    dataContract: contract([
      ["owner_name", true],
      ["check_in_date", true],
      ["link", true],
    ]),
    previewProps: {
      deadline: "{{check_in_date}}",
      agreementUrl: "{{link}}",
      propertyName: "{{unitName}}",
      dates: "Aug 14 – Aug 19",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "agreements.post_stay_signed",
    name: "Post-stay agreement signed (PDF attached)",
    workspace: "marketplace",
    domain: "agreements",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "Post-stay agreement signed",
    provider: "customerio",
    providerRef: {
      envVar: "POST_STAY_AGREEMENT_SIGNED",
      defaultId: "41",
      note: "hardcoded const, not env-indirected",
    },
    codeRefs: [
      {
        repo: REPO,
        path: "src/business-operations/agreements/src/utils/export-pdf.ts",
        line: 121,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.agreement-signed",
    dataContract: contract([
      ["agreement_title", true],
      ["signer_name", true],
      ["signer_email", true],
      ["signed_date", true],
      ["unitImage", true],
    ]),
    previewProps: {
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },

  // ---- org / vendor invites ----------------------------------------------
  {
    key: "org.invite",
    name: "Organization invite",
    workspace: "os",
    domain: "org",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "Teammate invited to an organization",
    provider: "customerio",
    providerRef: { envVar: "CIO_ORG_INVITE_MESSAGE_ID", defaultId: "51" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/business-operations/organizations/module/src/logic/invite.ts",
        line: 44,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "os.transactional.operator.org-invite",
    dataContract: contract([
      ["accountName", true, "underscored duplicate account_name deprecated"],
      ["inviteName", true, "underscored duplicate inviter_name deprecated"],
      ["inviteUrl", true, "underscored duplicate invite_url deprecated"],
      ["propertyNames", true, "underscored duplicate property_names deprecated"],
    ]),
    previewProps: {
      orgName: "{{accountName}}",
      inviteUrl: "{{inviteUrl}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
  {
    key: "org.vendor_invite",
    name: "Vendor invite",
    description: "Same body as the org invite, separate CIO message.",
    workspace: "os",
    domain: "org",
    criticality: "operational",
    triggerKind: "event",
    triggerEvent: "Vendor invited to the vendor portal",
    provider: "customerio",
    providerRef: { envVar: "CIO_VENDOR_INVITE_MESSAGE_ID", defaultId: "52" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/business-operations/vendors/module/src/actions/invites/create.ts",
        line: 84,
      },
      {
        repo: REPO,
        path: "src/business-operations/vendors/module/src/actions/invites/resend.ts",
        line: 31,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.services.vendor-portal-invite",
    dataContract: contract([
      ["accountName", true],
      ["inviteName", true],
      ["inviteUrl", true],
      ["propertyNames", true],
    ]),
    previewProps: {
      inviterName: "{{inviteName}}",
      portalUrl: "{{inviteUrl}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },

  // ---- statements ----------------------------------------------------------
  {
    key: "statements.published",
    name: "Owner statement published",
    workspace: "os",
    domain: "statements",
    criticality: "legal_financial",
    triggerKind: "event",
    triggerEvent: "Monthly owner statement published",
    triggerLabel: "monthly publishing process",
    provider: "customerio",
    providerRef: { envVar: "CIO_STATEMENT_PUBLISH_MESSAGE_ID", defaultId: "49" },
    codeRefs: [
      {
        repo: REPO,
        path: "src/business-operations/owners/module/src/actions/statements/publish-owner-statement.ts",
        line: 170,
      },
    ],
    templateSource: "cio_ui",
    templateKey: "marketplace.transactional.operator.monthly-statement",
    dataContract: contract([
      ["unitName", true],
      ["unitHeroImageUrl", true],
      ["publishMonth", true],
      ["statementUrl", true],
    ]),
    previewProps: {
      month: "{{publishMonth}}",
      statementUrl: "{{statementUrl}}",
      logoSrc: "https://www.wander.com/logo-dark.png",
    },
    status: "live_legacy",
  },
];

async function main() {
  const brand = await db.query.brandTable.findFirst({
    where: ilike(brandTable.name, "wander"),
  });
  if (!brand) throw new Error("Wander brand not found — seed brands first.");

  let inserted = 0;
  let updated = 0;
  for (const row of ROWS) {
    const result = await db
      .insert(transactionalMessageTable)
      .values({ ...row, brandId: brand.id })
      .onConflictDoUpdate({
        target: [
          transactionalMessageTable.brandId,
          transactionalMessageTable.key,
        ],
        // Refresh inventory-derived fields; preserve operator-owned migration
        // state (status, notes, linearRef) on existing rows.
        set: {
          name: row.name,
          description: row.description ?? null,
          workspace: row.workspace,
          domain: row.domain,
          criticality: row.criticality,
          triggerKind: row.triggerKind,
          triggerEvent: row.triggerEvent ?? null,
          triggerAnchor: row.triggerAnchor ?? null,
          triggerOffsetMinutes: row.triggerOffsetMinutes ?? null,
          triggerLabel: row.triggerLabel ?? null,
          provider: row.provider,
          providerRef: row.providerRef ?? null,
          codeRefs: row.codeRefs ?? null,
          templateSource: row.templateSource,
          templateKey: row.templateKey ?? null,
          dataContract: row.dataContract ?? null,
          previewProps: row.previewProps ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({
        createdAt: transactionalMessageTable.createdAt,
        updatedAt: transactionalMessageTable.updatedAt,
      });
    const r = result[0];
    if (r && r.createdAt.getTime() === r.updatedAt.getTime()) inserted += 1;
    else updated += 1;
  }
  console.log(
    `transactional_message: ${inserted} inserted, ${updated} refreshed (${ROWS.length} in fixture)`,
  );
  console.log(
    "Note: abandoned-cart price_refresh (cart-abandonment.ts:278, CIO webhook) is deliberately excluded — it is lifecycle, not transactional (docs/transactional-emails.md).",
  );
}

await main();
process.exit(0);
