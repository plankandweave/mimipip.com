import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContactRows } from "./trade-contacts-import";

// The exact shape of the Design Mumbai sheets: an unlabelled title column
// ("Ar" / "Client" / "n"), split names, floats for mobiles, sparse emails.
test("Design Mumbai sheet: title column becomes kind, floats become mobiles", () => {
  const rows = parseContactRows([
    ["", "First name", "Last name", "Mobile", "Email", "Company Name", "City", "Website"],
    ["Ar", "Aashitha", "", "9821427788.0", "", "Red Architects", "", ""],
    ["Client", "Ajay", "Nahar ", "", "info@naharprojects.com", "Nahar Design", "", ""],
    ["n", "Abhijit", "Joshi", "9821146493", "", "", "Mumbai", ""],
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { first_name: "Aashitha", kind: "architect", firm: "Red Architects", mobile: "9821427788" });
  assert.equal(rows[1].kind, "client");
  assert.equal(rows[1].last_name, "Nahar");
  assert.equal(rows[1].email, "info@naharprojects.com");
  assert.equal(rows[2].kind, undefined); // "n" says nothing; the DB defaults to designer
});

test("a row with neither mobile nor email is dropped, not fatal", () => {
  const rows = parseContactRows([
    ["Name", "Phone", "Email"],
    ["Ar. Priya Shah", "", ""],
    ["Rohan Mehta", "98200 12345", ""],
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { first_name: "Rohan", last_name: "Mehta", mobile: "98200 12345" });
});

test("single name column loses the title and splits", () => {
  const [r] = parseContactRows([["Full Name", "WhatsApp"], ["Ar. Ali Baldiwala", "9820087309"]]);
  assert.equal(r.first_name, "Ali");
  assert.equal(r.last_name, "Baldiwala");
});

test("several sheets each carry their own header", () => {
  const rows = parseContactRows([
    ["Name", "Mobile"], ["A One", "9000000001"],
    ["__sheet_break__"],
    ["Email", "Contact Name"], ["b@two.com", "B Two"],
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].first_name, "B");
  assert.equal(rows[1].email, "b@two.com");
});

test("an email in the phone column is still an email", () => {
  const [r] = parseContactRows([["Name", "Phone"], ["C Three", "c@three.in"]]);
  assert.equal(r.email, "c@three.in");
  assert.equal(r.mobile, undefined);
});
