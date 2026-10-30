# CSS Information Platform

Computer Science Society platform with three roles: **student**, **officer** and **admin**.
Built from the team's original design (green and gold theme, role selection page, student and officer dashboards).

## How to run

1. Install **Node.js 22.13 or newer** (https://nodejs.org). No `npm install` is needed.
2. Open a terminal in this folder and run:

       node server.js

   (`node server.js --demo` also creates a demo officer and student: `officer / officer123`, `student / student123`.)
3. Open http://localhost:3000

First run creates the admin account: U-connect `admin`, password `admin123`.
**Change it right away** in Manage profile, or set your own before the first run:

    ADMIN_UCONNECT=myadmin ADMIN_PASSWORD=a-strong-password node server.js

## What each role can do

| | Student | Officer | Admin |
|---|---|---|---|
| Log in with created account | yes | yes | yes |
| View events, CBL, achievements, announcements, officers, About | yes | yes | yes |
| Manage own profile and password | yes | yes | yes |
| Send a message (Contact) | yes | yes | yes |
| List of students, read received messages | no | yes | yes |
| Add and edit events, CBL, achievements, announcements | no | yes | yes |
| Delete content | no | no | yes |
| Approve or reject registrations | no | no | yes |
| Edit or delete users, reset passwords | no | no | yes |
| Edit About | no | no | yes |

Registration flow: a person registers, the account is **pending**, the admin checks it and approves or rejects it. Only approved accounts can log in.

## Folder structure

    server.js            backend: REST API + database + serves the website
    package.json
    data/                database (css.db) and signing key are created here on first run
    public/
      index.html         role selection (Student / Officer / Admin)
      login.html         data privacy notice, then log in
      register.html      create an account
      style.css          entry pages style
      css/dashboard.css  dashboard style
      js/                index.js, login.js, register.js, app.js (dashboards)
      Student/stud_dashboard.html
      Officer/Officer_Dashboard.html
      Admin/Admin_Dashboard.html

## Database (SQLite, file `data/css.db`)

- `users` (id, uconnect, name, email, program, year, role, position, status, pw, created_at)
- `events` (id, title, date, venue, details, created_by, created_at)
- `cbl`, `achievements`, `announcements` (id, title, date, details, created_by, created_at)
- `messages` (id, user_id, sender, subject, body, created_at)
- `settings` (key, value), used for the About text

## API

All routes except register and login need `Authorization: Bearer <token>`.

| Method and route | Who |
|---|---|
| POST /api/register, POST /api/login | anyone |
| GET /api/me, PUT /api/me | logged in |
| GET /api/stats | logged in |
| GET /api/{events,cbl,achievements,announcements} | logged in |
| POST, PUT /api/{...} and /api/{...}/:id | officer, admin |
| DELETE /api/{...}/:id | admin |
| GET /api/officers, GET /api/about | logged in |
| GET /api/students | officer, admin |
| PUT /api/about | admin |
| POST /api/messages | logged in |
| GET /api/messages | officer, admin |
| DELETE /api/messages/:id | admin |
| GET /api/admin/users, PATCH and DELETE /api/admin/users/:id | admin |

## Security notes

- Passwords are hashed with scrypt (never stored as plain text).
- Login tokens are signed (HMAC) and expire after 8 hours. Every request re-checks the user in the database, so deleting or rejecting an account takes effect immediately.
- Roles are enforced **on the server** for every route, not only by hiding menu items.
- Database queries are parameterized; page output is escaped; there are 8 login attempts per 10 minutes per user and IP.
- When you put this online, use **HTTPS** (Render, Railway, or any host that provides it) and keep `data/` backed up.

## Things to replace with your own

- Data privacy notice text in `public/login.html`
- Contact details in `public/js/app.js` (search for `nvsu_u_connect`)
- The About text (admin: About, Edit background)
- The sample events and announcement

## Passwords: Remember me and Forgot password

- **Remember me** (login page) keeps a person logged in on that device for **7 days**. Without it, the login lasts 8 hours and ends when the tab is closed.
- **Forgot password?** (right of the Password box) lets a person send a request with their U-connect and registered email. No email is sent. The request appears for the admin under **Password resets** (with a number badge in the menu).
- The admin presses **Reset password**, which creates a **temporary password** shown once. The admin gives it to the person (in person or by message). Admin can also press **Reset password** in **Manage users**, or set a password in **Edit user**.
- A person using a temporary password can only open **Manage profile** until they choose a new password. Changing or resetting a password logs out all older sessions.
- If the **only admin** forgets the password, run this on the computer that runs the server (works even if the server is stopped):

      node server.js --reset-password admin NewTempPassword1

  Then log in with that password and choose a new one.

## Officers (no duplicates)
- **Everyone registers as a student.** The registration form has no "Register as officer" choice any more.
- The **admin adds officers**: *Officers* page > **Add officer** > type name, position, program, year, and an optional official picture (no U-connect). The officer shows on the Officers page right away but is **not** in Manage users and cannot log in. They still have to register using the **same full name**; the registration attaches to the same record (no duplicate), appears in Registrations, and the admin approves it.
- The new officer appears on the **Officers page for students, officers and the admin** right away, and they log in on the **Officer** page with the password they chose when they registered.
- **Remove officer** (admin) turns the person back into a student. Their account and data stay.
- If an old database already has the same person twice (one registered as an officer and one typed by the admin), open **Manage users** and delete the extra account.

## Passwords
Passwords must be at least **8 characters** (registration, changing your password, and admin resets).

## Install as an app (PWA)
The site can be installed on a phone or computer (manifest, service worker, icons and an offline page are in `public/`). The login pages show an **Install app** button when the browser allows it.
