import type { Wave2Kind } from "./catalog-wave2.js";
import type { CollectionMap } from "./map.js";

/**
 * Collection maps for wave-2 platform peers. Where the vendor publishes an API
 * reference (Workiz, ServiceTrade, FieldPulse, ServiceM8, Simpro, Commusoft,
 * Kickserv) object names follow it. Where it does not (Successware, BuildOps,
 * mHelpDesk, Wintac) the maps read common export column names and CSV falls
 * back to header aliases. Every map is fixture-tested only.
 */

const SUCCESSWARE: CollectionMap[] = [
  {
    keys: ["calls", "Calls", "jobs", "Jobs"],
    entity: "job",
    idKeys: ["callId", "CallID", "callNumber", "jobNumber", "id"],
    observedKeys: ["scheduledDate", "ScheduledDate", "completedDate", "callDate"],
    statusKeys: ["status", "Status", "callStatus"],
    fields: {
      customerId: ["customerId", "customerNumber", "locationId"],
      customerName: ["customerName", "locationName"],
      technicianId: ["technicianId", "techId"],
      technicianName: ["technician", "technicianName", "techName"],
      jobTotal: ["invoiceTotal", "total"],
      scheduledOn: ["scheduledDate", "ScheduledDate"],
      serviceAddress: ["locationAddress", "address"]
    },
    children: [{ keys: ["equipment"], entity: "equipment", idKeys: ["equipmentId", "serialNumber", "id"] }]
  },
  { keys: ["customers", "locations"], entity: "customer", idKeys: ["customerId", "locationId", "id"], fields: { customerName: ["customerName", "name", "locationName"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["invoiceNumber", "invoiceId", "id"], observedKeys: ["invoiceDate"], statusKeys: ["status"], fields: { invoiceTotal: ["total", "invoiceTotal"], customerId: ["customerId", "locationId"] } },
  { keys: ["technicians", "employees"], entity: "technician", idKeys: ["technicianId", "employeeId", "id"], fields: { technicianName: ["name", "technicianName"] } },
  { keys: ["equipment"], entity: "equipment", idKeys: ["equipmentId", "serialNumber", "id"] }
];

const WORKIZ: CollectionMap[] = [
  {
    keys: ["jobs", "Jobs"],
    entity: "job",
    idKeys: ["UUID", "uuid", "id", "SerialId", "serialId"],
    observedKeys: ["JobDateTime", "jobDateTime", "CreatedDate", "createdAt"],
    statusKeys: ["Status", "status", "SubStatus", "subStatus"],
    fields: {
      customerId: ["ClientId", "clientId"],
      customerName: ["ClientName", "clientName", "FirstName"],
      technicianId: ["Team.0.id", "team.0.id"],
      technicianName: ["Team.0.Name", "Team.0.name", "team.0.name"],
      jobTotal: ["JobTotalPrice", "jobTotalPrice", "total"],
      scheduledOn: ["JobDateTime", "jobDateTime"],
      serviceAddress: ["Address", "address"]
    },
    children: [{ keys: ["Team", "team"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["Name", "name"] } }]
  },
  { keys: ["clients", "Clients"], entity: "customer", idKeys: ["UUID", "id", "ClientId"], fields: { customerName: ["ClientName", "name", "FirstName"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["UUID", "id", "InvoiceNumber"], observedKeys: ["CreatedDate", "createdAt"], statusKeys: ["Status", "status"], fields: { invoiceTotal: ["Total", "total"], customerId: ["ClientId", "clientId"] } },
  { keys: ["estimates"], entity: "estimate", idKeys: ["UUID", "id"], statusKeys: ["Status", "status"], fields: { jobTotal: ["Total", "total"] } },
  { keys: ["users", "team"], entity: "technician", idKeys: ["id", "UUID"], fields: { technicianName: ["name", "Name"] } }
];

const SERVICETRADE: CollectionMap[] = [
  {
    keys: ["jobs", "data.jobs"],
    entity: "job",
    idKeys: ["id", "number"],
    observedKeys: ["currentAppointment.windowStart", "scheduledDate", "dueBy", "created"],
    observedEpochSeconds: true,
    statusKeys: ["status"],
    fields: {
      customerId: ["customer.id", "location.id"],
      customerName: ["customer.name", "location.name"],
      technicianId: ["currentAppointment.techs.0.id"],
      technicianName: ["currentAppointment.techs.0.name"],
      jobTotal: ["estimatedPrice"],
      serviceAddress: ["location.address"]
    },
    children: [{ keys: ["location"], entity: "customer", idKeys: ["id"], fields: { customerName: ["name"] } }]
  },
  { keys: ["appointments", "data.appointments"], entity: "appointment", idKeys: ["id"], observedKeys: ["windowStart"], observedEpochSeconds: true, statusKeys: ["status"], fields: { technicianId: ["techs.0.id"], technicianName: ["techs.0.name"] } },
  { keys: ["locations", "data.locations"], entity: "customer", idKeys: ["id"], fields: { customerName: ["name"] } },
  { keys: ["invoices", "data.invoices"], entity: "invoice", idKeys: ["id", "invoiceNumber"], observedKeys: ["transactionDate", "created"], observedEpochSeconds: true, statusKeys: ["status"], fields: { invoiceTotal: ["totalPrice"] } },
  { keys: ["quotes", "data.quotes"], entity: "estimate", idKeys: ["id"], statusKeys: ["status"], fields: { jobTotal: ["totalPrice"] } },
  { keys: ["users", "data.users"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["name"] } },
  { keys: ["assets", "data.assets"], entity: "equipment", idKeys: ["id"] }
];

const BUILDOPS: CollectionMap[] = [
  {
    keys: ["jobs", "Jobs"],
    entity: "job",
    idKeys: ["jobNumber", "id"],
    observedKeys: ["scheduledDate", "visitDate", "createdDate"],
    statusKeys: ["status", "jobStatus"],
    fields: {
      customerId: ["customerId", "customer.id"],
      customerName: ["customerName", "customer.name"],
      technicianId: ["primaryTechnicianId"],
      technicianName: ["primaryTechnician", "technicianName"],
      jobTotal: ["totalAmount", "invoiceTotal"],
      scheduledOn: ["scheduledDate"],
      serviceAddress: ["propertyAddress", "property.address"]
    },
    children: [{ keys: ["visits"], entity: "appointment", idKeys: ["visitNumber", "id"], observedKeys: ["scheduledFor", "visitDate"], fields: { technicianName: ["primaryTechnician"] } }]
  },
  { keys: ["customers", "properties"], entity: "customer", idKeys: ["customerId", "id"], fields: { customerName: ["customerName", "name"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["invoiceNumber", "id"], observedKeys: ["invoiceDate"], statusKeys: ["status"], fields: { invoiceTotal: ["totalAmount", "total"], customerId: ["customerId"] } },
  { keys: ["quotes"], entity: "estimate", idKeys: ["quoteNumber", "id"], statusKeys: ["status"], fields: { jobTotal: ["totalAmount", "total"] } },
  { keys: ["employees", "technicians"], entity: "technician", idKeys: ["employeeId", "id"], fields: { technicianName: ["name", "employeeName"] } },
  { keys: ["assets"], entity: "equipment", idKeys: ["assetId", "serialNumber", "id"] }
];

const FIELDPULSE: CollectionMap[] = [
  {
    keys: ["jobs", "response"],
    entity: "job",
    idKeys: ["id"],
    observedKeys: ["start_time", "scheduled_start", "start_date", "created_at"],
    statusKeys: ["status", "status_name"],
    fields: {
      customerId: ["customer_id", "customer.id"],
      customerName: ["customer.display_name", "customer_name"],
      technicianId: ["assigned_to.0.id", "team_members.0.id"],
      technicianName: ["assigned_to.0.name", "team_members.0.name"],
      jobTotal: ["total"],
      scheduledOn: ["start_time", "start_date"],
      serviceAddress: ["address", "location.address"]
    }
  },
  { keys: ["customers"], entity: "customer", idKeys: ["id"], fields: { customerName: ["display_name", "company_name", "first_name"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["id", "invoice_number"], observedKeys: ["created_at"], statusKeys: ["status"], fields: { invoiceTotal: ["total"], customerId: ["customer_id"] } },
  { keys: ["estimates"], entity: "estimate", idKeys: ["id"], statusKeys: ["status"], fields: { jobTotal: ["total"], customerId: ["customer_id"] } },
  { keys: ["users", "team_members"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["name", "first_name"] } }
];

const KICKSERV: CollectionMap[] = [
  {
    keys: ["jobs", "job"],
    entity: "job",
    idKeys: ["job_number", "id", "number"],
    observedKeys: ["scheduled_on", "scheduled_at", "created_at"],
    statusKeys: ["status", "job_status"],
    fields: {
      customerId: ["customer.customer_number", "customer_number", "customer_id"],
      customerName: ["customer.name", "customer_name"],
      technicianName: ["employees.0.name", "assigned_to"],
      jobTotal: ["total"],
      scheduledOn: ["scheduled_on", "scheduled_at"],
      serviceAddress: ["service_address", "address"]
    },
    children: [{ keys: ["customer"], entity: "customer", idKeys: ["customer_number", "id"], fields: { customerName: ["name"] } }]
  },
  { keys: ["customers", "customer"], entity: "customer", idKeys: ["customer_number", "id"], fields: { customerName: ["name"] } },
  { keys: ["invoices", "invoice"], entity: "invoice", idKeys: ["invoice_number", "id"], observedKeys: ["invoice_date", "created_at"], statusKeys: ["status"], fields: { invoiceTotal: ["total"] } },
  { keys: ["estimates", "estimate"], entity: "estimate", idKeys: ["estimate_number", "id"], statusKeys: ["status"], fields: { jobTotal: ["total"] } },
  { keys: ["employees", "employee"], entity: "technician", idKeys: ["id", "employee_number"], fields: { technicianName: ["name", "first_name"] } }
];

const MHELPDESK: CollectionMap[] = [
  {
    keys: ["tickets", "Tickets", "jobs", "workOrders"],
    entity: "job",
    idKeys: ["ticketId", "TicketId", "ticketNumber", "id"],
    observedKeys: ["scheduledDate", "appointmentDate", "createdDate"],
    statusKeys: ["status", "Status"],
    fields: {
      customerId: ["customerId", "CustomerId"],
      customerName: ["customerName", "CustomerName"],
      technicianName: ["assignedTo", "technician", "AssignedTo"],
      jobTotal: ["total", "invoiceTotal"],
      scheduledOn: ["scheduledDate", "appointmentDate"],
      serviceAddress: ["serviceAddress", "address"]
    }
  },
  { keys: ["customers", "Customers"], entity: "customer", idKeys: ["customerId", "id"], fields: { customerName: ["customerName", "name"] } },
  { keys: ["appointments"], entity: "appointment", idKeys: ["appointmentId", "id"], observedKeys: ["start", "appointmentDate"], fields: { technicianName: ["technician", "assignedTo"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["invoiceNumber", "id"], observedKeys: ["invoiceDate"], statusKeys: ["status"], fields: { invoiceTotal: ["total"] } },
  { keys: ["estimates"], entity: "estimate", idKeys: ["estimateNumber", "id"], statusKeys: ["status"], fields: { jobTotal: ["total"] } }
];

const isScheduled = (row: Record<string, unknown>) => row.activity_was_scheduled === 1 || row.activity_was_scheduled === "1" || row.activity_was_scheduled === true;

const SERVICEM8: CollectionMap[] = [
  {
    keys: ["jobs", "job"],
    entity: "job",
    idKeys: ["uuid", "generated_job_id"],
    observedKeys: ["date", "work_order_date", "edit_date"],
    statusKeys: ["status"],
    fields: {
      customerId: ["company_uuid"],
      customerName: ["company_name"],
      jobTotal: ["total_invoice_amount"],
      serviceAddress: ["job_address"]
    }
  },
  {
    keys: ["jobactivity", "jobActivities", "jobactivities"],
    entity: "appointment",
    idKeys: ["uuid"],
    observedKeys: ["start_date"],
    fields: { technicianId: ["staff_uuid"], jobId: ["job_uuid"] },
    filter: isScheduled
  },
  { keys: ["company", "companies"], entity: "customer", idKeys: ["uuid"], fields: { customerName: ["name"] } },
  { keys: ["staff"], entity: "technician", idKeys: ["uuid"], fields: { technicianName: ["first"] } },
  { keys: ["material", "materials"], entity: "pricebook", idKeys: ["uuid", "item_number"] }
];

const SIMPRO: CollectionMap[] = [
  {
    keys: ["jobs", "Jobs"],
    entity: "job",
    idKeys: ["ID", "id"],
    observedKeys: ["DateIssued", "DateModified"],
    statusKeys: ["Status.Name", "Stage"],
    fields: {
      customerId: ["Customer.ID"],
      customerName: ["Customer.CompanyName", "Customer.GivenName"],
      technicianId: ["Technician.ID"],
      technicianName: ["Technician.Name"],
      jobTotal: ["Total.IncTax", "Total.ExTax"],
      serviceAddress: ["Site.Name"]
    }
  },
  { keys: ["customers"], entity: "customer", idKeys: ["ID"], fields: { customerName: ["CompanyName", "GivenName"] } },
  { keys: ["invoices"], entity: "invoice", idKeys: ["ID"], observedKeys: ["DateIssued"], statusKeys: ["Status.Name"], fields: { invoiceTotal: ["Total.IncTax"] } },
  { keys: ["quotes"], entity: "estimate", idKeys: ["ID"], statusKeys: ["Stage", "Status.Name"], fields: { jobTotal: ["Total.IncTax"] } },
  { keys: ["employees"], entity: "technician", idKeys: ["ID"], fields: { technicianName: ["Name"] } }
];

const COMMUSOFT: CollectionMap[] = [
  {
    keys: ["jobs", "data"],
    entity: "job",
    idKeys: ["id"],
    observedKeys: ["expectedOnsiteDateTime", "jobReportedDateTime", "createdOnDateTime"],
    statusKeys: ["status", "stageName"],
    fields: {
      customerId: ["propertyID"],
      technicianId: ["usersCurrentlyAssignedToJob.0.id"],
      technicianName: ["usersCurrentlyAssignedToJob.0.name"],
      scheduledOn: ["expectedOnsiteDateTime"],
      originalJobId: ["recallOfParentJobID"]
    }
  },
  { keys: ["properties"], entity: "customer", idKeys: ["id"], fields: { customerName: ["name", "displayName"] } },
  { keys: ["users"], entity: "technician", idKeys: ["id"], fields: { technicianName: ["name", "firstName"] } },
  { keys: ["assets"], entity: "equipment", idKeys: ["id"] }
];

const WINTAC: CollectionMap[] = [
  {
    keys: ["workOrders", "WorkOrders", "jobs"],
    entity: "job",
    idKeys: ["WorkOrderNo", "workOrderNumber", "id"],
    observedKeys: ["ScheduleDate", "scheduledDate", "Date"],
    statusKeys: ["Status", "status"],
    fields: {
      customerId: ["CustomerNo", "customerId"],
      customerName: ["CustomerName", "Customer", "customerName"],
      technicianName: ["Technician", "Tech"],
      jobTotal: ["Total", "Amount"],
      scheduledOn: ["ScheduleDate", "scheduledDate"],
      serviceAddress: ["ServiceAddress", "Address"]
    }
  },
  { keys: ["customers", "Customers"], entity: "customer", idKeys: ["CustomerNo", "id"], fields: { customerName: ["CustomerName", "Name"] } },
  { keys: ["invoices", "Invoices"], entity: "invoice", idKeys: ["InvoiceNo", "id"], observedKeys: ["InvoiceDate"], fields: { invoiceTotal: ["Total", "Amount"] } },
  { keys: ["technicians"], entity: "technician", idKeys: ["TechCode", "id"], fields: { technicianName: ["Name"] } },
  { keys: ["equipment"], entity: "equipment", idKeys: ["SerialNo", "id"] }
];

export const WAVE2_MAPPINGS: Record<Wave2Kind, CollectionMap[]> = {
  successware: SUCCESSWARE,
  workiz: WORKIZ,
  servicetrade: SERVICETRADE,
  buildops: BUILDOPS,
  fieldpulse: FIELDPULSE,
  kickserv: KICKSERV,
  mhelpdesk: MHELPDESK,
  servicem8: SERVICEM8,
  simpro: SIMPRO,
  commusoft: COMMUSOFT,
  wintac: WINTAC
};
