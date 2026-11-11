
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const session = require("express-session");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// DATABASE CONNECTION
const dbConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("localhost")
            ? false
            : { rejectUnauthorized: false }
    }
    : {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5433,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || "it_ticket_system"
    };

const pool = new Pool(dbConfig);

pool.on("error", error => {
    console.error("Database error:", error);
});

// MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use("/static", express.static(path.join(__dirname, "static")));

// HELPER FUNCTIONS
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).send("Access denied. Admin only.");
    }

    next();
}

function escapeHTML(value) {
    return String(value ?? "-").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// REUSABLE ADMIN TABLE PAGE
function renderAdminTable(title, subtitle, headers, rows, emptyMessage) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHTML(title)}</title>
            <style>
                * { box-sizing: border-box; }

                body {
                    margin: 0;
                    padding: 40px 20px;
                    font-family: Arial, sans-serif;
                    background: #f1f5f9;
                    color: #1e293b;
                }

                .container {
                    max-width: 1200px;
                    margin: auto;
                    background: white;
                    padding: 28px;
                    border-radius: 14px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.06);
                }

                h1 {
                    color: #2563eb;
                    margin-top: 0;
                }

                .subtitle {
                    color: #64748b;
                    margin-bottom: 25px;
                }

                .table-wrapper { overflow-x: auto; }

                table {
                    width: 100%;
                    min-width: 650px;
                    border-collapse: collapse;
                    text-align: left;
                }

                th {
                    background: #2563eb;
                    color: white;
                    padding: 15px;
                    white-space: nowrap;
                }

                td {
                    padding: 15px;
                    border-bottom: 1px solid #e2e8f0;
                }

                tr:nth-child(even) { background: #f8fafc; }
                tr:hover { background: #eff6ff; }

                button, .back {
                    display: inline-block;
                    background: #2563eb;
                    color: white;
                    padding: 10px 14px;
                    border: none;
                    border-radius: 7px;
                    text-decoration: none;
                    cursor: pointer;
                    font-size: 14px;
                }

                button:hover, .back:hover { background: #1d4ed8; }

                .back { margin-top: 22px; }
                form { margin: 0; }

                .empty {
                    text-align: center;
                    padding: 30px;
                    color: #64748b;
                }

                @media (max-width: 600px) {
                    body { padding: 18px 10px; }
                    .container { padding: 16px; }
                }
            </style>
        </head>
        <body>
            <main class="container">
                <h1>${escapeHTML(title)}</h1>
                <p class="subtitle">${escapeHTML(subtitle)}</p>

                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                ${headers.map(h => `<th>${escapeHTML(h)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || `<tr><td colspan="${headers.length}" class="empty">${escapeHTML(emptyMessage)}</td></tr>`}
                        </tbody>
                    </table>
                </div>

                <a class="back" href="/admin/dashboard">Back to Admin Dashboard</a>
            </main>
        </body>
        </html>
    `;
}

// HOME
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "index.html"));
});

// LOGIN PAGE
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "login.html"));
});

// REGISTER PAGE
app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "register.html"));
});

// EMPLOYEE DASHBOARD
app.get("/dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "dashboard.html"));
});

// ADMIN DASHBOARD
app.get("/admin/dashboard", requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "admin_dashboard.html"));
});

// ADMIN: ASSIGN TICKET TO TECHNICIAN
app.post("/admin/tickets/:id/assign", requireAdmin, async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const technicianId = Number(req.body.technician_id);

        if (!Number.isInteger(ticketId) || ticketId <= 0 ||
            !Number.isInteger(technicianId) || technicianId <= 0) {
            return res.status(400).send("Please choose a valid technician.");
        }

        const technician = await pool.query(
            "SELECT id FROM users WHERE id = $1 AND role = 'technician'",
            [technicianId]
        );

        if (technician.rows.length === 0) {
            return res.status(400).send("Selected technician was not found.");
        }

        const updated = await pool.query(
            `UPDATE tickets
             SET assigned_to = $1,
                 status = 'in-progress',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id`,
            [technicianId, ticketId]
        );

        if (updated.rows.length === 0) {
            return res.status(404).send("Ticket not found.");
        }

        return res.redirect("/admin/tickets");
    } catch (error) {
        console.error("Ticket Assignment Error:", error);
        return res.status(500).send("Unable to assign ticket.");
    }
});

// ADMIN: ALL TICKETS
app.get("/admin/tickets", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                tickets.*,
                users.name AS employee_name,
                users.email AS employee_email,
                technician.name AS technician_name
            FROM tickets
            LEFT JOIN users ON tickets.created_by = users.id
            LEFT JOIN users AS technician ON tickets.assigned_to = technician.id
            ORDER BY tickets.created_at DESC
        `);

        const tickets = result.rows;

        const technicianResult = await pool.query(
            "SELECT id, name FROM users WHERE role = 'technician' ORDER BY name ASC"
        );

        const technicians = technicianResult.rows;

        const total = tickets.length;

        const open = tickets.filter(ticket =>
            String(ticket.status).toLowerCase() === "open"
        ).length;

        const inProgress = tickets.filter(ticket =>
            String(ticket.status).toLowerCase().replace(/\s+/g, "-") === "in-progress"
        ).length;

        const resolved = tickets.filter(ticket =>
            String(ticket.status).toLowerCase() === "resolved"
        ).length;

        const rows = tickets.map(ticket => {
            const priority = String(ticket.priority || "medium").toLowerCase();

            const status = String(ticket.status || "open")
                .toLowerCase()
                .replace(/\s+/g, "-");

            return `
                <tr>
                    <td class="ticket-id">#${escapeHTML(ticket.id)}</td>

                    <td class="title-cell">
                        ${escapeHTML(ticket.title)}
                    </td>

                    <td>
                        <div class="employee-name">
                            ${escapeHTML(ticket.employee_name)}
                        </div>

                        <div class="employee-email">
                            ${escapeHTML(ticket.employee_email)}
                        </div>
                    </td>

                    <td>${escapeHTML(ticket.category)}</td>

                    <td>
                        <span class="badge priority-${escapeHTML(priority)}">
                            ${escapeHTML(ticket.priority)}
                        </span>
                    </td>

                    <td>
                        <span class="badge status-${escapeHTML(status)}">
                            ${escapeHTML(ticket.status)}
                        </span>
                    </td>

                    <td>
                        ${ticket.technician_name
                            ? `<span class="assigned-name">${escapeHTML(ticket.technician_name)}</span>`
                            : `<span class="unassigned-name">Not assigned</span>`}

                        <form method="POST"
                              action="/admin/tickets/${Number(ticket.id)}/assign"
                              class="assign-form">

                            <select name="technician_id" required aria-label="Choose technician">
                                <option value="">Choose technician</option>

                                ${technicians.map(technician => `
                                    <option
                                        value="${Number(technician.id)}"
                                        ${Number(ticket.assigned_to) === Number(technician.id) ? "selected" : ""}>
                                        ${escapeHTML(technician.name)}
                                    </option>
                                `).join("")}
                            </select>

                            <button type="submit">
                                ${ticket.assigned_to ? "Reassign" : "Assign"}
                            </button>
                        </form>
                    </td>

                    <td class="date-cell">
                        ${escapeHTML(
                            ticket.created_at
                                ? new Date(ticket.created_at).toLocaleString("en-IN")
                                : "-"
                        )}
                    </td>
                </tr>
            `;
        }).join("");

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>All Tickets | Admin Panel</title>

                <style>
                    * { box-sizing: border-box; }

                    body {
                        margin: 0;
                        padding: 35px 20px;
                        font-family: Arial, sans-serif;
                        background: #f1f5f9;
                        color: #1e293b;
                    }

                    .container {
                        max-width: 1450px;
                        margin: auto;
                    }

                    .header { margin-bottom: 25px; }

                    h1 {
                        margin: 0 0 9px;
                        font-size: 32px;
                        color: #2563eb;
                    }

                    .subtitle {
                        color: #64748b;
                        margin: 0;
                        font-size: 15px;
                    }

                    .summary {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 18px;
                        margin-bottom: 25px;
                    }

                    .summary-card {
                        background: white;
                        padding: 22px;
                        border-radius: 12px;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                        border-left: 4px solid #2563eb;
                    }

                    .summary-card p {
                        margin: 0 0 10px;
                        color: #64748b;
                        font-size: 14px;
                    }

                    .summary-card h2 {
                        margin: 0;
                        font-size: 29px;
                    }

                    .open-card { border-color: #f59e0b; }
                    .progress-card { border-color: #3b82f6; }
                    .resolved-card { border-color: #22c55e; }

                    .table-card {
                        background: white;
                        padding: 25px;
                        border-radius: 14px;
                        box-shadow: 0 5px 20px rgba(0,0,0,0.06);
                    }

                    .table-top {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 15px;
                        flex-wrap: wrap;
                        margin-bottom: 20px;
                    }

                    .table-top h2 {
                        margin: 0;
                        font-size: 20px;
                    }

                    .search-box {
                        width: 280px;
                        max-width: 100%;
                        padding: 11px 14px;
                        border: 1px solid #cbd5e1;
                        border-radius: 8px;
                        font-size: 14px;
                        outline: none;
                    }

                    .search-box:focus { border-color: #2563eb; }

                    .table-wrapper {
                        width: 100%;
                        overflow-x: auto;
                    }

                    table {
                        width: 100%;
                        min-width: 1050px;
                        border-collapse: collapse;
                        text-align: left;
                    }

                    th {
                        background: #2563eb;
                        color: white;
                        padding: 16px 14px;
                        font-size: 14px;
                        white-space: nowrap;
                    }

                    th:first-child { border-radius: 8px 0 0 0; }
                    th:last-child { border-radius: 0 8px 0 0; }

                    td {
                        padding: 17px 14px;
                        border-bottom: 1px solid #e2e8f0;
                        font-size: 14px;
                        vertical-align: middle;
                    }

                    tbody tr:nth-child(even) { background: #f8fafc; }
                    tbody tr:hover { background: #eff6ff; }

                    .ticket-id {
                        color: #2563eb;
                        font-weight: bold;
                    }

                    .title-cell {
                        min-width: 160px;
                        font-weight: 600;
                    }

                    .employee-name {
                        font-weight: 600;
                        white-space: nowrap;
                    }

                    .employee-email {
                        color: #64748b;
                        font-size: 12px;
                        margin-top: 5px;
                        overflow-wrap: anywhere;
                    }

                    .badge {
                        display: inline-block;
                        padding: 7px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: bold;
                        white-space: nowrap;
                    }

                    .priority-low {
                        background: #dcfce7;
                        color: #15803d;
                    }

                    .priority-medium {
                        background: #fef3c7;
                        color: #b45309;
                    }

                    .priority-high {
                        background: #fee2e2;
                        color: #b91c1c;
                    }

                    .priority-urgent {
                        background: #7f1d1d;
                        color: white;
                    }

                    .status-open {
                        background: #fef3c7;
                        color: #b45309;
                    }

                    .status-in-progress {
                        background: #dbeafe;
                        color: #1d4ed8;
                    }

                    .status-resolved {
                        background: #dcfce7;
                        color: #15803d;
                    }

                    .date-cell {
                        min-width: 180px;
                        color: #64748b;
                        white-space: nowrap;
                    }

                    .empty-message {
                        text-align: center;
                        padding: 35px;
                        color: #64748b;
                    }

                    .back-link {
                        display: inline-block;
                        margin-top: 23px;
                        padding: 12px 19px;
                        background: #2563eb;
                        color: white;
                        text-decoration: none;
                        border-radius: 8px;
                        font-size: 14px;
                    }

                    .back-link:hover { background: #1d4ed8; }

                    .assigned-name {
                        display: block;
                        font-weight: 600;
                        margin-bottom: 6px;
                    }

                    .unassigned-name {
                        display: block;
                        color: #d97706;
                        font-size: 13px;
                        margin-bottom: 6px;
                    }

                    .assign-form {
                        display: flex;
                        gap: 6px;
                        align-items: center;
                        min-width: 210px;
                    }

                    .assign-form select {
                        min-width: 120px;
                        padding: 7px;
                        border: 1px solid #cbd5e1;
                        border-radius: 6px;
                        background: white;
                    }

                    .assign-form button {
                        padding: 8px 10px;
                        border: 0;
                        border-radius: 6px;
                        background: #2563eb;
                        color: white;
                        cursor: pointer;
                    }

                    .assign-form button:hover {
                        background: #1d4ed8;
                    }

                    @media (max-width: 750px) {
                        .summary {
                            grid-template-columns: repeat(2, 1fr);
                        }

                        .table-card { padding: 16px; }
                        h1 { font-size: 26px; }
                    }

                    @media (max-width: 420px) {
                        .summary {
                            grid-template-columns: 1fr;
                        }
                    }
                </style>
            </head>

            <body>
                <main class="container">

                    <header class="header">
                        <h1>All Tickets</h1>

                        <p class="subtitle">
                            Monitor and manage IT complaints submitted by employees.
                        </p>
                    </header>

                    <section class="summary">

                        <div class="summary-card">
                            <p>Total Tickets</p>
                            <h2>${total}</h2>
                        </div>

                        <div class="summary-card open-card">
                            <p>Open Tickets</p>
                            <h2>${open}</h2>
                        </div>

                        <div class="summary-card progress-card">
                            <p>In Progress</p>
                            <h2>${inProgress}</h2>
                        </div>

                        <div class="summary-card resolved-card">
                            <p>Resolved</p>
                            <h2>${resolved}</h2>
                        </div>

                    </section>

                    <section class="table-card">

                        <div class="table-top">
                            <h2>Submitted IT Tickets</h2>

                            <input
                                type="search"
                                id="ticketSearch"
                                class="search-box"
                                placeholder="Search tickets..."
                                oninput="searchTickets()"
                                aria-label="Search tickets"
                            >
                        </div>

                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Ticket ID</th>
                                        <th>Title</th>
                                        <th>Employee</th>
                                        <th>Category</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                        <th>Assigned Technician</th>
                                        <th>Created At</th>
                                    </tr>
                                </thead>

                                <tbody id="ticketTable">
                                    ${rows || `
                                        <tr>
                                            <td colspan="8" class="empty-message">
                                                No tickets have been submitted yet.
                                            </td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>

                        <a href="/admin/dashboard" class="back-link">
                            Back to Admin Dashboard
                        </a>

                    </section>
                </main>

                <script>
                    function searchTickets() {
                        const searchValue = document
                            .getElementById("ticketSearch")
                            .value.toLowerCase();

                        document.querySelectorAll("#ticketTable tr").forEach(row => {
                            row.style.display = row.textContent
                                .toLowerCase()
                                .includes(searchValue) ? "" : "none";
                        });
                    }
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Admin Tickets Error:", error);
        res.status(500).send("Unable to load tickets.");
    }
});

// ADMIN: MANAGE EMPLOYEES
app.get("/admin/users", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, email, created_at
            FROM users
            WHERE role = 'employee'
            ORDER BY created_at DESC
        `);

        const rows = result.rows.map(user => `
            <tr>
                <td>${escapeHTML(user.id)}</td>
                <td>${escapeHTML(user.name)}</td>
                <td>${escapeHTML(user.email)}</td>
                <td>Employee</td>
                <td>
                    <form method="POST"
                          action="/admin/users/${Number(user.id)}/make-technician">
                        <button type="submit">Make Technician</button>
                    </form>
                </td>
            </tr>
        `).join("");

        res.send(renderAdminTable(
            "Manage Employees",
            "View registered employees and assign technician roles.",
            ["ID", "Name", "Email", "Role", "Action"],
            rows,
            "No employees found."
        ));

    } catch (error) {
        console.error("Manage Employees Error:", error);
        res.status(500).send("Unable to load employees.");
    }
});

// ADMIN: MANAGE TECHNICIANS
app.get("/admin/technicians", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, email, created_at
            FROM users
            WHERE role = 'technician'
            ORDER BY created_at DESC
        `);

        const rows = result.rows.map(user => `
            <tr>
                <td>${escapeHTML(user.id)}</td>
                <td>${escapeHTML(user.name)}</td>
                <td>${escapeHTML(user.email)}</td>
                <td>Technician</td>
                <td>
                    <form method="POST"
                          action="/admin/users/${Number(user.id)}/make-employee">
                        <button type="submit">Make Employee</button>
                    </form>
                </td>
            </tr>
        `).join("");

        res.send(renderAdminTable(
            "Manage Technicians",
            "View and manage registered technicians.",
            ["ID", "Name", "Email", "Role", "Action"],
            rows,
            "No technicians found."
        ));

    } catch (error) {
        console.error("Manage Technicians Error:", error);
        res.status(500).send("Unable to load technicians.");
    }
});

// ADMIN: CHANGE EMPLOYEE TO TECHNICIAN
app.post("/admin/users/:id/make-technician", requireAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!Number.isInteger(userId) || userId < 1) {
            return res.status(400).send("Invalid user ID.");
        }

        await pool.query(
            `UPDATE users
             SET role = 'technician'
             WHERE id = $1 AND role = 'employee'`,
            [userId]
        );

        res.redirect("/admin/users");

    } catch (error) {
        console.error("Technician Assignment Error:", error);
        res.status(500).send("Unable to update employee role.");
    }
});

// ADMIN: CHANGE TECHNICIAN TO EMPLOYEE
app.post("/admin/users/:id/make-employee", requireAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!Number.isInteger(userId) || userId < 1) {
            return res.status(400).send("Invalid user ID.");
        }

        await pool.query(
            `UPDATE users
             SET role = 'employee'
             WHERE id = $1 AND role = 'technician'`,
            [userId]
        );

        res.redirect("/admin/technicians");

    } catch (error) {
        console.error("Role Update Error:", error);
        res.status(500).send("Unable to update technician role.");
    }
});

// NEW TICKET PAGE
app.get("/new-ticket", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "new_ticket.html"));
});

// MY TICKETS PAGE
app.get("/my-tickets", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "my_tickets.html"));
});

// HELP PAGE
app.get("/help", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "help.html"));
});

// REGISTER
app.post("/register", async (req, res) => {
    try {
        const { full_name, email, password, confirm_password } = req.body;

        if (!full_name || !email || !password || !confirm_password) {
            return res.status(400).send("Please fill in all fields.");
        }

        if (password.length < 8) {
            return res.status(400).send("Password must contain at least 8 characters.");
        }

        if (password !== confirm_password) {
            return res.status(400).send("Passwords do not match.");
        }

        const cleanEmail = email.trim().toLowerCase();

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [cleanEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).send(
                'Email already registered. <a href="/login">Login here</a>'
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, $4)`,
            [full_name.trim(), cleanEmail, hashedPassword, "employee"]
        );

        res.redirect("/login");

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).send("Registration failed. Check the terminal.");
    }
});

// LOGIN
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send("Please enter your email and password.");
        }

        const cleanEmail = email.trim().toLowerCase();

        const result = await pool.query(
            "SELECT id, name, email, password, role FROM users WHERE email = $1",
            [cleanEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).send(
                'Account not found. <a href="/register">Register here</a>'
            );
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).send(
                'Incorrect password. <a href="/login">Try again</a>'
            );
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        if (user.role === "admin") {
            return res.redirect("/admin/dashboard");
        }

        res.redirect("/dashboard");

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).send("Login failed. Check the terminal.");
    }
});

// CREATE TICKET
app.post("/new-ticket", requireLogin, async (req, res) => {
    try {
        const { title, category, priority, description } = req.body;

        if (!title || !category || !priority || !description) {
            return res.status(400).send(
                'Please fill in all ticket fields. <a href="/new-ticket">Go back</a>'
            );
        }

        const result = await pool.query(
            `INSERT INTO tickets
             (title, description, category, priority, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
                title.trim(),
                description.trim(),
                category,
                priority,
                "open",
                req.session.user.id
            ]
        );

        const ticketId = result.rows[0].id;

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Ticket Submitted</title>
                <link rel="stylesheet" href="/static/style.css">
            </head>
            <body>
                <div class="container">
                    <h2>Ticket submitted successfully!</h2>
                    <p>Your Ticket ID is: ${escapeHTML(ticketId)}</p>
                    <p><a href="/my-tickets">View My Tickets</a></p>
                    <p><a href="/dashboard">Back to Dashboard</a></p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Ticket Submission Error:", error);
        res.status(500).send("Ticket submission failed. Check the terminal.");
    }
});

// API: MY TICKETS
app.get("/api/my-tickets", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, category, priority, status, created_at
             FROM tickets
             WHERE created_by = $1
             ORDER BY created_at DESC`,
            [req.session.user.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("My Tickets Error:", error);
        res.status(500).json({ message: "Unable to load tickets." });
    }
});

// TICKET DETAILS
app.get("/ticket/:id", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM tickets
             WHERE id = $1 AND created_by = $2`,
            [req.params.id, req.session.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).send("Ticket not found.");
        }

        const ticket = result.rows[0];

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Ticket Details</title>
                <link rel="stylesheet" href="/static/style.css">
            </head>
            <body>
                <div class="container">
                    <h1>Ticket Details</h1>

                    <p><strong>Ticket ID:</strong> ${escapeHTML(ticket.id)}</p>
                    <p><strong>Title:</strong> ${escapeHTML(ticket.title)}</p>

                    <p><strong>Description:</strong></p>
                    <p>${escapeHTML(ticket.description)}</p>

                    <p><strong>Category:</strong> ${escapeHTML(ticket.category)}</p>
                    <p><strong>Priority:</strong> ${escapeHTML(ticket.priority)}</p>
                    <p><strong>Status:</strong> ${escapeHTML(ticket.status)}</p>
                    <p><strong>Created At:</strong> ${escapeHTML(ticket.created_at)}</p>

                    <p><a href="/my-tickets">Back to My Tickets</a></p>
                    <p><a href="/dashboard">Back to Dashboard</a></p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Ticket Details Error:", error);
        res.status(500).send("Unable to load ticket details.");
    }
});

// LOGOUT

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// TEST
app.get("/test", (req, res) => {
    res.send("IT Ticket Management System is running successfully!");
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
