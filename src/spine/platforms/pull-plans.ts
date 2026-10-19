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
  /** Where the rows sit in the response. */
  collect: string;
  /** Skip this request unless the local config names this field. */
  requires?: string;
  /** Documented read-only POST (search / GraphQL query). */
  readOnlyPost?: true;
}

export interface PullPlan {
  /** "Bearer" or "Token" in the Authorization header. */
  authScheme: "Bearer" | "Token";
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
  }
};
