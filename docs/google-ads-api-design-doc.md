# Wander — Google Ads API Tool Design Document

**Applicant:** Wander (wander.com) · **MCC:** 152-064-2156 · **Cloud project:** wander-growth-ads-mcp (430811523548)
**Classification:** Internal Use Only — no third-party access
**Contact:** kristian@wander.com · **Date:** July 2026

## 1. Overview

Wander is a vacation-rental hospitality company operating its own Google Ads accounts. This document describes the internal tool for which we request Standard access: a reporting and monitoring system used exclusively by Wander employees against Wander-owned accounts. The tool has no customer-facing surface, is not offered to any third party, and performs no production mutations through the API.

## 2. Account model

```
Wander MCC (152-064-2156) — owns the developer token
  +-- Wander - Demand (325-444-9027)  -- guest acquisition (wander.com)
  +-- Wander - Supply (970-978-1352)  -- property-manager acquisition (WanderOS)
```

All accounts are Wander's own, linked under the MCC. No external accounts are accessed. Account linking is managed manually in the Google Ads UI by authorized Wander staff.

## 3. Components and workflows

### 3.1 Scheduled reporting (internal growth workspace)
A daily job in Wander's internal growth application (Next.js on Vercel; access restricted to @wander.com accounts) retrieves spend, conversion, and campaign-inventory data via `GoogleAdsService.SearchStream` (GAQL) and stores it in Wander's internal database for dashboards used by the growth team. Queries are batched per account per day — the connector does not issue per-campaign calls.

### 3.2 Read-only account diagnostics
Periodic GAQL queries over conversion actions and tag health (for example, enumerating conversion actions and their status to detect stale or duplicate configuration). Findings are reviewed by staff; **any remediation is performed manually in the Google Ads UI** — remediation is not an API workflow.

### 3.3 Internal analyst access (official MCP server)
Wander engineers and analysts run ad-hoc GAQL queries through Google's official open-source Google Ads API MCP server (github.com/googleads/google-ads-mcp), which exposes only read operations (`ListAccessibleCustomers`, `Search`, resource metadata). This supports audits and diagnostics — e.g. verifying conversion-action configuration during a July 2026 measurement audit.

### 3.4 Explicitly out of scope
No campaign creation, no campaign management writes, no bidding automation, no account creation, no keyword planning, no third-party or client access of any kind. Should Wander later build advertiser-facing functionality, we will file an updated application and complete any applicable RMF review before production use.

## 4. Authentication and access control

- **API auth:** Google OAuth (user credentials of authorized Wander staff / Application Default Credentials) plus the MCC developer token; requests are attributed to the Google Cloud project above.
- **Who can query:** Wander growth/engineering staff only. The internal workspace requires @wander.com Google-gated login; analyst MCP access requires an individually authorized Google login with access to the MCC.
- **Secrets:** managed in Wander's secret manager (Doppler); never committed to source control.
- **Audit/reversibility:** the tool is read-only, so there is nothing to reverse; scheduled-job activity is logged in the application's deploy/runtime logs.

## 5. Data handling

Retrieved data (spend, performance metrics, campaign/conversion configuration) is stored only in Wander's internal growth workspace database and internal BI. It is not shared externally, resold, or exposed to any third party. Access follows the same @wander.com staff gating as the rest of the internal tool.

## 6. Quota rationale

> **[PLACEHOLDER — complete before submission per internal policy]**
> Seven-day measured baseline of API operations by consumer (scheduled reporting / diagnostics / analyst MCP), and projected peak production day with safety margin. Submission proceeds only if the projection credibly approaches the Basic-access limit of 15,000 operations/day.

## 7. Compliance posture

The tool uses Google's supported client tooling (official client libraries and the official MCP server) in accordance with Google Ads API terms and policies. Classification is Internal Use Only under the RMF policy ("individual advertiser or agency use only; no third-party access to tool"); accordingly no RMF category functionality is claimed. This declaration is bounded internally: any future third-party-facing use requires a new application and applicable RMF review before launch.
