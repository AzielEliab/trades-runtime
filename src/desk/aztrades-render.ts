import type { FieldShell } from "./field-time.js";
import type { JobPriceBoard, PricedJobView } from "./job-price.js";
import type { LocalLoginView } from "./local-login.js";
import type { PropertyCard } from "./property-card.js";
import { TASK_PRESETS } from "./job-price.js";
import { isSupplyHouseImageUrl } from "./supplyhouse-public.js";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(2);
}

export function renderPropertyCard(card: PropertyCard): string {
  const facts = card.companyFacts.length
    ? `<ul>${card.companyFacts.map((fact) => `<li>${esc(fact)}</li>`).join("")}</ul>`
    : `<p class="quiet">No company service-history fact beyond this job.</p>`;
  const listing = card.publicListingFacts.length
    ? `<ul>${card.publicListingFacts.map((fact) => `<li>${esc(fact.sourceKind)} · ${esc(fact.claim)}</li>`).join("")}</ul>`
    : `<p>No public listing facts.</p>`;
  return `<article class="property-card" data-job="${esc(card.jobId)}">
    <h3>Property · ${esc(card.jobId)}</h3>
    <p class="hint" data-hint="property">The property card shows company service history only. Zillow, Redfin, and a county assessor are named here so it is clear they are not connected.</p>
    <p>Service address <strong>${card.serviceAddress ? esc(card.serviceAddress) : "none on this job"}</strong>. Source ${esc(card.addressSource)}. Lifecycle ${esc(card.lifecycle ?? "none")}.</p>
    <p class="quiet">${esc(card.note)}</p>
    <p class="quiet">Zillow connected false. Redfin connected false. County assessor connected ${card.assessorConnected ? "true" : "false"}. Permitted listing feed wired false. Live pull false. Scraped false. Verified property fact ${card.verifiedPropertyFact ? "true" : "false"}.</p>
    <h4>Company service history</h4>
    ${facts}
    <h4>Public listing facts</h4>
    ${listing}
  </article>`;
}

function renderPricedJob(view: PricedJobView): string {
  const parts = view.parts
    .map((part) => {
      const stock = part.areaStock.length
        ? part.areaStock.map((hit) => `${hit.location} ${hit.quantity}${hit.place ? ` @ ${hit.place}` : ""} (${hit.source})`).join("; ")
        : "not known";
      return `<article class="job-card" data-part="${esc(part.partId)}">
        <strong>${esc(part.name)}</strong>
        <span>SKU ${esc(part.sku)} · qty ${part.quantity}</span>
        <p>Part cost ${money(part.cost)} · source ${esc(part.costSource)}. ${part.costSource === "typed" ? "Typed on this desk." : part.costSource === "catalog" ? "Catalog price from the SupplyHouse public product page." : "No cost yet."}</p>
        <p>${esc(part.livePriceNote)}</p>
        ${part.imageSource === "catalog" && isSupplyHouseImageUrl(part.catalogImageUrl) ? `<img alt="SupplyHouse public product image" src="${esc(part.catalogImageUrl)}" />` : ""}
        <p>Image ${esc(part.imageSource)}. ${esc(part.imageNote)}</p>
        <p>Area stock ${esc(stock)}. Supplier stock unknown. ${esc(part.stockNote)}</p>
      </article>`;
    })
    .join("");
  const tasks = view.sheet.tasks.map((task) => `<li>${esc(task.label)} · ${task.amount.toFixed(2)}</li>`).join("");
  const discounts = view.sheet.discounts
    .map((discount) => {
      const who = discount.applied
        ? `applied by ${discount.appliedByRole ?? "unknown"}`
        : `not applied · locked ${discount.locked ? "yes" : "no"} · roles ${discount.allowedRoles.join(", ") || "none"}`;
      const value = discount.kind === "percent" ? `${discount.value}%` : discount.value.toFixed(2);
      return `<li>${esc(discount.kind)} ${esc(value)} · ${esc(who)}</li>`;
    })
    .join("");
  const views = view.sheet.catalogViews
    .map((row) => {
      const price = row.priceReturned == null ? "live price is unavailable" : row.priceReturned.toFixed(2);
      const page = row.pageUrl ? ` · ${row.pageUrl}` : "";
      return `<li>${esc(row.sourceId)} · ${esc(row.sku)} · price ${esc(price)}${esc(page)} · orders placed false. ${esc(row.note)}</li>`;
    })
    .join("");
  const price = view.price;
  return `<section class="priced-job" data-priced-job="${esc(view.sheet.jobId)}">
    <h3>Job ${esc(view.sheet.jobId)}</h3>
    <p class="hint" data-hint="price">Immediate price is part cost plus labor plus task costs, times the margin multiplier the company types. A locked discount refuses a role that is not on its list. Field and office read this same sheet. No supplier order. No ServiceTitan or Jobber write.</p>
    ${parts || `<p class="quiet">No part is attached.</p>`}
    <p>Labor ${money(view.sheet.labor)}. Margin multiplier ${view.sheet.marginMultiplier == null ? "not set" : view.sheet.marginMultiplier.toFixed(2)}. Task costs ${money(price.taskCost)}.</p>
    <ul>${tasks || "<li>No task costs.</li>"}</ul>
    <h4>Discounts</h4>
    <ul>${discounts || "<li>No discounts.</li>"}</ul>
    <p>Part cost ${money(price.partCost)}. Before discount ${money(price.beforeDiscount)}. Discount ${money(price.discountAmount)}. Immediate price <strong>${money(price.immediate)}</strong>.</p>
    <p class="quiet">${esc(price.reason)}</p>
    <p class="quiet">No standing supplier account is connected. Orders enabled false. Vendor write false. pilot_started false. live_backends false. field_claim false.</p>
    <h4>Catalog view requests</h4>
    <ul>${views || "<li>No sign-in recorded.</li>"}</ul>
  </section>`;
}

function rankHigher(actor: string, target: string): boolean {
  const rank: Record<string, number> = { field: 1, office: 2, management: 3 };
  return (rank[actor] ?? 0) > (rank[target] ?? 0);
}

export function renderAztrades(snapshot: {
  dataLabel: string;
  metrics: { invoices: number };
  fieldShell: FieldShell;
  jobPrices: JobPriceBoard;
  propertyCards: PropertyCard[];
  localLogin: LocalLoginView;
}): string {
  const shell = snapshot.fieldShell;
  const prices = snapshot.jobPrices;
  const today = shell.todayJob;
  const todayCard = today ? snapshot.propertyCards.find((card) => card.jobId === today.id) : undefined;
  const techs = shell.techs.length
    ? shell.techs
        .map((tech) => `<option value="${esc(tech.id)}">${esc(tech.name ?? tech.id)}</option>`)
        .join("")
    : `<option value="operator">operator (local stub, no technician on this desk)</option>`;
  const jobs = prices.jobs
    .map((view) => `<option value="${esc(view.sheet.jobId)}">${esc(view.sheet.jobId)}</option>`)
    .join("");
  const sources = prices.sources
    .map((source) => {
      const state = source.id === "supplyhouse" ? "public page, read-only" : "not connected";
      return `<option value="${esc(source.id)}">${esc(source.label)}${source.host ? ` · ${source.host}` : ""} · ${state}</option>`;
    })
    .join("");
  const tasks = TASK_PRESETS.map((label) => `<option value="${esc(label)}">${esc(label)}</option>`).join("");
  const events = shell.events
    .map(
      (event) => `<li data-field-event="${esc(event.kind)}">
        <span>${esc(event.label)}</span> ${esc(event.technicianName ?? event.technicianId)} · ${esc(event.at)}${event.jobId ? ` · job ${esc(event.jobId)}` : ""}${event.localStub ? " · local stub" : ""}
      </li>`
    )
    .join("");
  const alerts = shell.driveAlerts
    .map(
      (alert) => `<p class="rule-banner watch" data-drive-alert="${esc(alert.technicianId)}">
        <strong>watch · drive time</strong>
        <span class="banner-title">Drive time runs long</span>
        <span class="banner-detail">${esc(alert.note)}</span>
      </p>`
    )
    .join("");
  const hintList = shell.hints.map((hint) => `<p class="hint" data-hint="${esc(hint.id)}"><strong>${esc(hint.control)}.</strong> ${esc(hint.text)}</p>`).join("");
  const login = snapshot.localLogin;
  const signed = login.signedIn;
  const pending = login.users.filter((user) => !user.approved);
  const approvable = signed ? pending.filter((user) => rankHigher(signed.role, user.role)) : [];
  const userRows = login.users
    .map(
      (user) => `<li>${esc(user.name)} · ${esc(user.role)} · approved ${user.approved ? "yes" : "no"}${user.firstUser ? " · first local user" : ""}${user.approvedByUserId ? ` · approved by ${esc(user.approvedByUserId)}` : ""}</li>`
    )
    .join("");
  const approveButtons = approvable
    .map((user) => `<button type="button" data-login-action="approve" data-user-id="${esc(user.userId)}">Approve ${esc(user.name)}</button>`)
    .join("");
  return `<p class="quiet">${esc(shell.note)}</p>
    <section id="aztrades-try" data-az="field office management">
      <h3>Try path</h3>
      <p>${esc(shell.tryPath)}</p>
    </section>
    <section id="aztrades-login" data-az="field office management">
      <h3>Local sign-in</h3>
      <p>${esc(login.note)}</p>
      <p class="quiet">hosted identity provider false. pilot_started false. live_backends false. field_claim false. ServiceTitan write false.</p>
      <p>${signed ? `Signed in as ${esc(signed.name)} · ${esc(signed.role)}.` : "Not signed in."}</p>
      <ul>${userRows || "<li>No local user yet.</li>"}</ul>
      ${
        login.users.length
          ? `<label>Name <input id="login-name" name="username" autocomplete="username" maxlength="80"></label>
             <label>Password <input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="200"></label>
             <button type="button" data-login-action="sign-in">Sign in</button>
             <button type="button" data-login-action="sign-out">Sign out</button>
             <h4>Request access</h4>
             <label>Name <input id="request-name" name="username" autocomplete="off" maxlength="80"></label>
             <label>Password <input id="request-password" name="password" type="password" autocomplete="new-password" maxlength="200"></label>
             <label>Role <select id="request-role"><option value="field">field</option><option value="office">office</option><option value="management">management</option></select></label>
             <button type="button" data-login-action="request-access">Request access</button>`
          : `<label>Name <input id="login-name" name="username" autocomplete="username" maxlength="80"></label>
             <label>Password <input id="login-password" name="password" type="password" autocomplete="new-password" maxlength="200"></label>
             <label>Role <select id="login-role"><option value="field">field</option><option value="office">office</option><option value="management">management</option></select></label>
             <p class="quiet">The first local user is already okayed and needs no approver.</p>
             <button type="button" data-login-action="create-first">Create first local user</button>`
      }
      ${approveButtons}
      <p class="quiet" id="login-status" role="status"></p>
    </section>
    <p class="quiet">Surface ${esc(shell.surface)}. Product label ${esc(shell.productLabel)}. field_claim false. office_claim false. pilot_started false. live_backends false. live GPS false. Provider writes false. Pages off. Data ${esc(snapshot.dataLabel)}.</p>
    <div class="chips">
      <span class="chip">Local Softwares 1.0</span>
      <span class="chip">not a Field 1.0 claim</span>
      <span class="chip">not Office Softwares 1.0</span>
      <span class="chip">not a live company OS</span>
    </div>
    <section id="aztrades-home" data-az="field office management">
      <h3>Home · today's job</h3>
      <p class="hint" data-hint="schedule">Home is the job on the mission day. Schedule is the calls board. Time is the clock, meal, and drive controls below.</p>
      ${
        today
          ? `<article class="job-card">
              <strong>${esc(today.id)}</strong>
              <span>${esc(today.lane ?? "lane open")} · ${esc(today.technicianName ?? today.technicianId ?? "Unassigned")} · ${esc(today.status ?? "status open")}</span>
              <span>Service address ${today.serviceAddress ? esc(today.serviceAddress) : "none on this job"}</span>
            </article>`
          : `<p class="quiet">No job on the mission day.</p>`
      }
      ${todayCard ? renderPropertyCard(todayCard) : ""}
      <p>Invoices on this desk <strong>${snapshot.metrics.invoices}</strong>.</p>
      <p class="hint" data-hint="invoice">That count is the desk invoice metric. ServiceTitan invoices and Jobber Invoice are names for the same bridge object. This does not write an invoice.</p>
      <button type="button" class="text-btn" data-open-office="#metrics">Open invoice count</button>
    </section>
    <section id="aztrades-time" data-az="field office management">
      <h3>Time · timesheet</h3>
      <p class="quiet" id="field-status" role="status"></p>
      <label>Technician
        <select id="field-tech">${techs}</select>
      </label>
      <label>Job
        <select id="field-job">${jobs || `<option value="">No job id</option>`}</select>
      </label>
      <div class="actions">
        <button type="button" data-field-kind="clock-in">Clock in</button>
        <button type="button" data-field-kind="clock-out">Clock out</button>
        <button type="button" data-field-kind="meal-start">Start Meal</button>
        <button type="button" data-field-kind="meal-end">End Meal</button>
        <button type="button" data-field-kind="extended-drive">Drive time home</button>
      </div>
      <p class="hint" data-hint="clock-in">Clock in and Clock out match the ServiceTitan timesheet controls. Jobber stores the same span as a TimeSheetEntry. Both stay on this machine.</p>
      <p class="hint" data-hint="meal-start">Start Meal and End Meal match ServiceTitan. Jobber calls this Break and does not enforce meal rules. This desk records both edges and does not enforce a meal law.</p>
      <p class="hint" data-hint="extended-drive">Drive time home tells the office about extended drive. It is not GPS. It does not calculate overtime.</p>
      <h4>Clock, meal, and drive events</h4>
      <p class="quiet">Field, office, and management read this list. Path <code>${esc(shell.path)}</code>.</p>
      <ul class="history">${events || "<li>No field events yet.</li>"}</ul>
      <h4>Drive time alert</h4>
      <p class="hint" data-hint="drive-alert">The alert compares known minutes per stop with the desk drive measure. A missing number does not fire.</p>
      ${alerts || `<p class="quiet">No drive-time alert. Either every known minutes-per-stop is at or under the board measure, or the measure is unknown. Unknown is not zero. Not GPS.</p>`}
    </section>
    <section id="aztrades-price" data-az="field office management">
      <h3>Job price</h3>
      <p class="quiet">${esc(prices.note)}</p>
      <p class="hint" data-hint="price">Type a part cost when SupplyHouse does not return a number. The typed cost remains, and the card says the live price is unavailable. Other named sources stay empty. Sign-in records a view request and does not order.</p>
      <label>Job
        <select id="price-job">${jobs || `<option value="">No job id</option>`}</select>
      </label>
      <label>Part SKU
        <input id="part-sku" name="sku" autocomplete="off" maxlength="80">
      </label>
      <label>Part name
        <input id="part-name" name="name" autocomplete="off" maxlength="120">
      </label>
      <button type="button" data-price-action="attach-part">Attach part</button>
      <label>Part on this job
        <select id="price-part">${partOptions(prices)}</select>
      </label>
      <label>Typed part cost
        <input id="part-cost" name="cost" inputmode="decimal" autocomplete="off">
      </label>
      <button type="button" data-price-action="set-cost">Save typed cost</button>
      <label>Catalog source
        <select id="price-source">${sources}</select>
      </label>
      <button type="button" data-price-action="lookup">Look up price</button>
      <button type="button" data-price-action="signin">Sign in to view price and stock only</button>
      <p class="quiet">When SupplyHouse does not return a number, the typed cost remains and the card says the live price is unavailable.</p>
      <p class="quiet">Sign-in does not order. No permitted account is connected, so the button records a local view request and does not open a browser session that can order.</p>
      <p class="quiet">Image is missing until a file is dropped on this machine or a permitted catalog returns one. A photo is not invented.</p>
      <label>Image file already in job-images
        <input id="part-image-name" name="image" autocomplete="off" maxlength="120">
      </label>
      <button type="button" data-price-action="attach-image">Keep dropped image</button>
      <label>Or drop an image file
        <input id="part-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
      </label>
      <label>Labor
        <input id="price-labor" name="labor" inputmode="decimal" autocomplete="off">
      </label>
      <button type="button" data-price-action="set-labor">Save labor</button>
      <label>Expected profit margin multiplier
        <input id="price-margin" name="margin" inputmode="decimal" autocomplete="off" placeholder="1.40">
      </label>
      <button type="button" data-price-action="set-margin">Save margin</button>
      <label>Task
        <select id="price-task">${tasks}<option value="custom">Other task</option></select>
      </label>
      <label>Task name, if other
        <input id="price-task-custom" name="task" autocomplete="off" maxlength="80">
      </label>
      <label>Task cost
        <input id="price-task-amount" name="taskAmount" inputmode="decimal" autocomplete="off">
      </label>
      <button type="button" data-price-action="add-task">Add task cost</button>
      <label>Discount
        <select id="price-discount-kind">
          <option value="percent">Percent off</option>
          <option value="manager">Manager discount</option>
          <option value="member">Member discount</option>
          <option value="coupon">Coupon amount</option>
        </select>
      </label>
      <label>Discount value
        <input id="price-discount-value" name="discount" inputmode="decimal" autocomplete="off">
      </label>
      <label class="hint-switch"><input id="price-discount-locked" type="checkbox"> Lock discount</label>
      <label>Role applying the discount
        <select id="price-role">
          <option value="technician">technician</option>
          <option value="dispatcher">dispatcher</option>
          <option value="manager">manager</option>
          <option value="operator">operator</option>
        </select>
      </label>
      <p class="hint" data-hint="kpi">The role is a local desk choice, not a company login. A locked discount still refuses a role that is not allowed. Manager discount starts locked for manager and operator.</p>
      <button type="button" data-price-action="add-discount">Add discount</button>
      <label>Discount to apply
        <select id="price-discount">${discountOptions(prices)}</select>
      </label>
      <button type="button" data-price-action="apply-discount">Apply discount</button>
      <p class="quiet" id="price-status" role="status"></p>
      ${prices.jobs.map(renderPricedJob).join("")}
    </section>
    <section data-az="field office management">
      <h3>Help</h3>
      ${hintList}
    </section>`;
}

function partOptions(board: JobPriceBoard): string {
  const options = board.jobs.flatMap((view) =>
    view.parts.map((part) => `<option value="${esc(part.partId)}" data-job="${esc(view.sheet.jobId)}">${esc(view.sheet.jobId)} · ${esc(part.sku)}</option>`)
  );
  return options.join("") || `<option value="">No part yet</option>`;
}

function discountOptions(board: JobPriceBoard): string {
  const options = board.jobs.flatMap((view) =>
    view.sheet.discounts
      .filter((discount) => !discount.applied)
      .map(
        (discount) =>
          `<option value="${esc(discount.discountId)}" data-job="${esc(view.sheet.jobId)}">${esc(view.sheet.jobId)} · ${esc(discount.kind)}</option>`
      )
  );
  return options.join("") || `<option value="">No discount waiting</option>`;
}

export function renderDriveLongAlerts(alerts: FieldShell["driveAlerts"]): string {
  if (!alerts.length) return `<p class="quiet">No technician is above the desk minutes-per-stop measure. A missing drive measure stays unknown and does not fire. Not GPS.</p>`;
  return alerts
    .map(
      (alert) => `<p class="rule-banner watch"><strong>watch</strong> <span class="banner-title">Drive time runs long</span> <span class="banner-detail">${esc(alert.note)}</span></p>`
    )
    .join("");
}

/** Browser actions for field time and job price. Results stay on this machine. */
export function aztradesActionScript(): string {
  return `
    function azValue(id) {
      const node = document.getElementById(id);
      return node && "value" in node ? String(node.value || "").trim() : "";
    }
    function azStatus(id, text) {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
      const shared = document.getElementById("az-status");
      if (shared) shared.textContent = text;
    }
    function azPost(url, body) {
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "local desk refused the action");
        return payload;
      });
    }
    document.body.addEventListener("click", (event) => {
      const open = event.target && event.target.closest ? event.target.closest("[data-open-office]") : null;
      if (open) {
        try { localStorage.setItem("trades-desk-role", "office"); } catch (error) {}
        if (typeof window.__applyAztradesChrome === "function") window.__applyAztradesChrome();
        const href = open.getAttribute("data-open-office");
        if (href) location.hash = href;
        return;
      }
      const field = event.target && event.target.closest ? event.target.closest("[data-field-kind]") : null;
      if (field) {
        const kind = field.getAttribute("data-field-kind");
        field.disabled = true;
        azPost("/api/field/event", {
          kind: kind,
          technicianId: azValue("field-tech") || "operator",
          jobId: azValue("field-job")
        }).then((payload) => {
          field.disabled = false;
          azStatus("field-status", (payload.event && payload.event.label ? payload.event.label : "Recorded") + " on this machine. Office and management can see it.");
        }).catch((error) => {
          field.disabled = false;
          azStatus("field-status", error.message);
        });
        return;
      }
      const price = event.target && event.target.closest ? event.target.closest("[data-price-action]") : null;
      if (!price) return;
      const action = price.getAttribute("data-price-action");
      const jobId = azValue("price-job") || azValue("field-job");
      const partId = azValue("price-part");
      const role = azValue("price-role") || "technician";
      let body = { action: action, jobId: jobId, partId: partId, role: role, actorId: role };
      if (action === "attach-part") {
        body.sku = azValue("part-sku");
        body.name = azValue("part-name");
      } else if (action === "set-cost") {
        body.cost = azValue("part-cost");
      } else if (action === "lookup" || action === "signin") {
        body.sourceId = azValue("price-source");
        body.sku = azValue("part-sku");
      } else if (action === "attach-image") {
        body.fileName = azValue("part-image-name");
      } else if (action === "set-labor") {
        body.labor = azValue("price-labor");
      } else if (action === "set-margin") {
        body.margin = azValue("price-margin");
      } else if (action === "add-task") {
        const preset = azValue("price-task");
        body.label = preset === "custom" ? azValue("price-task-custom") : preset;
        body.amount = azValue("price-task-amount");
      } else if (action === "add-discount") {
        body.kind = azValue("price-discount-kind");
        body.value = azValue("price-discount-value");
        const locked = document.getElementById("price-discount-locked");
        body.locked = !!(locked && locked.checked);
      } else if (action === "apply-discount") {
        body.discountId = azValue("price-discount");
      }
      price.disabled = true;
      azPost("/api/job-price", body).then((payload) => {
        price.disabled = false;
        const note = payload.note || payload.reason || "Saved on this desk.";
        azStatus("price-status", note);
      }).catch((error) => {
        price.disabled = false;
        azStatus("price-status", error.message);
      });
    });
    document.body.addEventListener("change", (event) => {
      const input = event.target;
      if (!input || input.id !== "part-image-file" || !input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!/^image\\/(png|jpeg|webp|gif)$/.test(file.type)) {
        azStatus("price-status", "Image must be a png, jpeg, webp, or gif.");
        return;
      }
      if (file.size > 1500000) {
        azStatus("price-status", "Image is larger than 1.5 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const imageBase64 = text.indexOf(",") >= 0 ? text.split(",")[1] : text;
        azPost("/api/job-price", {
          action: "drop-image",
          jobId: azValue("price-job") || azValue("field-job"),
          partId: azValue("price-part"),
          mediaType: file.type,
          imageBase64: imageBase64
        }).then((payload) => {
          azStatus("price-status", payload.note || "Image kept on this machine.");
        }).catch((error) => {
          azStatus("price-status", error.message);
        });
      };
      reader.readAsDataURL(file);
    });
    document.body.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest("[data-login-action]") : null;
      if (!button) return;
      const action = button.getAttribute("data-login-action");
      const body = { action: action, name: "", password: "", role: "", userId: "" };
      if (action === "create-first" || action === "sign-in") {
        body.name = azValue("login-name");
        body.password = azValue("login-password");
        body.role = azValue("login-role");
      } else if (action === "request-access") {
        body.name = azValue("request-name");
        body.password = azValue("request-password");
        body.role = azValue("request-role");
      } else if (action === "approve") {
        body.userId = button.getAttribute("data-user-id") || "";
      }
      button.disabled = true;
      azPost("/api/local-login", body).then((payload) => {
        azStatus("login-status", payload.note || "Saved on this machine.");
        location.reload();
      }).catch((error) => {
        button.disabled = false;
        azStatus("login-status", error.message);
      });
    });
  `;
}
