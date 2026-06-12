"""Branded transactional email templates.

Email HTML is its own dialect: tables for layout, inline styles only, no web
fonts, and a plain-text part alongside so every client (and spam filter) is
happy. Colors mirror the web design tokens (cream/paper/ink/line/terracotta).
"""
from __future__ import annotations

_CREAM = "#f4efe6"
_PAPER = "#fbf8f1"
_INK = "#211e19"
_INK_SOFT = "#4a453c"
_INK_FAINT = "#8a8273"
_LINE = "#e3dbcb"
_TERRACOTTA = "#c2552b"

_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif"
_SERIF = "Georgia, 'Times New Roman', serif"
_MONO = "'Courier New', Courier, monospace"


def otp_email(otp: str, stamp: str, purpose: str = "verify") -> tuple[str, str, str]:
    """Build the OTP email. Returns (subject, text_body, html_body).

    purpose: "verify" (signup / resend) or "reset" (forgot password).
    The code + time stay in the subject so Gmail doesn't thread/collapse
    multiple OTP emails - you can always see which one is newest.
    """
    if purpose == "reset":
        eyebrow = "Reset your password"
        lead = "Use this code to set a new password:"
        subject = f"Sellari AI reset code {otp} (sent {stamp})"
    else:
        eyebrow = "Verify your email"
        lead = "Welcome to Sellari AI. Your verification code:"
        subject = f"Sellari AI code {otp} (sent {stamp})"

    expiry = f"Sent at {stamp}. It expires in 15 minutes and replaces any earlier code."
    ignore = "If you didn't request this, you can safely ignore this email."

    text = f"{eyebrow}\n\n{lead}\n\n{otp}\n\n{expiry}\n{ignore}\n"

    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:{_CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{_CREAM};">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          <!-- Wordmark -->
          <tr>
            <td align="center" style="padding:0 0 28px 0;font-family:{_SANS};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:{_INK};">
              sellari<span style="font-family:{_SERIF};font-style:italic;font-weight:400;">&nbsp;ai</span><span style="color:{_TERRACOTTA};">.</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:{_PAPER};border:1px solid {_LINE};border-top:3px solid {_TERRACOTTA};border-radius:16px;padding:40px 40px 36px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:{_SANS};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:{_INK_FAINT};padding:0 0 14px 0;">
                    {eyebrow}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:{_SANS};font-size:16px;line-height:24px;color:{_INK_SOFT};padding:0 0 24px 0;">
                    {lead}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="background-color:{_CREAM};border:1px solid {_LINE};border-radius:12px;padding:22px 0;">
                    <span style="font-family:{_MONO};font-size:34px;font-weight:700;letter-spacing:10px;color:{_INK};">{otp}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:{_SANS};font-size:13px;line-height:20px;color:{_INK_FAINT};padding:22px 0 0 0;">
                    {expiry}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:26px 8px 0 8px;font-family:{_SANS};font-size:12px;line-height:18px;color:{_INK_FAINT};">
              {ignore}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 8px 0 8px;font-family:{_SERIF};font-style:italic;font-size:13px;color:{_INK_FAINT};">
              Outreach that researches itself.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return subject, text, html
