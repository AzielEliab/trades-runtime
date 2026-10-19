import type { PlatformKind } from "./catalog.js";

/**
 * How well each platform mapper's field names are backed by a published source
 * (TR-PLATFORMS-MAPPING-2026-10-19).
 *
 * - documented: the field names the mapper reads were checked against the
 *   vendor's published API schema (OpenAPI / Swagger / reference pages).
 * - partial: some field names come from a published source (request fields,
 *   report column lists, import templates, an SDK, or a docs mirror), but the
 *   response or export shape is not fully published, or was not re-checked
 *   field by field in this pass.
 * - guessed: no published field list was found. The mapper reads common
 *   export column names, and an adopter must confirm them with a real export.
 *
 * "Documented" describes the field names only. No platform here has been
 * tested against a live tenant.
 */
export type MappingConfidence = "documented" | "partial" | "guessed";

export interface MappingVerification {
  mappingConfidence: MappingConfidence;
  /** Public pages the field names were checked against. Checked 2026-10-19. */
  mappingSources: string[];
  /** What was checked, what was corrected, and what still needs a real export. */
  mappingNote: string;
}

const NOT_RECHECKED = "Built from the vendor's API reference in TR-PLATFORMS-2026-10-19; not re-checked field by field in the 2026-10-19 verification pass, so it stays partial.";

export const MAPPING_VERIFICATION: Record<PlatformKind, MappingVerification> = {
  jobber: {
    mappingConfidence: "partial",
    mappingSources: ["https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/"],
    mappingNote: `The live pull selects its own GraphQL fields, so pulled shapes follow the query. ${NOT_RECHECKED} CSV exports use header aliases.`
  },
  housecallpro: {
    mappingConfidence: "partial",
    mappingSources: ["https://docs.housecallpro.com/"],
    mappingNote: NOT_RECHECKED
  },
  square: {
    mappingConfidence: "partial",
    mappingSources: ["https://developer.squareup.com/reference/square"],
    mappingNote: NOT_RECHECKED
  },
  quickbooks: {
    mappingConfidence: "partial",
    mappingSources: ["https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice"],
    mappingNote: NOT_RECHECKED
  },
  fieldedge: {
    mappingConfidence: "documented",
    mappingSources: [
      "https://docs-dev.fieldedge.com/llms.txt",
      "https://docs-dev.fieldedge.com/retrieve-a-paginated-list-of-work-orders-42492423e0.md",
      "https://docs-dev.fieldedge.com/retrieve-all-technician-assignments-for-a-work-order-43433645e0.md",
      "https://docs-dev.fieldedge.com/retrieve-a-paginated-list-of-invoices-42492403e0.md",
      "https://docs-dev.fieldedge.com/retrieve-a-paginated-list-of-quotes-42492411e0.md",
      "https://docs-dev.fieldedge.com/retrieve-a-paginated-list-of-employees-42492395e0.md",
      "https://docs-dev.fieldedge.com/search-customers-with-optional-filters-42492385e0.md"
    ],
    mappingNote:
      "Corrected to the FieldEdge Open API schemas: workOrderId, workOrderNumber, customerId, scheduledStart, serviceAddress, primaryAssignment {employeeId, name}, invoiceId. Assignments come from technicianId, technicianName, scheduleDateTime, and status. The earlier nested customer/assignment guesses were dropped. The documented work-order list carries no money and no status string, so job totals come only from invoices or an export that names a total. API access is still partner-gated (file drop only). Exports from the FieldEdge app itself have no published column list."
  },
  servicefusion: {
    mappingConfidence: "partial",
    mappingSources: ["https://docs.servicefusion.com/"],
    mappingNote: NOT_RECHECKED
  },
  successware: {
    mappingConfidence: "guessed",
    mappingSources: [
      "https://help.servicetitan.com/docs/export-your-successware-data",
      "https://successware.zendesk.com/hc/en-us/articles/15731592267789-Platform-Printing-Reports"
    ],
    mappingNote:
      "No published field list. ServiceTitan's migration guide moves Successware data as a database backup (BAK/MDB) plus an A/R aging XLSX, and Successware's grid reports and Report Gallery exports let the user pick the columns. The mapper reads common column names, so it needs a real shop export to confirm."
  },
  workiz: {
    mappingConfidence: "documented",
    mappingSources: ["https://developer.workiz.com/v2/"],
    mappingNote:
      "Corrected to the Workiz Developer API v2 OpenAPI spec embedded in the docs page. Server https://api.workiz.com/crm/api, paths /v2/jobs, /v2/clients, /v2/invoices, /v2/estimates, list envelope {pageSize, page, totalResults, hasMore, data}. Fields are camelCase: uuid, serialId, status, date, totalPrice, clientInfo {clientId, firstName, companyName}, team [{id, name}]. The earlier PascalCase guesses (UUID, JobDateTime, JobTotalPrice) and the base URL /api/v2 were wrong and were replaced. Workiz CSV exports have no published column list and use header aliases."
  },
  servicetrade: {
    mappingConfidence: "documented",
    mappingSources: ["https://api.servicetrade.com/openapi/openapi.json", "https://api.servicetrade.com/api/docs"],
    mappingNote:
      "Checked against ServiceTrade's OpenAPI 3.1 spec. Every response is {data: {totalPages, page, <collection>}} with Unix-second times. List keys are verified for jobs, appointments, invoices, quotes, users, assets, locations, and companies, and all are now pulled. Jobs read id, number, status, scheduledDate, completedOn, estimatedPrice, customer {id, name}, location {id, name, address}, and currentAppointment.techs. Invoices read invoiceNumber, totalPrice, transactionDate, customer.id, and job.id."
  },
  buildops: {
    mappingConfidence: "guessed",
    mappingSources: ["https://developer.buildops.com/", "https://developer.buildops.com/docs/data-dictionary/4b402d5ab3edd-build-ops-datasets"],
    mappingNote:
      "No field list could be read. The BuildOps Public API reference is marked Invite Required, and the public Data Dictionary renders client-side and exposed no field names to a plain fetch. The mapper reads common report column names, so it needs a real export (or the invited API reference) to confirm."
  },
  fieldpulse: {
    mappingConfidence: "partial",
    mappingSources: [
      "https://help.fieldpulse.com/api-reference/jobs/retrieve-jobs-list.md",
      "https://help.fieldpulse.com/api-reference/jobs/create-a-job.md",
      "https://help.fieldpulse.com/api-reference/customers/create-a-customer.md",
      "https://help.fieldpulse.com/api-reference/invoices/create-an-invoice.md",
      "https://help.fieldpulse.com/reporting/raw-data/job-reports.md"
    ],
    mappingNote:
      "The list envelope {error, total_count, response: [...]} is documented, but the list items are typed only as \"object\". Field names come from the documented create-request bodies: customer_id, status, start_time, end_time, assignments [{team_id, assigned_members}], display_name, invoiced_date, job_id. The Job Report CSV columns are documented and mapped (#ID, Customer, Status, Start Date/Time, Location, Assigned Team Members, Total Invoice Amount). The response-only fields total, customer.display_name, and assigned_to are guessed."
  },
  kickserv: {
    mappingConfidence: "partial",
    mappingSources: ["https://app.kickserv.com/api-def", "https://app.kickserv.com/api-docs"],
    mappingNote:
      "Field names come from Kickserv's Swagger definition: jobs (job_number, name, status, scheduled_on, total, customer_id, include=customer,employees), customers (customer_number, name, service_address), employees (employee_number, name), and items. The XML response envelope is not published, so the reader accepts both Rails list forms. Separate invoices and estimates collections (Kickserv keeps them on the job) are guessed for file exports."
  },
  mhelpdesk: {
    mappingConfidence: "partial",
    mappingSources: [
      "https://help.servicetitan.com/docs/export-your-mhelpdesk-data",
      "http://forum.mhelpdesk.com/en/articles/854355-import-your-customer-and-service-location-databases"
    ],
    mappingNote:
      "The CustomerList.csv, ContactsList.csv, and InvoiceList.csv report columns are published (ServiceTitan's migration guide) and mapped: ID, Name, Address 1, Creation Date; Invoice Number, Ticket ID, Customer Name, Issued Date, Amount, Balance. The customer import template columns (CustomerName, Address1, ...) are published too. No ticket/job export column list is published, so ticket mapping is guessed."
  },
  servicem8: {
    mappingConfidence: "partial",
    mappingSources: ["https://developer.servicem8.com/docs/rest-overview"],
    mappingNote: NOT_RECHECKED
  },
  simpro: {
    mappingConfidence: "partial",
    mappingSources: [
      "https://developer.simprogroup.com/apidoc/",
      "https://context7.com/websites/developer_simprogroup_apidoc/llms.txt",
      "https://github.com/stitch-digital/simpro-php-sdk/blob/HEAD/docs/jobs-resource.md"
    ],
    mappingNote:
      "The vendor apidoc is behind a browser challenge, so it was read through a docs mirror and a community SDK. Fields are PascalCase: ID, Name, Stage, Status {ID, Name}, Customer {ID, CompanyName, GivenName, FamilyName}, Site {ID, Name}, Technician {ID, Name}, DateIssued, CompletedDate, Total {ExTax, IncTax}. List calls return only ID/Description/Total unless the documented columns parameter is sent, so the pull now asks for those columns."
  },
  commusoft: {
    mappingConfidence: "partial",
    mappingSources: ["https://developer.commusoft.com/"],
    mappingNote: NOT_RECHECKED
  },
  wintac: {
    mappingConfidence: "guessed",
    mappingSources: ["https://help.servicetitan.com/docs/export-your-wintac-data"],
    mappingNote:
      "No published field list. ServiceTitan's migration guide moves Wintac data as a company backup plus an A/R Detail RTF report, with no column list. The mapper reads common work-order column names, so it needs a real Wintac Excel/CSV export to confirm."
  }
};
