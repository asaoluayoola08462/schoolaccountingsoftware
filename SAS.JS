"use strict";

const STORAGE_KEY = "school_ledger_demo_v1";

const CLASSES = [
  "Nursery 1", "Nursery 2", "Primary 1", "Primary 2",
  "Primary 3", "Primary 4", "Primary 5", "Primary 6",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

let schoolData = loadData();
let selectedFeeClass = null;
let latestReceiptId = null;
let latestStatement = null;

function createId() {
  return window.crypto?.randomUUID?.() ||
    "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (Array.isArray(data.students) && Array.isArray(data.families)) {
        if (!Array.isArray(data.fees)) data.fees = [];
        if (!Array.isArray(data.payments)) data.payments = [];
        if (!Array.isArray(data.charges)) data.charges = [];
        if (!data.settings || typeof data.settings !== "object") data.settings = {};
        return data;
      }
    }
  } catch (error) {
    console.error("Could not load saved data:", error);
  }
  return { students: [], families: [], fees: [], payments: [], charges: [], settings: {} };
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schoolData));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
    return false;
  }
}

function formatNaira(value) {
  return "₦" + Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function getStudentById(id) {
  return schoolData.students.find(student => student.id === id);
}

function getFeesForStudent(student) {
  if (!student) return [];
  return schoolData.fees.filter(fee =>
    fee.studentClass === student.studentClass ||
    fee.studentClass === "All Classes"
  );
}

function getStudentPayments(studentId, year, term) {
  return schoolData.payments.filter(payment =>
    !payment.voided &&
    payment.studentId === studentId &&
    payment.schoolYear === year &&
    payment.term === term
  );
}

function getStudentPaid(studentId, year, term) {
  return getStudentPayments(studentId, year, term)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

// A charge is a saved record of a fee owed for a particular period.
// Existing charges are never silently recalculated if the fee structure changes.
function ensureCharges(student, year, term) {
  const originalCharges = [...schoolData.charges];
  const applicableFees = getFeesForStudent(student);

  for (const fee of applicableFees) {
    let shouldCharge = false;
    let chargeYear = year;
    let chargeTerm = term;

    if (fee.period === "Per term") {
      shouldCharge = !schoolData.charges.some(charge =>
        charge.studentId === student.id &&
        charge.feeId === fee.id &&
        charge.schoolYear === year &&
        charge.term === term
      );
    } else if (fee.period === "Per session") {
      shouldCharge = !schoolData.charges.some(charge =>
        charge.studentId === student.id &&
        charge.feeId === fee.id &&
        charge.schoolYear === year
      );
    } else if (fee.period === "One-time") {
      shouldCharge = !schoolData.charges.some(charge =>
        charge.studentId === student.id &&
        charge.feeId === fee.id
      );
    }

    if (shouldCharge) {
      schoolData.charges.push({
        id: createId(),
        studentId: student.id,
        studentName: student.name,
        admissionNo: student.admissionNo,
        studentClass: student.studentClass,
        feeId: fee.id,
        feeName: fee.name,
        period: fee.period,
        amount: Number(fee.amount),
        schoolYear: chargeYear,
        term: chargeTerm,
        createdAt: new Date().toISOString()
      });
    }
  }

  if (!saveData()) {
    schoolData.charges = originalCharges;
    return false;
  }
  return true;
}

function getChargesForPeriod(studentId, year, term) {
  return schoolData.charges.filter(charge =>
    charge.studentId === studentId &&
    charge.schoolYear === year &&
    charge.term === term
  );
}

function getChargeTotal(studentId, year, term) {
  return getChargesForPeriod(studentId, year, term)
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
}

function getNextReceipt() {
  const sequence = Math.max(
    0,
    ...schoolData.payments.map(payment => Number(payment.receiptSequence) || 0)
  ) + 1;
  return {
    sequence,
    number: "SL-" + new Date().getFullYear() + "-" +
      String(sequence).padStart(5, "0")
  };
}

// ---------------- STUDENTS AND FAMILIES ----------------

el("studentForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = el("studentName").value.trim();
  const admissionNo = el("admissionNo").value.trim();
  const studentClass = el("studentClass").value;
  const parentName = el("parentName").value.trim();
  const familyId = el("familySelect").value;
  const message = el("formMessage");

  if (!name || !admissionNo || !studentClass || !parentName) {
    message.textContent = "Please complete all required fields.";
    return;
  }

  if (name.length > 100 || parentName.length > 100 || admissionNo.length > 30) {
    message.textContent =
      "Names can have at most 100 characters and admission numbers at most 30.";
    return;
  }

  if (schoolData.students.some(student =>
    student.admissionNo.toLowerCase() === admissionNo.toLowerCase()
  )) {
    message.textContent = "This admission number is already registered.";
    return;
  }

  let family = schoolData.families.find(item => item.id === familyId);
  let newFamily = false;

  if (!family) {
    family = { id: createId(), parentName, studentIds: [] };
    schoolData.families.push(family);
    newFamily = true;
  }

  const student = {
    id: createId(), name, admissionNo, studentClass,
    familyId: family.id, registeredAt: new Date().toISOString()
  };

  family.studentIds.push(student.id);
  schoolData.students.push(student);

  if (!saveData()) {
    schoolData.students.pop();
    family.studentIds.pop();
    if (newFamily) {
      schoolData.families = schoolData.families.filter(f => f.id !== family.id);
    }
    message.textContent = "Could not save. Please try again.";
    return;
  }

  el("studentForm").reset();
  prefillAdmissionNo();
  message.textContent = name + " registered successfully.";
  renderStudents();
  renderStudentSelectors();
  updateDashboard();
});

function renderStudents() {
  const table = el("studentTable");
  const search = el("studentSearch").value.trim().toLowerCase();
  table.replaceChildren();

  const students = schoolData.students.filter(student => {
    const family = schoolData.families.find(f => f.id === student.familyId);
    return [
      student.name, student.admissionNo, student.studentClass,
      family?.parentName || ""
    ].some(value => String(value).toLowerCase().includes(search));
  });

  if (!students.length) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = search ? "No matching students." : "No students registered yet.";
  }

  students.forEach(student => {
    const family = schoolData.families.find(f => f.id === student.familyId);
    const row = table.insertRow();
    [
      student.name, student.admissionNo, student.studentClass,
      family?.parentName || "Unassigned"
    ].forEach(value => row.insertCell().textContent = value);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "small-btn";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openEditStudent(student));
    row.insertCell().appendChild(editButton);
  });

  setText("studentCount", schoolData.students.length);
  renderFamilyOptions();
}

function renderFamilyOptions() {
  const select = el("familySelect");
  const current = select.value;
  select.replaceChildren(makeOption("", "Create new family"));

  schoolData.families.forEach(family => {
    select.appendChild(makeOption(
      family.id,
      family.parentName + " (" + family.studentIds.length + " student(s))"
    ));
  });

  if (schoolData.families.some(f => f.id === current)) select.value = current;
}

el("studentSearch").addEventListener("input", renderStudents);

// ---------------- FEE STRUCTURE ----------------

el("feeForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = el("feeName").value.trim().replace(/\s+/g, " ");
  const rawAmount = el("feeAmount").value.trim();
  const amount = Number(rawAmount);
  const studentClass = el("feeClass").value;
  const period = el("feePeriod").value;
  const message = el("feeMessage");
  const sameName = text => text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!name || !studentClass || !period) {
    message.textContent = "Please enter valid fee details.";
    return;
  }
  if (name.length > 60) {
    message.textContent = "Fee names can have at most 60 characters.";
    return;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || !Number.isFinite(amount) || amount < 0.01) {
    message.textContent =
      "Enter a fee amount of at least ₦0.01, with no more than 2 decimal places.";
    return;
  }
  if (amount > 100000000) {
    message.textContent = "That fee amount is too large. The maximum is " + formatNaira(100000000) + ".";
    return;
  }

  // A fee for "All Classes" overlaps every specific class, so the same fee name
  // and period cannot be defined for both: those students would be charged twice.
  const clash = schoolData.fees.find(fee =>
    sameName(fee.name) === sameName(name) &&
    fee.period === period &&
    (fee.studentClass === studentClass ||
      fee.studentClass === "All Classes" ||
      studentClass === "All Classes")
  );

  if (clash) {
    message.textContent = clash.studentClass === studentClass
      ? "This fee already exists for that class and period."
      : "A fee called \"" + clash.name + "\" already applies to " + clash.studentClass +
        " for that period, so this would charge some students twice. Use a different fee name if this is a separate fee.";
    return;
  }

  schoolData.fees.push({
    id: createId(), name, amount, studentClass, period,
    createdAt: new Date().toISOString()
  });

  if (!saveData()) {
    schoolData.fees.pop();
    message.textContent = "Could not save this fee.";
    return;
  }

  el("feeForm").reset();
  message.textContent = "Fee added successfully.";
  renderFees();
  updateDashboard();
});

function renderFees() {
  const picker = el("feeClassFilter");
  const view = el("classFeeView");

  if (!picker.value) {
    selectedFeeClass = null;
    view.hidden = true;
    return;
  }

  selectedFeeClass = picker.value;
  renderSelectedClassFees();
}

function renderSelectedClassFees() {
  const view = el("classFeeView");
  const table = el("classFeeTable");
  table.replaceChildren();
  view.hidden = false;
  setText("selectedClassTitle", selectedFeeClass + " Fees");

  const fees = schoolData.fees.filter(fee =>
    fee.studentClass === selectedFeeClass || fee.studentClass === "All Classes"
  );

  let total = 0;

  if (!fees.length) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = "No fees have been added for this class yet.";
  }

  fees.forEach(fee => {
    total += Number(fee.amount);
    const row = table.insertRow();
    [fee.name, formatNaira(fee.amount), fee.period].forEach(value => {
      row.insertCell().textContent = value;
    });

    const actionCell = row.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delete-fee-btn";
    button.textContent = "Delete";
    button.addEventListener("click", () => {
      if (!confirm('Delete "' + fee.name + '" from the fee structure?')) return;

      if (schoolData.charges.some(charge => charge.feeId === fee.id)) {
        alert("This fee has already been charged to a student. Deletion is blocked to preserve financial history.");
        return;
      }

      const previous = [...schoolData.fees];
      schoolData.fees = schoolData.fees.filter(item => item.id !== fee.id);

      if (!saveData()) {
        schoolData.fees = previous;
        alert("Could not save the change.");
      }
      renderFees();
      updateDashboard();
    });
    actionCell.appendChild(button);
  });

  setText("classFeeTotal", "Total listed fees (not necessarily due in one term): " + formatNaira(total));
}

el("feeClassFilter").addEventListener("change", renderFees);
el("backToClasses").addEventListener("click", () => {
  el("feeClassFilter").value = "";
  selectedFeeClass = null;
  el("classFeeView").hidden = true;
});

// ---------------- PAYMENT SELECTORS ----------------

function renderStudentSelectors() {
  const ids = ["paymentStudent", "paymentHistoryStudent", "statementStudent"];

  ids.forEach(id => {
    const select = el(id);
    const previous = select.value;
    const isHistory = id === "paymentHistoryStudent";
    select.replaceChildren(makeOption("", isHistory ? "All students" : "Select student"));

    schoolData.students.forEach(student => {
      select.appendChild(makeOption(
        student.id,
        student.name + " — " + student.admissionNo + " (" + student.studentClass + ")"
      ));
    });

    if (schoolData.students.some(s => s.id === previous)) select.value = previous;
  });
}

// ---------------- PAYMENT RECORDING ----------------

const MAX_PAYMENT = 100000000;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

// When a payment looks unusual (possible duplicate or more than the balance),
// the first submit only shows a warning. Submitting the same details again
// confirms it. Changing any detail cancels the confirmation.
let pendingPaymentKey = null;

el("paymentForm").addEventListener("submit", event => {
  event.preventDefault();

  const student = getStudentById(el("paymentStudent").value);
  const rawAmount = el("paymentAmount").value.trim();
  const amount = Number(rawAmount);
  const schoolYear = el("paymentYear").value.trim();
  const term = el("paymentTerm").value;
  const method = el("paymentMethod").value;
  const note = el("paymentNote").value.trim();
  const message = el("paymentMessage");

  if (!student) {
    message.textContent = "Please select a registered student.";
    return;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || !Number.isFinite(amount) || amount < 0.01) {
    message.textContent =
      "Enter a valid amount of at least ₦0.01, with no more than 2 decimal places.";
    return;
  }
  if (amount > MAX_PAYMENT) {
    message.textContent =
      "That amount is too large. The maximum for one payment is " + formatNaira(MAX_PAYMENT) + ".";
    return;
  }
  const yearMatch = schoolYear.match(/^(\d{4})\/(\d{4})$/);
  if (!yearMatch || Number(yearMatch[2]) !== Number(yearMatch[1]) + 1) {
    message.textContent = "Enter the school year like 2026/2027.";
    return;
  }
  if (!term || !method) {
    message.textContent = "Please enter valid payment details.";
    return;
  }

  if (!ensureCharges(student, schoolYear, term)) {
    message.textContent = "Could not save the fee charges. Payment was not recorded.";
    return;
  }

  const warnings = [];
  const now = Date.now();

  const duplicate = schoolData.payments.find(p =>
    !p.voided &&
    p.studentId === student.id &&
    Number(p.amount) === amount &&
    p.schoolYear === schoolYear &&
    p.term === term &&
    p.method === method &&
    now - new Date(p.date).getTime() < DUPLICATE_WINDOW_MS
  );
  if (duplicate) {
    warnings.push(
      "The same payment (" + duplicate.receiptNumber + ") was recorded a few minutes ago."
    );
  }

  const owed = getChargesForPeriod(student.id, schoolYear, term)
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
  const outstanding = owed - getStudentPaid(student.id, schoolYear, term);
  if (amount > outstanding) {
    warnings.push(
      "This is more than the outstanding balance of " +
      formatNaira(Math.max(outstanding, 0)) + " and will be recorded as a credit."
    );
  }

  const paymentKey = [student.id, amount, schoolYear, term, method].join("|");
  if (warnings.length && pendingPaymentKey !== paymentKey) {
    pendingPaymentKey = paymentKey;
    message.textContent =
      "Please check: " + warnings.join(" ") +
      " Press Record Payment again to confirm.";
    return;
  }

  const receipt = getNextReceipt();
  const payment = {
    id: createId(),
    receiptNumber: receipt.number,
    receiptSequence: receipt.sequence,
    studentId: student.id,
    studentName: student.name,
    admissionNo: student.admissionNo,
    studentClass: student.studentClass,
    amount, schoolYear, term, method, note,
    date: new Date().toISOString()
  };

  schoolData.payments.push(payment);

  if (!saveData()) {
    schoolData.payments.pop();
    message.textContent = "Payment could not be saved. No receipt was issued.";
    return;
  }

  pendingPaymentKey = null;
  latestReceiptId = payment.id;
  el("paymentForm").reset();
  el("paymentYear").value = schoolYear;
  el("paymentTerm").value = term;
  message.textContent = "Payment saved. Receipt number: " + payment.receiptNumber;

  renderReceipt(payment);
  renderPaymentHistory();
  updateDashboard();
});

function renderReceipt(payment) {
  const display = el("receiptDisplay");
  display.replaceChildren();

  const receiptBox = document.createElement("div");
  receiptBox.id = "printableReceipt";

  const heading = document.createElement("h3");
  heading.textContent = payment.voided ? "VOIDED PAYMENT RECEIPT" : "SCHOOL PAYMENT RECEIPT";
  receiptBox.appendChild(heading);

  if (payment.voided) {
    const banner = document.createElement("p");
    banner.className = "void-banner";
    banner.textContent = "VOIDED on " + formatDate(payment.voidedAt) +
      " by " + payment.voidedBy + ". Reason: " + payment.voidReason;
    receiptBox.appendChild(banner);
  }

  const charges = getChargeTotal(payment.studentId, payment.schoolYear, payment.term);
  const paid = getStudentPaid(payment.studentId, payment.schoolYear, payment.term);
  const balance = charges - paid;

  const fields = [
    ["Receipt number", payment.receiptNumber],
    ["Date", formatDate(payment.date)],
    ["Student", payment.studentName],
    ["Admission number", payment.admissionNo],
    ["Class", payment.studentClass],
    ["School year", payment.schoolYear],
    ["Term", payment.term],
    ["Payment method", payment.method],
    ["Amount received", formatNaira(payment.amount)],
    ["Charges recorded for this period", formatNaira(charges)],
    ["Total paid this period", formatNaira(paid)],
    ["Balance for this period", formatNaira(balance)]
  ];

  fields.forEach(([label, value]) => {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    p.append(strong, document.createTextNode(value));
    receiptBox.appendChild(p);
  });

  if (payment.note) {
    const p = document.createElement("p");
    p.textContent = "Note: " + payment.note;
    receiptBox.appendChild(p);
  }

  const footer = document.createElement("p");
  footer.textContent = payment.voided
    ? "This receipt is no longer valid. The payment was voided and is not counted in any balance."
    : "Thank you. Please keep this receipt for your records.";
  receiptBox.appendChild(footer);
  display.appendChild(receiptBox);
  el("printReceipt").hidden = false;
}

el("printReceipt").addEventListener("click", () => {
  const payment = schoolData.payments.find(p => p.id === latestReceiptId);
  if (!payment) return;
  renderReceipt(payment);
  document.body.classList.add("printing-receipt");
window.print();
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-receipt");
}, { once: true });
});

// ---------------- PAYMENT HISTORY ----------------


function renderPaymentHistory() {
    const table = el("paymentHistoryTable");
    const studentId = el("paymentHistoryStudent").value;
    const search = el("paymentHistorySearch").value
      .trim()
      .toLowerCase();
    const year = el("paymentHistoryYear").value.trim().toLowerCase();
    const term = el("paymentHistoryTerm").value;
  
    table.replaceChildren();
  
    const payments = [...schoolData.payments]
      .filter(payment => {
        const matchesStudent =
          !studentId || payment.studentId === studentId;
  
        const searchableText = [
          payment.receiptNumber,
          payment.studentName,
          payment.admissionNo
        ].join(" ").toLowerCase();
  
        const matchesSearch =
          !search || searchableText.includes(search);
  
        const matchesYear =
          !year ||
          String(payment.schoolYear || "").toLowerCase().includes(year);
  
        const matchesTerm =
          !term || payment.term === term;
  
        return (
          matchesStudent &&
          matchesSearch &&
          matchesYear &&
          matchesTerm
        );
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  
    if (!payments.length) {
      const row = table.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 8;
      cell.textContent = "No matching payments found.";
      return;
    }
  
    payments.forEach(payment => {
      const row = table.insertRow();
      const receiptCell = row.insertCell();
      const button = document.createElement("button");
  
      button.type = "button";
      button.className = "delete-fee-btn";
      button.textContent = payment.receiptNumber;
  
      button.addEventListener("click", () => {
        latestReceiptId = payment.id;
        renderReceipt(payment);
  
        showView("payments");
        el("receiptSection").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
  
      receiptCell.appendChild(button);
  
      [
        formatDate(payment.date),
        payment.studentName,
        payment.admissionNo,
        payment.schoolYear + " / " + payment.term,
        payment.method || "—",
        formatNaira(payment.amount)
      ].forEach(value => {
        row.insertCell().textContent = value;
      });

      const statusCell = row.insertCell();

      if (payment.voided) {
        row.className = "voided-row";
        statusCell.className = "void-status";
        statusCell.textContent = "Voided";
        statusCell.title = "Reason: " + payment.voidReason +
          " (by " + payment.voidedBy + ", " + formatDate(payment.voidedAt) + ")";
      } else {
        const voidButton = document.createElement("button");
        voidButton.type = "button";
        voidButton.className = "delete-fee-btn";
        voidButton.textContent = "Void";
        voidButton.addEventListener("click", () => openVoidPanel(payment));
        statusCell.appendChild(voidButton);
      }
    });
  }
  

el("paymentHistoryStudent").addEventListener("change", renderPaymentHistory);


el("paymentHistorySearch").addEventListener(
    "input",
    renderPaymentHistory
  );
  
  el("paymentHistoryYear").addEventListener(
    "input",
    renderPaymentHistory
  );
  
  el("paymentHistoryTerm").addEventListener(
    "change",
    renderPaymentHistory
  );
  

// ---------------- VOID A PAYMENT ----------------
// A voided payment is never deleted. It stays in the records with a reason,
// who voided it and when, but is no longer counted in any total or balance.

let voidTargetId = null;

function openVoidPanel(payment) {
  voidTargetId = payment.id;
  el("voidTarget").textContent =
    "Receipt " + payment.receiptNumber + " — " + payment.studentName +
    " — " + formatNaira(payment.amount) + " (" + payment.method + ")";
  el("voidMessage").textContent = "";
  el("voidPanel").hidden = false;
  el("voidReason").focus();
  el("voidPanel").scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeVoidPanel() {
  voidTargetId = null;
  el("voidPanel").reset();
  el("voidPanel").hidden = true;
}

el("cancelVoid").addEventListener("click", closeVoidPanel);

el("voidPanel").addEventListener("submit", event => {
  event.preventDefault();

  const message = el("voidMessage");
  const payment = schoolData.payments.find(p => p.id === voidTargetId);
  const reason = el("voidReason").value.trim();
  const voidedBy = el("voidedBy").value.trim();

  if (!payment || payment.voided) {
    message.textContent = "This payment is no longer available to void.";
    return;
  }
  if (reason.length < 3 || !voidedBy) {
    message.textContent = "Enter a reason and the name of the person voiding.";
    return;
  }

  payment.voided = true;
  payment.voidReason = reason;
  payment.voidedBy = voidedBy;
  payment.voidedAt = new Date().toISOString();

  if (!saveData()) {
    delete payment.voided;
    delete payment.voidReason;
    delete payment.voidedBy;
    delete payment.voidedAt;
    message.textContent = "Could not save. The payment was not voided.";
    return;
  }

  const receiptNumber = payment.receiptNumber;
  closeVoidPanel();
  setText("paymentMessage", "Receipt " + receiptNumber + " has been voided.");

  if (latestReceiptId === payment.id) renderReceipt(payment);
  renderPaymentHistory();
  if (latestStatement) renderStatement(latestStatement);
  updateDashboard();
});

// ---------------- STATEMENT OF ACCOUNT ----------------

el("statementForm").addEventListener("submit", event => {
  event.preventDefault();

  const student = getStudentById(el("statementStudent").value);
  const year = el("statementYear").value.trim();
  const term = el("statementTerm").value;
  const message = el("statementMessage");

  if (!student || !year || !term) {
    message.textContent = "Select a student, school year and term.";
    return;
  }

  if (!ensureCharges(student, year, term)) {
    message.textContent = "Could not save fee charges. Statement was not generated.";
    return;
  }

  latestStatement = { studentId: student.id, year, term };
  renderStatement(latestStatement);
  updateDashboard();
  message.textContent = "Statement generated.";
});

function renderStatement(selection) {
  const student = getStudentById(selection.studentId);
  const display = el("statementDisplay");
  display.replaceChildren();

  if (!student) {
    display.textContent = "Student not found.";
    el("printStatement").hidden = true;
    return;
  }

  const charges = getChargesForPeriod(student.id, selection.year, selection.term);
  const payments = getStudentPayments(student.id, selection.year, selection.term)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const totalCharges = charges.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalPaid = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const balance = totalCharges - totalPaid;

  const box = document.createElement("div");
  box.id = "printableStatement";

  const heading = document.createElement("h3");
  heading.textContent = "STUDENT STATEMENT OF ACCOUNT";
  box.appendChild(heading);

  [
    ["Student", student.name],
    ["Admission number", student.admissionNo],
    ["Class", student.studentClass],
    ["Parent/guardian", (schoolData.families.find(f => f.id === student.familyId) || {}).parentName || "Not recorded"],
    ["School year", selection.year],
    ["Term", selection.term]
  ].forEach(([label, value]) => {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    p.append(strong, document.createTextNode(value));
    box.appendChild(p);
  });

  const chargeHeading = document.createElement("h4");
  chargeHeading.textContent = "Charges for this period";
  box.appendChild(chargeHeading);

  const chargeTable = document.createElement("table");
  chargeTable.className = "statement-table";
  const chargeHead = chargeTable.createTHead().insertRow();
  ["Fee", "Fee type", "Amount"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    chargeHead.appendChild(th);
  });

  const chargeBody = chargeTable.createTBody();
  if (!charges.length) {
    const row = chargeBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 3;
    cell.textContent = "No charges recorded for this period.";
  }

  charges.forEach(charge => {
    const row = chargeBody.insertRow();
    [charge.feeName, charge.period, formatNaira(charge.amount)]
      .forEach(value => row.insertCell().textContent = value);
  });
  box.appendChild(chargeTable);

  const paymentHeading = document.createElement("h4");
  paymentHeading.textContent = "Payments received";
  box.appendChild(paymentHeading);

  const paymentTable = document.createElement("table");
  paymentTable.className = "statement-table";
  const paymentHead = paymentTable.createTHead().insertRow();
  ["Date", "Receipt number", "Method", "Amount"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    paymentHead.appendChild(th);
  });

  const paymentBody = paymentTable.createTBody();
  if (!payments.length) {
    const row = paymentBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = "No payments recorded for this period.";
  }

  payments.forEach(payment => {
    const row = paymentBody.insertRow();
    [
      formatDate(payment.date), payment.receiptNumber,
      payment.method, formatNaira(payment.amount)
    ].forEach(value => row.insertCell().textContent = value);
  });
  box.appendChild(paymentTable);

  const totals = document.createElement("div");
  totals.className = "statement-totals";
  [
    ["Total charges", formatNaira(totalCharges)],
    ["Total paid", formatNaira(totalPaid)],
    [balance < 0 ? "Credit balance" : "Outstanding balance", formatNaira(Math.abs(balance))]
  ].forEach(([label, value]) => {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    p.append(strong, document.createTextNode(value));
    totals.appendChild(p);
  });
  box.appendChild(totals);

  const note = document.createElement("p");
  note.className = "statement-note";
  note.textContent = "This statement reflects charges and payments currently recorded for the selected period.";
  box.appendChild(note);

  display.appendChild(box);
  el("printStatement").hidden = false;
}

el("printStatement").addEventListener("click", () => {
  if (!latestStatement) return;
  renderStatement(latestStatement);
  document.body.classList.add("printing-statement");
window.print();
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-statement");
}, { once: true });
});

// ---------------- DASHBOARD ----------------

// Expected fees for one student in one period. This mirrors ensureCharges():
// charges already saved for the period, plus fees that would be charged now,
// without saving anything.
function getExpectedForPeriod(student, year, term) {
  let total = getChargeTotal(student.id, year, term);

  for (const fee of getFeesForStudent(student)) {
    const alreadyCharged = schoolData.charges.some(charge => {
      if (charge.studentId !== student.id || charge.feeId !== fee.id) return false;
      if (fee.period === "Per term") return charge.schoolYear === year && charge.term === term;
      if (fee.period === "Per session") return charge.schoolYear === year;
      return true; // One-time
    });
    if (!alreadyCharged) total += Number(fee.amount);
  }
  return total;
}

function updateDashboard() {
  const { year, term } = getPeriod();
  let expected = 0;
  let collected = 0;
  let outstanding = 0;

  schoolData.students.forEach(student => {
    const owed = getExpectedForPeriod(student, year, term);
    const paid = getStudentPaid(student.id, year, term);
    expected += owed;
    collected += paid;
    outstanding += Math.max(0, owed - paid);
  });

  setText("studentCount", String(schoolData.students.length));
  setText("expected", formatNaira(expected));
  setText("collected", formatNaira(collected));
  setText("outstanding", formatNaira(outstanding));
  setText("dashPeriodLabel", year + " · " + term);
  renderBackupStatus();
}


 // ---------------- FAMILY ACCOUNT VIEW ----------------

 function renderFamilyAccountOptions() {
    const select = el("familyAccountSelect");
    const previous = select.value;
  
    select.replaceChildren(makeOption("", "Select a family"));
  
    schoolData.families.forEach(family => {
      const count = schoolData.students.filter(
        student => student.familyId === family.id
      ).length;
  
      select.appendChild(makeOption(
        family.id,
        family.parentName + " (" + count + " student(s))"
      ));
    });
  
    if (schoolData.families.some(family => family.id === previous)) {
      select.value = previous;
    }
  }
  
  function renderFamilyAccount(familyId, year, term) {
    const display = el("familyAccountDisplay");
    display.replaceChildren();
  
    const family = schoolData.families.find(item => item.id === familyId);
  
    if (!family) {
      display.textContent = "Please select a valid family account.";
      return;
    }
  
    const siblings = schoolData.students.filter(
      student => student.familyId === familyId
    );
  
    const heading = document.createElement("h3");
    heading.textContent = "Family Account — " + family.parentName;
    display.appendChild(heading);
  
    const period = document.createElement("p");
    period.textContent = "School year: " + year + " | Term: " + term;
    display.appendChild(period);
  
    if (!siblings.length) {
      const message = document.createElement("p");
      message.textContent = "No students are linked to this family.";
      display.appendChild(message);
      return;
    }
  
    const table = document.createElement("table");
    table.className = "statement-table";
  
    const thead = table.createTHead();
    const header = thead.insertRow();
  
    [
      "Student",
      "Admission No.",
      "Class",
      "Charges",
      "Paid",
      "Balance",
      "Action"
    ].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
  
    const tbody = table.createTBody();
  
    let familyCharges = 0;
    let familyPayments = 0;
  
    siblings.forEach(student => {
      const row = tbody.insertRow();
  
      const charges = getChargesForPeriod(student.id, year, term)
        .reduce((sum, charge) => sum + Number(charge.amount), 0);
  
      const paid = getStudentPaid(student.id, year, term);
      const balance = charges - paid;
  
      familyCharges += charges;
      familyPayments += paid;
  
      [
        student.name,
        student.admissionNo,
        student.studentClass,
        formatNaira(charges),
        formatNaira(paid),
        balance < 0
          ? "Credit: " + formatNaira(Math.abs(balance))
          : formatNaira(balance)
      ].forEach(value => {
        row.insertCell().textContent = value;
      });
  
      const actionCell = row.insertCell();
      const button = document.createElement("button");
  
      button.type = "button";
      button.className = "primary-btn";
      button.textContent = "View Statement";
  
      button.addEventListener("click", () => {
        if (!ensureCharges(student, year, term)) {
          alert("Could not prepare the student's fee charges.");
          return;
        }
  
        el("statementStudent").value = student.id;
        el("statementYear").value = year;
        el("statementTerm").value = term;
  
        latestStatement = {
          studentId: student.id,
          year,
          term
        };
  
        renderStatement(latestStatement);
        setText("statementMessage", "Statement generated from family account.");
  
        showView("statements");
        el("statementSection").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
  
      actionCell.appendChild(button);
    });
  
    const totals = document.createElement("div");
    totals.className = "statement-totals";
  
    [
      ["Number of siblings", String(siblings.length)],
      ["Family charges for this period", formatNaira(familyCharges)],
      ["Family payments for this period", formatNaira(familyPayments)],
      [
        "Family net balance",
        (familyCharges - familyPayments) < 0
          ? "Credit: " + formatNaira(Math.abs(familyCharges - familyPayments))
          : formatNaira(familyCharges - familyPayments)
      ]
    ].forEach(([label, value]) => {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
  
      strong.textContent = label + ": ";
      p.append(strong, document.createTextNode(value));
      totals.appendChild(p);
    });
  
    display.append(table, totals);
  }
  
  el("familyAccountForm").addEventListener("submit", event => {
    event.preventDefault();
  
    const familyId = el("familyAccountSelect").value;
    const year = el("familyAccountYear").value.trim();
    const term = el("familyAccountTerm").value;
    const message = el("familyAccountMessage");
  
    if (!familyId || !year || !term) {
      message.textContent = "Please select a family, school year and term.";
      return;
    }
  
    const siblings = schoolData.students.filter(
      student => student.familyId === familyId
    );
  
    for (const student of siblings) {
      if (!ensureCharges(student, year, term)) {
        message.textContent = "Could not save charges. Please try again.";
        return;
      }
    }
  
    renderFamilyAccount(familyId, year, term);
    updateDashboard();
    message.textContent = "Family account generated successfully.";
  });
  

 // ---------------- ADMIN REPORTS ----------------

 function renderAdminReport(year, term) {
    const display = el("adminReportDisplay");
    display.replaceChildren();
  
    const heading = document.createElement("h3");
    heading.textContent = "School Fee Report";
    display.appendChild(heading);
  
    const period = document.createElement("p");
    period.textContent = "School year: " + year + " | Term: " + term;
    display.appendChild(period);
  
    let totalCharges = 0;
    let totalPayments = 0;
    let studentsWithBalances = 0;
  
    const reportRows = schoolData.students.map(student => {
      const charges = getChargesForPeriod(student.id, year, term)
        .reduce((sum, charge) => sum + Number(charge.amount), 0);
  
      const paid = getStudentPaid(student.id, year, term);
      const balance = charges - paid;
  
      totalCharges += charges;
      totalPayments += paid;
  
      if (balance > 0) {
        studentsWithBalances++;
      }
  
      return {
        student,
        charges,
        paid,
        balance
      };
    });
  
    const summary = document.createElement("div");
    summary.className = "statement-totals";
  
    [
      ["Registered students", String(schoolData.students.length)],
      ["Students with outstanding balances", String(studentsWithBalances)],
      ["Total fees charged", formatNaira(totalCharges)],
      ["Total payments received", formatNaira(totalPayments)],
      [
        "Total outstanding balance",
        formatNaira(totalCharges - totalPayments)
      ]
    ].forEach(([label, value]) => {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
  
      strong.textContent = label + ": ";
      p.append(strong, document.createTextNode(value));
      summary.appendChild(p);
    });
  
    display.appendChild(summary);
  
    const table = document.createElement("table");
    table.className = "statement-table";
  
    const header = table.createTHead().insertRow();
  
    [
      "Student",
      "Admission No.",
      "Class",
      "Fees Charged",
      "Paid",
      "Balance"
    ].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
  
    const tbody = table.createTBody();
  
    reportRows.forEach(({ student, charges, paid, balance }) => {
      const row = tbody.insertRow();
  
      [
        student.name,
        student.admissionNo,
        student.studentClass,
        formatNaira(charges),
        formatNaira(paid),
        balance < 0
          ? "Credit: " + formatNaira(Math.abs(balance))
          : formatNaira(balance)
      ].forEach(value => {
        row.insertCell().textContent = value;
      });
    });
  
    display.appendChild(table);
  
    if (!reportRows.length) {
      const empty = document.createElement("p");
      empty.textContent = "No students have been registered yet.";
      display.appendChild(empty);
    }
  }
  
  el("adminReportForm").addEventListener("submit", event => {
    event.preventDefault();
  
    const year = el("reportYear").value.trim();
    const term = el("reportTerm").value;
    const message = el("adminReportMessage");
  
    if (!year || !term) {
      message.textContent = "Please select a school year and term.";
      return;
    }
  
    // Ensure each student's charges exist for this period.
    for (const student of schoolData.students) {
      if (!ensureCharges(student, year, term)) {
        message.textContent =
          "Could not prepare the fee records. Please try again.";
        return;
      }
    }
  
    renderAdminReport(year, term);
    updateDashboard();
  
    message.textContent = "Admin report generated successfully.";
  });
  
  el("printAdminReport").addEventListener("click", () => {
    const display = el("adminReportDisplay");
  
    if (!display.querySelector("table")) {
      setText("adminReportMessage", "Generate a report before printing.");
      return;
    }
  
    document.body.classList.add("printing-admin-report");
  
    window.print();
  
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("printing-admin-report");
    }, { once: true });
  });
  

// ---------------- ADMISSION NUMBERS ----------------

function nextAdmissionNo() {
  let highest = 0;
  schoolData.students.forEach(student => {
    const match = /^SCH(\d+)$/i.exec(student.admissionNo || "");
    if (match) highest = Math.max(highest, Number(match[1]));
  });
  return "SCH" + String(highest + 1).padStart(3, "0");
}

function prefillAdmissionNo() {
  el("admissionNo").value = nextAdmissionNo();
}

// ---------------- SCHOOL YEAR (SESSION) AND TERM ----------------

const TERM_NAMES = ["First Term", "Second Term", "Third Term"];

function isValidSchoolYear(value) {
  const match = /^(\d{4})\/(\d{4})$/.exec(value);
  return Boolean(match) && Number(match[2]) === Number(match[1]) + 1;
}

function getPeriod() {
  const saved = schoolData.settings || {};
  return {
    year: isValidSchoolYear(saved.year || "") ? saved.year : "2026/2027",
    term: TERM_NAMES.includes(saved.term) ? saved.term : "First Term"
  };
}

function applyPeriodDefaults() {
  const { year, term } = getPeriod();
  ["paymentYear", "statementYear", "familyAccountYear", "reportYear", "dashYear"]
    .forEach(id => { if (el(id)) el(id).value = year; });
  ["paymentTerm", "statementTerm", "familyAccountTerm", "reportTerm", "dashTerm"]
    .forEach(id => { if (el(id)) el(id).value = term; });
}

function onDashboardPeriodChange() {
  const year = el("dashYear").value.trim();
  const message = el("periodMessage");

  if (!isValidSchoolYear(year)) {
    message.textContent = "Enter the school year like 2026/2027.";
    return;
  }

  const previous = schoolData.settings;
  schoolData.settings = { ...schoolData.settings, year, term: el("dashTerm").value };

  if (!saveData()) {
    schoolData.settings = previous;
    message.textContent = "Could not save the selected period.";
    return;
  }

  message.textContent = "";
  applyPeriodDefaults();
  updateDashboard();
}

el("dashYear").addEventListener("change", onDashboardPeriodChange);
el("dashTerm").addEventListener("change", onDashboardPeriodChange);

// ---------------- NAVIGATION ----------------

const VIEWS = ["home", "fees", "payments", "history", "statements", "family", "reports", "backup"];

function openMenu() {
  el("sidebar").classList.add("open");
  el("navOverlay").hidden = false;
  el("menuBtn").setAttribute("aria-expanded", "true");
}

function closeMenu() {
  el("sidebar").classList.remove("open");
  el("navOverlay").hidden = true;
  el("menuBtn").setAttribute("aria-expanded", "false");
}

function showView(name) {
  if (!VIEWS.includes(name)) name = "home";

  VIEWS.forEach(view => { el("view-" + view).hidden = view !== name; });

  document.querySelectorAll(".nav-item").forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (name === "home") updateDashboard();
  closeMenu();
  window.scrollTo(0, 0);
}

el("menuBtn").addEventListener("click", openMenu);
el("closeMenu").addEventListener("click", closeMenu);
el("navOverlay").addEventListener("click", closeMenu);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

// ---------------- EDIT A STUDENT ----------------

let editStudentId = null;
el("editClass").innerHTML = el("studentClass").innerHTML;

function openEditStudent(student) {
  editStudentId = student.id;
  el("editName").value = student.name;
  el("editAdmission").value = student.admissionNo;
  el("editClass").value = student.studentClass;
  el("editedBy").value = "";
  el("editMessage").textContent = "";
  el("editStudentPanel").hidden = false;
  el("editName").focus();
  el("editStudentPanel").scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeEditStudent() {
  editStudentId = null;
  el("editStudentPanel").hidden = true;
  el("editMessage").textContent = "";
}

el("cancelEdit").addEventListener("click", closeEditStudent);

el("editStudentPanel").addEventListener("submit", event => {
  event.preventDefault();

  const message = el("editMessage");
  const student = schoolData.students.find(item => item.id === editStudentId);
  const name = el("editName").value.trim();
  const admissionNo = el("editAdmission").value.trim();
  const studentClass = el("editClass").value;
  const changedBy = el("editedBy").value.trim();

  if (!student) {
    message.textContent = "This student is no longer available.";
    return;
  }
  if (!name || !admissionNo || !studentClass || !changedBy) {
    message.textContent = "Please complete all fields, including who is making the change.";
    return;
  }
  if (schoolData.students.some(other =>
    other.id !== student.id &&
    other.admissionNo.toLowerCase() === admissionNo.toLowerCase()
  )) {
    message.textContent = "Another student already has this admission number.";
    return;
  }

  const changes = [];
  if (student.name !== name) changes.push({ field: "name", from: student.name, to: name });
  if (student.admissionNo !== admissionNo) {
    changes.push({ field: "admission number", from: student.admissionNo, to: admissionNo });
  }
  if (student.studentClass !== studentClass) {
    changes.push({ field: "class", from: student.studentClass, to: studentClass });
  }
  if (!changes.length) {
    message.textContent = "No changes to save.";
    return;
  }

  const snapshot = JSON.stringify(schoolData);

  student.name = name;
  student.admissionNo = admissionNo;
  student.studentClass = studentClass;
  student.edits = student.edits || [];
  student.edits.push({ at: new Date().toISOString(), by: changedBy, changes });

  // Names and admission numbers are copied onto charges and payments, so a
  // correction is carried over. The class on past records stays as it was.
  [...schoolData.charges, ...schoolData.payments].forEach(record => {
    if (record.studentId === student.id) {
      record.studentName = name;
      record.admissionNo = admissionNo;
    }
  });

  if (!saveData()) {
    schoolData = JSON.parse(snapshot);
    message.textContent = "Could not save. The student was not changed.";
    return;
  }

  const classChanged = changes.some(change => change.field === "class");
  closeEditStudent();
  setText(
    "formMessage",
    name + " updated." + (classChanged
      ? " Fees already charged are unchanged; the new class applies to fees charged from now on."
      : "")
  );
  renderStudents();
  renderStudentSelectors();
  renderPaymentHistory();
  if (latestStatement) renderStatement(latestStatement);
  updateDashboard();
});

// ---------------- BACKUP, EXPORT AND RESTORE ----------------

const BACKUP_UNDO_KEY = STORAGE_KEY + "_before_restore";
const BACKUP_REMINDER_DAYS = 7;

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Stop spreadsheet programs treating typed text as a formula.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function toCsv(rows) {
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

async function saveFile(filename, text, mime) {
  // Inside claude.ai the viewer saves the file; in a normal browser it downloads.
  try {
    if (window.claude && typeof window.claude.use === "function") {
      const downloads = await window.claude.use("downloads");
      if (downloads) {
        await downloads.save({ filename, data: text });
        return "saved";
      }
    }
  } catch (error) {
    if (error && error.code === "declined") return "declined";
    console.error("Download capability failed:", error);
  }

  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "saved";
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function renderBackupStatus() {
  const last = (schoolData.settings || {}).lastBackupAt;
  const lastDate = last ? new Date(last) : null;
  const validDate = lastDate && !Number.isNaN(lastDate.getTime());

  setText(
    "lastBackup",
    validDate ? "Last backup downloaded: " + formatDate(last) : "No backup has been downloaded yet."
  );

  const ageDays = validDate ? (Date.now() - lastDate.getTime()) / 86400000 : Infinity;
  el("backupReminder").hidden =
    !(schoolData.students.length > 0 && ageDays > BACKUP_REMINDER_DAYS);
}

el("backupDownload").addEventListener("click", async () => {
  const backup = {
    app: "school-ledger",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: schoolData
  };
  const result = await saveFile(
    "school-ledger-backup-" + todayStamp() + ".json",
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  if (result === "saved") {
    schoolData.settings = { ...schoolData.settings, lastBackupAt: new Date().toISOString() };
    saveData();
    renderBackupStatus();
    setText("backupMessage", "Backup file created. Keep it somewhere safe.");
  } else {
    setText("backupMessage", "Backup was not saved.");
  }
});

el("exportPayments").addEventListener("click", async () => {
  const rows = [[
    "Receipt No.", "Date", "Student", "Admission No.", "Class", "School year",
    "Term", "Method", "Amount", "Note", "Status", "Void reason", "Voided by", "Voided on"
  ]];

  schoolData.payments.forEach(payment => {
    rows.push([
      payment.receiptNumber, payment.date ? payment.date.slice(0, 10) : "",
      payment.studentName, payment.admissionNo, payment.studentClass,
      payment.schoolYear, payment.term, payment.method || "",
      Number(payment.amount), payment.note || "",
      payment.voided ? "Voided" : "Valid",
      payment.voidReason || "", payment.voidedBy || "",
      payment.voidedAt ? payment.voidedAt.slice(0, 10) : ""
    ]);
  });

  const result = await saveFile(
    "school-ledger-payments-" + todayStamp() + ".csv", toCsv(rows), "text/csv"
  );
  setText("backupMessage", result === "saved" ? "Payments file created." : "Export was not saved.");
});

el("exportStudents").addEventListener("click", async () => {
  const rows = [["Admission No.", "Student", "Class", "Parent/guardian"]];

  schoolData.students.forEach(student => {
    const family = schoolData.families.find(item => item.id === student.familyId);
    rows.push([student.admissionNo, student.name, student.studentClass, family ? family.parentName : ""]);
  });

  const result = await saveFile(
    "school-ledger-students-" + todayStamp() + ".csv", toCsv(rows), "text/csv"
  );
  setText("backupMessage", result === "saved" ? "Students file created." : "Export was not saved.");
});

function parseBackup(text) {
  const invalid = { ok: false, error: "This is not a valid School Ledger backup file." };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return invalid;
  }

  const data = parsed && parsed.app === "school-ledger" ? parsed.data : parsed;
  const lists = ["students", "families", "fees", "payments", "charges"];

  if (!data || typeof data !== "object" || !lists.every(key => Array.isArray(data[key]))) {
    return invalid;
  }
  if (data.students.some(item => !item || typeof item.id !== "string" ||
      typeof item.name !== "string" || typeof item.admissionNo !== "string")) {
    return invalid;
  }
  if (data.payments.some(item => !item || typeof item.id !== "string" ||
      !Number.isFinite(Number(item.amount)))) {
    return invalid;
  }

  if (!data.settings || typeof data.settings !== "object") data.settings = {};
  return { ok: true, data, exportedAt: parsed.exportedAt };
}

let pendingRestore = null;

el("restoreFile").addEventListener("change", async () => {
  pendingRestore = null;
  el("restoreConfirm").hidden = true;
  setText("restoreSummary", "");
  setText("restoreMessage", "");

  const file = el("restoreFile").files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    setText("restoreMessage", "This file is too large to be a School Ledger backup.");
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch (error) {
    setText("restoreMessage", "Could not read this file.");
    return;
  }

  const result = parseBackup(text);
  if (!result.ok) {
    setText("restoreMessage", result.error);
    return;
  }

  pendingRestore = result.data;
  const voided = result.data.payments.filter(item => item.voided).length;
  setText(
    "restoreSummary",
    "This backup" + (result.exportedAt ? " (made " + formatDate(result.exportedAt) + ")" : "") +
    " has " + result.data.students.length + " student(s), " +
    result.data.payments.length + " payment(s) (" + voided + " voided) and " +
    result.data.fees.length + " fee(s). Right now this page holds " +
    schoolData.students.length + " student(s) and " + schoolData.payments.length +
    " payment(s). Restoring replaces them."
  );
  el("restoreConfirm").hidden = false;
});

el("restoreConfirm").addEventListener("click", () => {
  if (!pendingRestore) return;

  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current !== null) localStorage.setItem(BACKUP_UNDO_KEY, current);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingRestore));
  } catch (error) {
    setText("restoreMessage", "Could not restore. Browser storage is not available.");
    return;
  }

  setText("restoreMessage", "Backup restored. Reloading...");
  setTimeout(() => location.reload(), 400);
});

function hasUndoRestore() {
  try {
    return localStorage.getItem(BACKUP_UNDO_KEY) !== null;
  } catch (error) {
    return false;
  }
}

el("undoRestore").hidden = !hasUndoRestore();
el("undoRestore").addEventListener("click", () => {
  try {
    const previous = localStorage.getItem(BACKUP_UNDO_KEY);
    if (previous === null) return;
    localStorage.setItem(STORAGE_KEY, previous);
    localStorage.removeItem(BACKUP_UNDO_KEY);
  } catch (error) {
    setText("restoreMessage", "Could not undo. Browser storage is not available.");
    return;
  }
  setText("restoreMessage", "Previous data brought back. Reloading...");
  setTimeout(() => location.reload(), 400);
});

// ---------------- INITIAL DISPLAY ----------------


renderStudents();
renderFees();
renderStudentSelectors();
renderFamilyAccountOptions();
renderPaymentHistory();
applyPeriodDefaults();
prefillAdmissionNo();
updateDashboard();
showView("home");
