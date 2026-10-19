import type { PlatformKind } from "./catalog.js";

/**
 * Read-only live-pull plans. Every request below is a documented read on the
 * vendor's public API (see PLATFORM_SPECS[kind].api.docsUrl). GraphQL plans
 * send queries only; the runner refuses any mutation. The one REST POST
 * (Square SearchTeamMembers) is the vendor's documented read-only search.
 * None of these plans has been run against a live tenant.
 */

export interface PullRequestPlan {
  /** Document key the rows land under; the platform mapper reads the same key. */
  key: string;
  method: "GET" | "POST";
  /** Path under the base URL. {name} placeholders come from the local pull config. */
  path: string;
  /** JSON body for GraphQL queries and documented read-only searches. */
  body?: Record<string, unknown>;
  /** Where the rows sit in the response. Empty string: the response itself is the row list. */
  collect: string;
  /** Skip this request unless the local config names this field. */
  requires?: string;
  /** Documented read-only POST (search / GraphQL query). */
  readOnlyPost?: true;
}

export interface PullPlan {
  /** "Bearer" or "Token" in the Authorization header, or "Header": the token goes in authHeader (e.g. X-API-Key). */
  authScheme: "Bearer" | "Token" | "Header";
  /** Header that carries the token when authScheme is "Header". */
  authHeader?: string;
  /** Header name → local config field that must hold its (non-secret) value. */
  requiredHeaders?: Record<string, string>;
  /** Local config fields that must be present (non-secret, e.g. realmId) or resolved from an env var (`<field>Env`). */
  requiredFields?: string[];
  requests: PullRequestPlan[];
  docs: string;
}

const gql = (key: string, query: string): PullRequestPlan => ({
  key,
  method: "POST",
  path: "/api/graphql",
  body: { query },
  collect: `data.${key}.nodes`,
  readOnlyPost: true
});

export const PULL_PLANS: Partial<Record<PlatformKind, PullPlan>> = {
  jobber: {
    authScheme: "Bearer",
    requiredHeaders: { "X-JOBBER-GRAPHQL-VERSION": "graphqlVersion" },
    docs: "https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/",
    requests: [
      gql(
        "jobs",
        "query TradesRuntimeJobs { jobs(first: {pageSize}) { nodes { id jobNumber title jobStatus total createdAt client { id name } visits(first: 10) { nodes { id title startAt endAt } } } } }"
      ),
      gql("clients", "query TradesRuntimeClients { clients(first: {pageSize}) { nodes { id name } } }"),
      gql(
        "invoices",
        "query TradesRuntimeInvoices { invoices(first: {pageSize}) { nodes { id invoiceNumber invoiceStatus issuedDate amounts { total } client { id name } } } }"
      ),
      gql(
        "quotes",
        "query TradesRuntimeQuotes { quotes(first: {pageSize}) { nodes { id quoteNumber quoteStatus amounts { total } client { id name } } } }"
      ),
      gql("users", "query TradesRuntimeUsers { users(first: {pageSize}) { nodes { id name { full } } } }")
    ]
  },
  housecallpro: {
    authScheme: "Token",
    docs: "https://docs.housecallpro.com/",
    requests: [
      { key: "jobs", method: "GET", path: "/jobs?page=1&page_size={pageSize}", collect: "jobs" },
      { key: "customers", method: "GET", path: "/customers?page=1&page_size={pageSize}", collect: "customers" },
      { key: "employees", method: "GET", path: "/employees?page=1&page_size={pageSize}", collect: "employees" },
      { key: "estimates", method: "GET", path: "/estimates?page=1&page_size={pageSize}", collect: "estimates" },
      { key: "invoices", method: "GET", path: "/invoices?page=1&page_size={pageSize}", collect: "invoices" }
    ]
  },
  square: {
    authScheme: "Bearer",
    requiredHeaders: { "Square-Version": "squareVersion" },
    docs: "https://developer.squareup.com/reference/square",
    requests: [
      { key: "customers", method: "GET", path: "/v2/customers?limit={pageSize}", collect: "customers" },
      { key: "payments", method: "GET", path: "/v2/payments?limit={pageSize}", collect: "payments" },
      { key: "invoices", method: "GET", path: "/v2/invoices?location_id={locationId}&limit={pageSize}", collect: "invoices", requires: "locationId" },
      { key: "bookings", method: "GET", path: "/v2/bookings?limit={pageSize}", collect: "bookings" },
      { key: "team_members", method: "POST", path: "/v2/team-members/search", body: { limit: 100 }, collect: "team_members", readOnlyPost: true }
    ]
  },
  quickbooks: {
    authScheme: "Bearer",
    requiredFields: ["realmId"],
    docs: "https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries",
    requests: ["Customer", "Invoice", "Payment", "Estimate", "Employee", "Item"].map((entity) => ({
      key: entity,
      method: "GET" as const,
      path: `/v3/company/{realmId}/query?query=${encodeURIComponent(`select * from ${entity} maxresults `)}{pageSize}{minorVersionParam}`,
      collect: `QueryResponse.${entity}`
    }))
  },
  servicefusion: {
    authScheme: "Bearer",
    docs: "https://docs.servicefusion.com/",
    requests: [
      // Service Fusion documents that unsorted /jobs list requests can hang; always sort.
      { key: "jobs", method: "GET", path: "/v1/jobs?sort=-start_date&per-page={pageSize}", collect: "items" },
      { key: "customers", method: "GET", path: "/v1/customers?per-page={pageSize}", collect: "items" },
      { key: "techs", method: "GET", path: "/v1/techs?per-page={pageSize}", collect: "items" },
      { key: "estimates", method: "GET", path: "/v1/estimates?per-page={pageSize}", collect: "items" },
      { key: "invoices", method: "GET", path: "/v1/invoices?per-page={pageSize}", collect: "items" }
    ]
  },
  // Wave 2 (TR-PLATFORMS-2-2026-10-19). Successware, BuildOps, Kickserv, mHelpDesk, and Wintac have no plan (file drop only).
  workiz: {
    authScheme: "Bearer",
    docs: "https://developer.workiz.com/v2/",
    requests: [{ key: "jobs", method: "GET", path: "/jobs?pageSize={pageSize}", collect: "data" }]
  },
  servicetrade: {
    authScheme: "Bearer",
    docs: "https://api.servicetrade.com/api/docs",
    requests: [
      { key: "jobs", method: "GET", path: "/api/job?page=1", collect: "data.jobs" },
      { key: "locations", method: "GET", path: "/api/location?page=1", collect: "data.locations" }
    ]
  },
  fieldpulse: {
    authScheme: "Header",
    authHeader: "x-api-key",
    docs: "https://help.fieldpulse.com/api-reference/getting-started",
    requests: [
      { key: "jobs", method: "GET", path: "/jobs?limit={pageSize}&page=1", collect: "response" },
      { key: "customers", method: "GET", path: "/customers?limit={pageSize}&page=1", collect: "response" },
      { key: "invoices", method: "GET", path: "/invoices?limit={pageSize}&page=1", collect: "response" },
      { key: "estimates", method: "GET", path: "/estimates?limit={pageSize}&page=1", collect: "response" }
    ]
  },
  servicem8: {
    authScheme: "Header",
    authHeader: "X-API-Key",
    docs: "https://developer.servicem8.com/docs/rest-overview",
    requests: [
      { key: "jobs", method: "GET", path: "/api_1.0/job.json", collect: "" },
      { key: "company", method: "GET", path: "/api_1.0/company.json", collect: "" },
      { key: "jobactivity", method: "GET", path: "/api_1.0/jobactivity.json", collect: "" },
      { key: "staff", method: "GET", path: "/api_1.0/staff.json", collect: "" }
    ]
  },
  simpro: {
    authScheme: "Bearer",
    requiredFields: ["companyId"],
    docs: "https://developer.simprogroup.com/apidoc/",
    requests: [{ key: "jobs", method: "GET", path: "/api/v1.0/companies/{companyId}/jobs/?pageSize={pageSize}", collect: "" }]
  },
  commusoft: {
    authScheme: "Bearer",
    docs: "https://developer.commusoft.com/",
    requests: [
      { key: "jobs", method: "GET", path: "/jobs?limit={pageSize}", collect: "data" },
      { key: "properties", method: "GET", path: "/properties?limit={pageSize}", collect: "data" },
      { key: "users", method: "GET", path: "/users?limit={pageSize}", collect: "data" }
    ]
  }
};
