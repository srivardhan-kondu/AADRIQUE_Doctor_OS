# Accounts and security

## Your first sign-in

The administrator gives you your email and a **temporary password**. Sign in
with them; you are taken straight to **Choose your password** and cannot open
anything else until you have.

A good password is **at least 10 characters** — a short phrase works well
("monsoon tea at four"). Very common passwords and ones containing your email
name are refused.

## Changing your password

Account menu (initials, top right) → **Change password** → your current
password, the new one twice → **Change password**. Every *other* device you
are signed in on is signed out; this one stays signed in.

## Forgot your password?

On the sign-in page → **Forgot password?** → your email → **Send reset link**.

- **If the clinic has email set up**, you receive a link. It works **once**,
  for **30 minutes**. Open it, choose a new password twice → **Set new
  password**, then sign in. Every other session is signed out.
- **If email is not set up**, your administrator is notified that you need a
  reset. They will give you a one-time password (see Admin guide → Staff).

The page gives the same answer whatever email is typed, so it cannot be used
to find out who has an account. An expired or used link says so — ask for a
new one.

## Two-factor sign-in

An extra step after your password: a six-digit code from an authenticator app
on your phone (Google Authenticator, Microsoft Authenticator, 1Password or
similar). Strongly recommended for doctors and administrators.

**Turning it on**

1. Account menu → **Two-factor sign-in** → **Set up two-factor**.
2. Scan the QR code with the app (or type the key shown under it, or tap
   *open it in the app* on your phone).
3. Type the code the app shows → **Turn on two-factor**.

It only switches on once a correct code proves the app is set up, so a
failed setup cannot lock you out.

**Signing in with it**: email and password as usual → **Authenticator code**
appears → type the six digits → **Sign in**. Each code works once; if you
just used one, wait for the next.

**Turning it off**: account menu → **Two-factor sign-in** → type a current
code → **Turn off two-factor**.

**Lost your phone?** Ask your administrator to reset your password. That also
turns off two-factor; set it up again afterwards.

## Sessions

- You stay signed in on a device until you **Sign out** (account menu).
- A password change or reset, or removal of your access, **ends your sessions
  immediately** — the next click takes you to sign-in with a note saying why.
- Too many wrong passwords lock sign-in for that account for a few minutes.

## What is recorded

Signing in, signing records, prescriptions, opening documents, exports,
password changes and setting changes are written to the audit log with who
and when. Patient data is never included in error reports.
