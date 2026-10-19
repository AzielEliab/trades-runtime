import type { PlatformSpec } from "./catalog.js";

/**
 * Platform peers, wave 2 (TR-PLATFORMS-2-2026-10-19).
 *
 * Successware (named by the owner) plus ten field-service booking, dispatch,
 * and job platforms used by HVAC, plumbing, electrical, and sewer shops.
 * Picks are based on research, not usage data: no reliable market-share
 * numbers were found, so none are claimed. Each `selection` names the public
 * pages that informed the pick. Review counts quoted below are counts shown
 * on those pages on 2026-10-19, not usage figures.
 *
 * Live pull ships only where the vendor documents a self-serve REST API that
 * returns JSON. Everything else is file drop only, and each spec says why.
 * None of these has been tested against a live tenant.
 */

const NOT_LIVE = "Not tested against a live tenant.";
const SA_PLUMBING = "https://www.softwareadvice.com/field-service/plumbing-software-comparison/";
const FSS_HVAC_DISPATCH = "https://www.fieldservicescout.com/best/hvac-dispatch-software";
const STATWHARF_HVAC = "https://statwharf.com/best/field-service-management-software-for-hvac/";

export type Wave2Kind =
  | "successware"
  | "workiz"
  | "servicetrade"
  | "buildops"
  | "fieldpulse"
  | "kickserv"
  | "mhelpdesk"
  | "servicem8"
  | "simpro"
  | "commusoft"
  | "wintac";

export const WAVE2_KINDS: readonly Wave2Kind[] = [
  "successware",
  "workiz",
  "servicetrade",
  "buildops",
  "fieldpulse",
  "kickserv",
  "mhelpdesk",
  "servicem8",
  "simpro",
  "commusoft",
  "wintac"
];

export const WAVE2_SPECS: Record<Wave2Kind, Omit<PlatformSpec, "kind" | "writebackPermission"> & { kind: Wave2Kind; writebackPermission: `${Wave2Kind}.writeback` }> = {
  successware: {
    kind: "successware",
    label: "Successware",
    idPrefix: "sw",
    inboundDir: "data/inbound/successware",
    entities: ["job", "appointment", "customer", "invoice", "technician", "equipment"],
    objectMap: { Call: "job", "Call.schedule": "appointment", Customer: "customer", Location: "customer", Invoice: "invoice", Technician: "technician", Equipment: "equipment" },
    api: {
      status: "partner-gated",
      livePull: false,
      docsUrl: "https://www.successware.com/about-us/integrations/",
      auth: "No public API reference, endpoints, or authentication guide is published; integrations run through named Successware partners.",
      access: "Successware lists partner integrations (Schedule Engine, CompanyCam, ADP, QuickBooks Payroll, PulseM, Podium, and others) but publishes no self-serve developer API, so this runtime ships file drop only."
    },
    writebackPermission: "successware.writeback",
    honesty: `File drop only. Successware publishes no public API documentation. Field names follow common Successware export columns; check them against your own export. ${NOT_LIVE}`,
    selection: {
      reason: "Named by the owner. A long-running residential HVAC, plumbing, and electrical platform; reviewers list it for established residential HVAC shops that run dispatch together with accounting and service agreements.",
      sources: ["https://www.successware.com/features/integrated-accounting/", STATWHARF_HVAC]
    }
  },
  workiz: {
    kind: "workiz",
    label: "Workiz",
    idPrefix: "wz",
    inboundDir: "data/inbound/workiz",
    entities: ["job", "appointment", "customer", "invoice", "estimate", "technician"],
    objectMap: { Job: "job", "Job.JobDateTime": "appointment", Client: "customer", Invoice: "invoice", Estimate: "estimate", User: "technician" },
    api: {
      status: "documented-public-api",
      livePull: true,
      docsUrl: "https://developer.workiz.com/v2/",
      defaultBaseUrl: "https://api.workiz.com/api/v2",
      auth: "Named v2 API key (Settings > Integrations > Developer > v2, Developer API add-on) sent as Authorization: Bearer <key>. A key with Read on Jobs is enough.",
      access: "Public REST API v2; requires the Developer API add-on from the Workiz Feature center."
    },
    writebackPermission: "workiz.writeback",
    honesty: `File drop + documented REST GET pull (jobs, first page). Vendor API needs the Developer API add-on. ${NOT_LIVE}`,
    selection: {
      reason: "Ranked first for HVAC dispatch on an independent comparison and listed for residential HVAC and plumbing with high call volume.",
      sources: [FSS_HVAC_DISPATCH, STATWHARF_HVAC, "https://help.workiz.com/hc/en-us/articles/50737427251473-Accessing-your-Workiz-API-credentials"]
    }
  },
  servicetrade: {
    kind: "servicetrade",
    label: "ServiceTrade",
    idPrefix: "st",
    inboundDir: "data/inbound/servicetrade",
    entities: ["job", "appointment", "customer", "invoice", "estimate", "technician", "equipment"],
    objectMap: { job: "job", appointment: "appointment", location: "customer", company: "customer", invoice: "invoice", quote: "estimate", user: "technician", asset: "equipment" },
    api: {
      status: "documented-public-api",
      livePull: true,
      docsUrl: "https://api.servicetrade.com/api/docs",
      defaultBaseUrl: "https://api.servicetrade.com",
      auth: "OAuth2 bearer token (client_credentials at POST /api/oauth2/token, done by the operator outside this runtime); the token is read from the env var named in local config.",
      access: "Public REST API with vendor SDKs (PHP, Python). Commercial-service focused."
    },
    writebackPermission: "servicetrade.writeback",
    honesty: `File drop + documented REST GET pull (jobs, locations). Appointment and invoice windows use Unix seconds and are converted. ${NOT_LIVE}`,
    selection: {
      reason: "Software Advice 2026 plumbing FrontRunner (344 reviews shown) and on an HVAC dispatch ranking; covers commercial HVAC, mechanical, and plumbing service.",
      sources: [SA_PLUMBING, FSS_HVAC_DISPATCH, "https://github.com/servicetrade/servicetrade-php-sdk"]
    }
  },
  buildops: {
    kind: "buildops",
    label: "BuildOps",
    idPrefix: "bo",
    inboundDir: "data/inbound/buildops",
    entities: ["job", "appointment", "customer", "invoice", "estimate", "technician", "equipment"],
    objectMap: { Job: "job", Visit: "appointment", Customer: "customer", Property: "customer", Invoice: "invoice", Quote: "estimate", Employee: "technician", Asset: "equipment" },
    api: {
      status: "partner-gated",
      livePull: false,
      docsUrl: "https://developer.buildops.com/",
      auth: "BuildOps Public API documentation is marked Invite Required (through the customer's implementation or customer-success manager).",
      access: "API reference is gated behind an invite, so this runtime ships file drop only."
    },
    writebackPermission: "buildops.writeback",
    honesty: `File drop only. BuildOps API docs are invite-gated. Field names follow BuildOps report export columns; check them against your own export. ${NOT_LIVE}`,
    selection: {
      reason: "Commercial HVAC, plumbing, electrical, and refrigeration contractor platform; Software Advice lists it as most used by construction among plumbing products, and an HVAC dispatch ranking places it second.",
      sources: [SA_PLUMBING, FSS_HVAC_DISPATCH, "https://developer.buildops.com/"]
    }
  },
  fieldpulse: {
    kind: "fieldpulse",
    label: "FieldPulse",
    idPrefix: "fp",
    inboundDir: "data/inbound/fieldpulse",
    entities: ["job", "customer", "invoice", "estimate", "technician"],
    objectMap: { job: "job", customer: "customer", invoice: "invoice", estimate: "estimate", user: "technician" },
    api: {
      status: "documented-public-api",
      livePull: true,
      docsUrl: "https://help.fieldpulse.com/api-reference/getting-started",
      defaultBaseUrl: "https://ywe3crmpll.execute-api.us-east-2.amazonaws.com/stage",
      auth: "API token issued by FieldPulse support (support@fieldpulse.com), sent in the x-api-key header.",
      access: "Public REST API; the token is activated by FieldPulse support on request."
    },
    writebackPermission: "fieldpulse.writeback",
    honesty: `File drop + documented REST GET pull (jobs, customers, invoices, estimates; first page). ${NOT_LIVE}`,
    selection: {
      reason: "Software Advice 2026 plumbing FrontRunner (502 reviews shown) and on an HVAC dispatch ranking for mixed-trade shops.",
      sources: [SA_PLUMBING, FSS_HVAC_DISPATCH]
    }
  },
  kickserv: {
    kind: "kickserv",
    label: "Kickserv",
    idPrefix: "ks",
    inboundDir: "data/inbound/kickserv",
    entities: ["job", "appointment", "customer", "invoice", "estimate", "technician"],
    objectMap: { job: "job", "job.scheduled_on": "appointment", customer: "customer", invoice: "invoice", estimate: "estimate", employee: "technician" },
    api: {
      status: "documented-public-api",
      livePull: false,
      docsUrl: "https://help.kickserv.com/article/4-developer-api",
      auth: "Employee API token over HTTP Basic auth; Premium plan only.",
      access: "Kickserv documents an XML-over-HTTP REST API. This runtime's pull reads JSON only, so it ships file drop (CSV or JSON export) and no live pull."
    },
    writebackPermission: "kickserv.writeback",
    honesty: `File drop only. Kickserv's documented API is XML (Premium plan); this runtime does not parse XML pulls. ${NOT_LIVE}`,
    selection: {
      reason: "Small-shop service software listed among plumbing products with 387 reviews shown on Software Advice.",
      sources: [SA_PLUMBING, "https://help.kickserv.com/article/4-developer-api"]
    }
  },
  mhelpdesk: {
    kind: "mhelpdesk",
    label: "mHelpDesk",
    idPrefix: "mhd",
    inboundDir: "data/inbound/mhelpdesk",
    entities: ["job", "appointment", "customer", "invoice", "estimate", "technician"],
    objectMap: { Ticket: "job", Appointment: "appointment", Customer: "customer", Invoice: "invoice", Estimate: "estimate", Technician: "technician" },
    api: {
      status: "no-public-api",
      livePull: false,
      docsUrl: "https://www.mhelpdesk.com/",
      auth: "No public developer API documentation was found.",
      access: "No self-serve API, so this runtime ships file drop (report exports) only."
    },
    writebackPermission: "mhelpdesk.writeback",
    honesty: `File drop only. No public mHelpDesk API documentation was found. ${NOT_LIVE}`,
    selection: {
      reason: "Long-running small-business field service app listed among plumbing products with 824 reviews shown on Software Advice.",
      sources: [SA_PLUMBING]
    }
  },
  servicem8: {
    kind: "servicem8",
    label: "ServiceM8",
    idPrefix: "sm8",
    inboundDir: "data/inbound/servicem8",
    entities: ["job", "appointment", "customer", "invoice", "technician", "pricebook"],
    objectMap: { Job: "job", JobActivity: "appointment", Company: "customer", Staff: "technician", Material: "pricebook", JobMaterial: "pricebook" },
    api: {
      status: "documented-public-api",
      livePull: true,
      docsUrl: "https://developer.servicem8.com/docs/rest-overview",
      defaultBaseUrl: "https://api.servicem8.com",
      auth: "Private-integration API key (Settings > API Keys) sent in the X-API-Key header.",
      access: "Public JSON REST API (api_1.0). Scheduled bookings are JobActivity rows with activity_was_scheduled = 1."
    },
    writebackPermission: "servicem8.writeback",
    honesty: `File drop + documented REST GET pull (job, company, jobactivity, staff). ${NOT_LIVE}`,
    selection: {
      reason: "Trades job-management app (plumbing, electrical, HVAC) with a public JSON API; already recognized by the trades-app drop-in, now a first-class peer. Pick based on research, no usage data.",
      sources: ["https://developer.servicem8.com/docs/rest-overview", "https://developer.servicem8.com/docs/authentication"]
    }
  },
  simpro: {
    kind: "simpro",
    label: "Simpro",
    idPrefix: "sp",
    inboundDir: "data/inbound/simpro",
    entities: ["job", "customer", "invoice", "estimate", "technician"],
    objectMap: { Job: "job", Customer: "customer", Invoice: "invoice", Quote: "estimate", Employee: "technician" },
    api: {
      status: "documented-public-api",
      livePull: true,
      docsUrl: "https://developer.simprogroup.com/apidoc/",
      auth: "OAuth 2.0 bearer token from an API application created in the build (System Setup > API Applications). Base URL is the build host (https://<build>.simprosuite.com) and must be set in local config with companyId.",
      access: "Public REST API per build. No shared base URL, so the operator names it."
    },
    writebackPermission: "simpro.writeback",
    honesty: `File drop + documented REST GET pull (jobs, first page). Needs the operator's build URL and company id. ${NOT_LIVE}`,
    selection: {
      reason: "Residential and commercial trades platform (HVAC, plumbing, electrical) listed among plumbing products on Software Advice; the vendor states 250,000+ users worldwide (vendor claim, not verified).",
      sources: [SA_PLUMBING, "https://developer.simprogroup.com/apidoc/"]
    }
  },
  commusoft: {
    kind: "commusoft",
    label: "Commusoft",
    idPrefix: "cs",
    inboundDir: "data/inbound/commusoft",
    entities: ["job", "customer", "technician", "equipment"],
    objectMap: { job: "job", property: "customer", user: "technician", asset: "equipment" },
    api: {
      status: "documented-public-api",
      livePull: true,
      docsUrl: "https://developer.commusoft.com/",
      defaultBaseUrl: "https://app.commusoft.us/api/v2",
      auth: "API key sent as Authorization: Bearer <key>. US/Canada base is https://app.commusoft.us/api/v2; UK shops set baseUrl https://app.commusoft.co.uk/api/v2.",
      access: "Public REST API v2 for clients building private apps; Commusoft says it needs an appropriate subscription."
    },
    writebackPermission: "commusoft.writeback",
    honesty: `File drop + documented REST GET pull (jobs, properties, users; first page). Recall jobs carry recallOfParentJobID, which the callback module reads. ${NOT_LIVE}`,
    selection: {
      reason: "Heating, plumbing, and electrical job-management platform (UK and US) listed among plumbing products with 212 reviews shown on Software Advice; documents recalls against the parent job.",
      sources: [SA_PLUMBING, "https://developer.commusoft.com/authentication-1985209m0"]
    }
  },
  wintac: {
    kind: "wintac",
    label: "Wintac",
    idPrefix: "wt",
    inboundDir: "data/inbound/wintac",
    entities: ["job", "customer", "invoice", "technician", "equipment"],
    objectMap: { WorkOrder: "job", Customer: "customer", Invoice: "invoice", Technician: "technician", Equipment: "equipment" },
    api: {
      status: "no-public-api",
      livePull: false,
      docsUrl: "https://help.servicetitan.com/docs/export-your-wintac-data",
      auth: "No public REST, GraphQL, or SOAP API.",
      access: "Wintac is Windows desktop software; data leaves through its own Excel/report exports. Save as CSV and drop it here."
    },
    writebackPermission: "wintac.writeback",
    honesty: `File drop only (desktop Excel/CSV exports). No public Wintac API. ${NOT_LIVE}`,
    selection: {
      reason: "Long-standing desktop field-service package for HVAC and plumbing shops; migration guides from other vendors exist for it. Pick based on research, no usage data.",
      sources: ["https://help.servicetitan.com/docs/export-your-wintac-data", "https://tradesindex.org/software/wintac/"]
    }
  }
};
