# IT Ticket Management System

A web-based IT Ticket Management System that helps employees report technical problems and allows administrators and technicians to manage and resolve support tickets.

#link  : (https://it-ticket-system-tvw4.onrender.com0

## Features

### Employee
- Register and log in securely.
- Create new IT support tickets.
- Select ticket category and priority.
- View submitted tickets.
- Track ticket status.
- View individual ticket details.
- Access Help & FAQs.

### Administrator
- View all submitted tickets.
- View registered employees.
- View technicians.
- Manage employee and technician roles.
- Monitor ticket information.

### Technician
- View assigned support tickets.
- Help resolve technical issues.
- Update ticket progress.

## Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Authentication:** bcrypt and express-session
- **Deployment:** Render
- **Version Control:** Git and GitHub

## Database

The project uses PostgreSQL with the following main tables:

1. `users` – Stores user details, login information and roles.
2. `tickets` – Stores ticket descriptions, categories, priorities and statuses.
3. `ticket_history` – Stores ticket status updates and notes.

## Run the Project Locally

### 1. Clone the repository

```bash
git clone https://github.com/Harishwaranr/IT-Ticket-System.git
```

### 2. Open the project folder

```bash
cd IT-Ticket-System
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_secure_session_secret
```

Replace the example values with your actual database connection string and a secure session secret.

### 5. Start the application

```bash
npm start
```

Open your browser and visit:

```text
http://localhost:3000
```

## Deployment

The application is deployed using Render.

- **Source Code:** GitHub
- **Hosting:** Render Web Service
- **Database:** Render PostgreSQL
- **Build Command:** `npm install`
- **Start Command:** `npm run start`

Configure `DATABASE_URL` and `SESSION_SECRET` in the Render Environment Variables section before deployment.

## Project Purpose

The main objective of this project is to simplify IT support management by providing a centralized platform where employees can report technical issues and administrators can manage support requests efficiently.

## Future Improvements

- Ticket assignment to technicians.
- Email notifications.
- File attachments.
- Advanced ticket analytics.
- Improved role-based access control.

---

**Project:** IT Ticket Management System  
**Repository:** https://github.com/Harishwaranr/IT-Ticket-System
