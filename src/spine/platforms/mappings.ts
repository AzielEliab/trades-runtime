import type { PlatformKind } from "./catalog.js";
import { WAVE2_MAPPINGS } from "./mappings-wave2.js";
import { isRecord, mapCollections, mapCsvRows, type CollectionMap, type CsvColumnOverrides, type PlatformRecord } from "./map.js";

/**
 * Per-platform collection maps. Object and field names follow each vendor's
 * documented API objects (see PLATFORM_SPECS[kind].api.docsUrl). The same maps
 * read a vendor-shaped JSON export and the document a live pull writes.
 */

const customerFields = (id: string[], name: string[]) => ({ customerId: id, customerName: name });

const JOBBER: CollectionMap[] = [
  {
    keys: ["jobs", "data.jobs", "Job"],
    entity: "job",
    idKeys: ["id", "jobNumber"],
    observedKeys: ["visits.0.startAt", "startAt", "completedAt", "createdAt"],
    statusKeys: ["jobStatus", "visits.0.visitStatus", "visits.0.status", "status"],
    fields: {
      ...customerFields(["client.id"], ["client.name", "client.companyName"]),
      technicianId: ["visits.0.assignedUsers.0.id", "assignedUsers.0.id"],
      technicianName: ["visits.0.assignedUsers.0.name.full", "assignedUsers.0.name.full"],
      jobTotal: ["total", "amounts.total"],
      scheduledOn: ["visits.0.startAt", "startAt"],
      serviceAddress: ["property.address", "property.street"]
    },
    children: [
      {
        keys: ["visits"],
        entity: "appointment",
        idKeys: ["id"],
        observedKeys: ["startAt"],
        statusKeys: ["visitStatus", "status"],
        fields: { technicianId: ["assignedUsers.0.id"], technicianName: ["assignedUsers.0.name.full"] }
      },
      { keys: ["client"], entity: "customer", idKeys: ["id"], fields: { customerName: ["name", "companyName"] } },
      { keys: ["lineItems"], entity: "pricebook", idKeys: ["id", "name"] }
    ]
  },
  { keys: ["clients", "data.clients"], entity: "customer", idKeys: ["id"], fields: { customerName: ["name", "companyName"] } },
  {
    keys: ["invoices", "data.invoices"],
    entity: "invoice",
    idKeys: ["id", "invoiceNumber"],
    observedKeys: ["issuedDate", "createdAt"],
    statusKeys: ["invoiceStatus", "status"],
    fields: { ...customerFields(["client.id"], ["client.name"]), invoiceTotal: ["amounts.total", "total"], balance: ["amounts.invoiceBalance"] }
  },
  {
    keys: ["paymentRecords", "payments", "data.paymentRecords"],
    entity: "payment",
    idKeys: ["id"],
    observedKeys: ["entryDate", "createdAt"],
    fields: { amount: ["amount"], ...customerFields(["client.id"], ["client.name"]) }
  },
  {
    keys: ["quotes", "data.quotes"],
    entity: "estimate",
    idKeys: ["id", "quoteNumber"],
    observedKeys: ["createdAt"],
    statusKeys: ["quoteStatus", "status"],
    fields: { ...customerFields(["client.id"], ["client.name"]), jobTotal: ["amounts.total", "total"] }
  },
  { keys: ["users", "data.users"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["name.full", "name"] } }
];

const HCP_EMPLOYEE_NAME = ["assigned_employees.0.first_name"];
const HOUSECALLPRO: CollectionMap[] = [
  {
    keys: ["jobs"],
    entity: "job",
    idKeys: ["id", "invoice_number"],
    observedKeys: ["schedule.scheduled_start", "work_timestamps.completed_at", "created_at"],
    statusKeys: ["work_status", "status"],
    fields: {
      ...customerFields(["customer.id"], ["customer.company", "customer.first_name"]),
      technicianId: ["assigned_employees.0.id"],
      technicianName: HCP_EMPLOYEE_NAME,
      jobTotal: ["total_amount"],
      scheduledOn: ["schedule.scheduled_start"],
      serviceAddress: ["address"]
    },
    cents: ["jobTotal"],
    children: [
      { keys: ["schedule"], entity: "appointment", idKeys: ["id"], observedKeys: ["scheduled_start"] },
      { keys: ["customer"], entity: "customer", idKeys: ["id"], fields: { customerName: ["company", "first_name"] } }
    ]
  },
  { keys: ["customers"], entity: "customer", idKeys: ["id"], fields: { customerName: ["company", "first_name"] } },
  {
    keys: ["invoices"],
    entity: "invoice",
    idKeys: ["id", "invoice_number"],
    observedKeys: ["invoice_date", "created_at"],
    statusKeys: ["status"],
    fields: { invoiceTotal: ["amount", "total"], balance: ["due_amount"], customerId: ["customer_id"] },
    cents: ["invoiceTotal", "balance"]
  },
  {
    keys: ["estimates"],
    entity: "estimate",
    idKeys: ["id", "estimate_number"],
    observedKeys: ["created_at"],
    statusKeys: ["work_status", "status"],
    fields: { ...customerFields(["customer.id"], ["customer.first_name"]), jobTotal: ["options.0.total_amount"] },
    cents: ["jobTotal"]
  },
  { keys: ["employees"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["first_name"] } }
];

const SQUARE: CollectionMap[] = [
  {
    keys: ["bookings"],
    entity: "appointment",
    idKeys: ["id"],
    observedKeys: ["start_at"],
    statusKeys: ["status"],
    fields: { customerId: ["customer_id"], technicianId: ["appointment_segments.0.team_member_id"] }
  },
  { keys: ["customers"], entity: "customer", idKeys: ["id"], fields: { customerName: ["company_name", "given_name"], serviceAddress: ["address"] } },
  {
    keys: ["invoices"],
    entity: "invoice",
    idKeys: ["id", "invoice_number"],
    observedKeys: ["created_at", "scheduled_at"],
    statusKeys: ["status"],
    fields: { customerId: ["primary_recipient.customer_id"], invoiceTotal: ["payment_requests.0.computed_amount_money.amount"] },
    cents: ["invoiceTotal"]
  },
  {
    keys: ["payments"],
    entity: "payment",
    idKeys: ["id"],
    observedKeys: ["created_at"],
    statusKeys: ["status"],
    fields: { customerId: ["customer_id"], amount: ["amount_money.amount", "total_money.amount"], technicianId: ["team_member_id"] },
    cents: ["amount"]
  },
  { keys: ["team_members", "teamMembers"], entity: "technician", idKeys: ["id"], statusKeys: ["status"], fields: { technicianName: ["given_name"] } }
];

const QUICKBOOKS: CollectionMap[] = [
  { keys: ["Customer", "QueryResponse.Customer", "customers"], entity: "customer", idKeys: ["Id", "id"], fields: { customerName: ["DisplayName", "CompanyName"], serviceAddress: ["ShipAddr", "BillAddr"] } },
  {
    keys: ["Invoice", "QueryResponse.Invoice", "invoices"],
    entity: "invoice",
    idKeys: ["Id", "DocNumber", "id"],
    observedKeys: ["TxnDate"],
    fields: { customerId: ["CustomerRef.value"], customerName: ["CustomerRef.name"], invoiceTotal: ["TotalAmt"], balance: ["Balance"] }
  },
  {
    keys: ["Payment", "QueryResponse.Payment", "payments"],
    entity: "payment",
    idKeys: ["Id", "id"],
    observedKeys: ["TxnDate"],
    fields: { customerId: ["CustomerRef.value"], customerName: ["CustomerRef.name"], amount: ["TotalAmt"] }
  },
  {
    keys: ["Estimate", "QueryResponse.Estimate", "estimates"],
    entity: "estimate",
    idKeys: ["Id", "DocNumber", "id"],
    observedKeys: ["TxnDate"],
    statusKeys: ["TxnStatus"],
    fields: { customerId: ["CustomerRef.value"], customerName: ["CustomerRef.name"], jobTotal: ["TotalAmt"] }
  },
  { keys: ["Employee", "QueryResponse.Employee", "employees"], entity: "technician", idKeys: ["Id", "id"], fields: { technicianName: ["DisplayName", "GivenName"] } },
  { keys: ["Item", "QueryResponse.Item", "items"], entity: "pricebook", idKeys: ["Id", "Name", "id"], fields: { price: ["UnitPrice"] } }
];

// FieldEdge Open API (https://docs-dev.fieldedge.com/): work orders, assignments, invoices, quotes, employees, customers.
// The documented work-order list has no money and no status string; total / invoiceTotal stay as guessed export fallbacks.
const FE_ASSIGNMENT: CollectionMap = {
  keys: ["assignments"],
  entity: "appointment",
  idKeys: ["assignmentId"],
  observedKeys: ["scheduleDateTime", "promisedWindowStart"],
  statusKeys: ["status"],
  fields: { technicianId: ["technicianId"], technicianName: ["technicianName"], jobId: ["workOrderId"] }
};

const FIELDEDGE: CollectionMap[] = [
  {
    keys: ["workOrders", "WorkOrders", "work_orders"],
    entity: "job",
    idKeys: ["workOrderId", "workOrderNumber"],
    observedKeys: ["scheduledStart", "scheduledEnd"],
    statusKeys: ["status"],
    fields: {
      customerId: ["customerId"],
      customerName: ["customerName"],
      technicianId: ["primaryAssignment.employeeId"],
      technicianName: ["primaryAssignment.name"],
      jobTotal: ["total", "invoiceTotal"],
      scheduledOn: ["scheduledStart"],
      serviceAddress: ["serviceAddress"],
      invoiceId: ["invoiceId"]
    },
    children: [FE_ASSIGNMENT, { keys: ["equipment"], entity: "equipment", idKeys: ["equipmentId", "serialNumber", "id"] }]
  },
  FE_ASSIGNMENT,
  { keys: ["customers"], entity: "customer", idKeys: ["id", "customerId"], observedKeys: ["updatedAt"], fields: { customerName: ["displayName", "companyName", "lastName"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["invoiceId"], observedKeys: ["dateAdded"], statusKeys: ["status"], fields: { invoiceTotal: ["total"], customerId: ["customerId"], customerName: ["customerName"], jobId: ["workOrderId"] } },
  { keys: ["quotes", "estimates"], entity: "estimate", idKeys: ["id"], statusKeys: ["status"], fields: { jobTotal: ["total"], customerId: ["customerId"], customerName: ["customerName"], jobId: ["workOrderId"] } },
  { keys: ["employees", "technicians"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["name"] } },
  { keys: ["equipment"], entity: "equipment", idKeys: ["equipmentId", "serialNumber", "id"] }
];

const SERVICEFUSION: CollectionMap[] = [
  {
    keys: ["jobs", "items"],
    entity: "job",
    idKeys: ["id", "number", "job_number"],
    observedKeys: ["start_date", "scheduled_at", "end_date"],
    statusKeys: ["status"],
    fields: {
      customerName: ["customer_name"],
      customerId: ["customer_id"],
      technicianId: ["techs.0.id", "techs_assigned.0.id"],
      technicianName: ["techs.0.first_name", "techs_assigned.0.first_name"],
      jobTotal: ["total"],
      scheduledOn: ["start_date", "scheduled_at"],
      serviceAddress: ["location", "address"]
    },
    filter: (row) => row.number != null || row.job_number != null || row.customer_name != null || row.start_date != null || row.status != null,
    children: [{ keys: ["techs", "techs_assigned"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["first_name"] } }]
  },
  { keys: ["customers"], entity: "customer", idKeys: ["id"], fields: { customerName: ["customer_name"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["id", "number"], observedKeys: ["date", "created_at"], statusKeys: ["status"], fields: { invoiceTotal: ["total"], customerName: ["customer_name"] } },
  { keys: ["estimates"], entity: "estimate", idKeys: ["id", "number"], statusKeys: ["status"], fields: { jobTotal: ["total"], customerName: ["customer_name"] } },
  { keys: ["techs"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["first_name"] } },
  { keys: ["equipment"], entity: "equipment", idKeys: ["id", "serial_number"] }
];

export const PLATFORM_MAPPINGS: Record<PlatformKind, CollectionMap[]> = {
  jobber: JOBBER,
  housecallpro: HOUSECALLPRO,
  square: SQUARE,
  quickbooks: QUICKBOOKS,
  fieldedge: FIELDEDGE,
  servicefusion: SERVICEFUSION,
  ...WAVE2_MAPPINGS
};

/**
 * Platform CSV columns that a vendor (or a competitor's migration guide) publishes.
 * Only published column lists live here; everything else uses the generic header aliases.
 */
export const PLATFORM_CSV_COLUMNS: Partial<Record<PlatformKind, CsvColumnOverrides>> = {
  // FieldPulse Job Report default columns: https://help.fieldpulse.com/reporting/raw-data/job-reports.md
  fieldpulse: {
    job: {
      id: ["#id"],
      customerName: ["customer"],
      status: ["status"],
      observed: ["start date/time", "created at"],
      serviceAddress: ["location"],
      technicianName: ["assigned team members"],
      jobTotal: ["total invoice amount"]
    }
  },
  // mHelpDesk CustomerList.csv / ContactsList.csv / InvoiceList.csv report columns:
  // https://help.servicetitan.com/docs/export-your-mhelpdesk-data
  // Customer import template: http://forum.mhelpdesk.com/en/articles/854355-import-your-customer-and-service-location-databases
  mhelpdesk: {
    customer: {
      id: ["id"],
      customerName: ["name", "customername", "customer"],
      serviceAddress: ["address 1", "address1"],
      observed: ["creation date"]
    },
    invoice: {
      id: ["invoice number"],
      customerName: ["customer name"],
      observed: ["issued date"],
      jobTotal: ["amount"]
    }
  }
};

/** Map a platform export or live-pull document. CSV rows arrive as { records: [...] }. */
export function mapPlatformDocument(kind: PlatformKind, doc: Record<string, unknown>, fileName?: string): PlatformRecord[] {
  const mapped = mapCollections(doc, PLATFORM_MAPPINGS[kind]);
  if (mapped.length) return mapped;
  const records = Array.isArray(doc.records) ? doc.records.filter(isRecord) : [];
  return records.length ? mapCsvRows(records, fileName, PLATFORM_CSV_COLUMNS[kind]) : [];
}
